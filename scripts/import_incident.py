"""Validate, normalize and persist a wildfire incident perimeter."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import geopandas as gpd
import psycopg
from psycopg.rows import dict_row
from pyproj import Geod
from shapely import make_valid
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, mapping
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union


class IncidentImportError(ValueError):
    """Raised when source data cannot produce a valid incident perimeter."""


@dataclass(frozen=True)
class PreparedIncident:
    """A normalized incident ready for a PostGIS transaction."""

    geometry: MultiPolygon
    area_ha: float
    source_feature_count: int
    repaired_feature_count: int

    @property
    def geometry_json(self) -> str:
        return json.dumps(mapping(self.geometry), separators=(",", ":"))


@dataclass(frozen=True)
class IncidentRecord:
    """Incident metadata required by the public database schema."""

    slug: str
    name: str
    external_id: str
    start_date: date
    source_name: str
    source_url: str
    source_date: date | None
    department_codes: tuple[str, ...]
    checksum: str


@dataclass(frozen=True)
class PersistResult:
    incident_id: str
    action: str


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")
    if not slug:
        raise IncidentImportError("Le nom ne permet pas de produire un slug valide.")
    return slug


def _polygon_parts(geometry: BaseGeometry) -> list[Polygon]:
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, MultiPolygon):
        return list(geometry.geoms)
    if isinstance(geometry, GeometryCollection):
        return [part for child in geometry.geoms for part in _polygon_parts(child)]
    return []


def _repair_polygonal(geometry: BaseGeometry, feature_index: int) -> tuple[list[Polygon], bool]:
    if geometry is None or geometry.is_empty:
        raise IncidentImportError(f"La géométrie {feature_index} est vide.")
    if geometry.geom_type not in {"Polygon", "MultiPolygon"}:
        raise IncidentImportError(
            f"La géométrie {feature_index} est de type {geometry.geom_type}, un polygone est requis."
        )

    repaired = not geometry.is_valid
    candidate = make_valid(geometry) if repaired else geometry
    parts = [part for part in _polygon_parts(candidate) if not part.is_empty and part.area > 0]
    if not parts:
        raise IncidentImportError(f"La géométrie {feature_index} est invalide et non réparable.")
    return parts, repaired


def _as_multipolygon(geometry: BaseGeometry) -> MultiPolygon:
    parts = _polygon_parts(geometry)
    if not parts:
        raise IncidentImportError("La dissolution ne produit aucune surface polygonale.")
    result = MultiPolygon(parts)
    if result.is_empty or not result.is_valid:
        raise IncidentImportError("La géométrie dissoute reste invalide.")
    return result


def _geodesic_area_ha(geometry: MultiPolygon, *, precision: int = 2) -> float:
    geod = Geod(ellps="WGS84")
    area_m2, _ = geod.geometry_area_perimeter(geometry)
    area_ha = abs(area_m2) / 10_000
    if area_ha <= 0:
        raise IncidentImportError("La superficie calculée est nulle.")
    return round(area_ha, precision)


def prepare_incident(path: Path) -> PreparedIncident:
    """Read a geospatial file and return one valid EPSG:4326 multipolygon."""

    if not path.is_file():
        raise IncidentImportError(f"Fichier introuvable : {path}")

    frame = gpd.read_file(path)
    if frame.empty:
        raise IncidentImportError("Le fichier ne contient aucune entité.")
    if frame.crs is None:
        raise IncidentImportError("Le système de coordonnées source est absent.")

    polygon_parts: list[Polygon] = []
    repaired_count = 0
    for index, geometry in enumerate(frame.geometry):
        parts, repaired = _repair_polygonal(geometry, index)
        polygon_parts.extend(parts)
        repaired_count += int(repaired)

    normalized = gpd.GeoSeries(polygon_parts, crs=frame.crs).to_crs(epsg=4326)
    dissolved = unary_union(list(normalized))
    geometry = _as_multipolygon(dissolved)

    return PreparedIncident(
        geometry=geometry,
        area_ha=_geodesic_area_ha(geometry),
        source_feature_count=len(frame),
        repaired_feature_count=repaired_count,
    )


def file_checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def persist_incident(
    database_url: str,
    incident: PreparedIncident,
    record: IncidentRecord,
) -> PersistResult:
    """Insert or update an incident and its provenance in one transaction."""

    with (
        psycopg.connect(database_url, row_factory=dict_row) as connection,
        connection.cursor() as cursor,
    ):
        cursor.execute(
            "select id, source_id from public.incidents where external_id = %s",
            (record.external_id,),
        )
        previous = cursor.fetchone()
        cursor.execute(
            """
            insert into public.data_sources (name, source_url, source_date, checksum, metadata)
            values (%s, %s, %s, %s, %s::jsonb)
            returning id
            """,
            (
                record.source_name,
                record.source_url,
                record.source_date,
                record.checksum,
                json.dumps({"external_id": record.external_id}),
            ),
        )
        source_id = cursor.fetchone()["id"]
        cursor.execute(
            """
            insert into public.incidents (
              slug, name, external_id, start_date, department_codes, source_id,
              source_name, source_url, source_date, geometry, geometry_web, area_ha
            )
            values (
              %s, %s, %s, %s, %s, %s, %s, %s, %s,
              extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(%s), 4326)),
              extensions.ST_Multi(extensions.ST_SimplifyPreserveTopology(
                extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(%s), 4326),
                0.0001
              )),
              %s
            )
            on conflict (external_id) do update set
              slug = excluded.slug,
              name = excluded.name,
              start_date = excluded.start_date,
              department_codes = excluded.department_codes,
              source_id = excluded.source_id,
              source_name = excluded.source_name,
              source_url = excluded.source_url,
              source_date = excluded.source_date,
              geometry = excluded.geometry,
              geometry_web = excluded.geometry_web,
              area_ha = excluded.area_ha,
              updated_at = now()
            returning id
            """,
            (
                record.slug,
                record.name,
                record.external_id,
                record.start_date,
                list(record.department_codes),
                source_id,
                record.source_name,
                record.source_url,
                record.source_date,
                incident.geometry_json,
                incident.geometry_json,
                incident.area_ha,
            ),
        )
        incident_id = str(cursor.fetchone()["id"])

        previous_source_id = previous["source_id"] if previous else None
        if previous_source_id and previous_source_id != source_id:
            cursor.execute(
                """
                delete from public.data_sources
                where id = %s
                  and not exists (
                    select 1 from public.incidents where source_id = public.data_sources.id
                  )
                """,
                (previous_source_id,),
            )

    return PersistResult(incident_id=incident_id, action="updated" if previous else "inserted")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--name", required=True)
    parser.add_argument("--external-id", required=True)
    parser.add_argument("--start-date", required=True, type=date.fromisoformat)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--source-name", default="Copernicus EMS")
    parser.add_argument("--source-date", type=date.fromisoformat)
    parser.add_argument("--slug")
    parser.add_argument(
        "--department-codes",
        default="",
        help="Codes département séparés par des virgules.",
    )
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--dry-run", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        prepared = prepare_incident(args.file)
        record = IncidentRecord(
            slug=args.slug or slugify(args.name),
            name=args.name,
            external_id=args.external_id,
            start_date=args.start_date,
            source_name=args.source_name,
            source_url=args.source_url,
            source_date=args.source_date,
            department_codes=tuple(
                code.strip() for code in args.department_codes.split(",") if code.strip()
            ),
            checksum=file_checksum(args.file),
        )

        result: dict[str, Any] = {
            "status": "validated" if args.dry_run else "persisted",
            "external_id": record.external_id,
            "slug": record.slug,
            "source_feature_count": prepared.source_feature_count,
            "repaired_feature_count": prepared.repaired_feature_count,
            "area_ha": prepared.area_ha,
            "crs": "EPSG:4326",
        }
        if not args.dry_run:
            if not args.database_url:
                raise IncidentImportError(
                    "DATABASE_URL ou --database-url est requis hors mode --dry-run."
                )
            persisted = persist_incident(args.database_url, prepared, record)
            result.update({"incident_id": persisted.incident_id, "action": persisted.action})

        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except (IncidentImportError, OSError, psycopg.Error) as error:
        print(json.dumps({"status": "error", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
