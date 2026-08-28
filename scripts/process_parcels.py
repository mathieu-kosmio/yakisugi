"""Calculate incident, cadastral parcel and forest intersections offline."""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Literal

import psycopg
from psycopg.rows import dict_row
from shapely.geometry import MultiPolygon, Point, mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from scripts.import_incident import _as_multipolygon, _geodesic_area_ha
from scripts.process_forests import SourceForest

Confidence = Literal["low", "medium", "high"]
METHODOLOGY_VERSION = "parcel-forest-v1"


class ParcelProcessingError(ValueError):
    """Raised when affected parcels cannot be calculated safely."""


@dataclass(frozen=True)
class SourceParcel:
    parcel_uid: str
    insee_code: str
    commune_name: str
    section: str
    parcel_number: str
    parcel_area_ha: float
    source_id: str
    geometry: MultiPolygon


@dataclass(frozen=True)
class ForestComposition:
    forest_type: str
    species: str | None
    area_ha: float
    percentage: float


@dataclass(frozen=True)
class AffectedParcel:
    source: SourceParcel
    affected_area_ha: float
    affected_ratio: float
    forest_area_ha: float
    dominant_species: str | None
    confidence: Confidence
    geometry: MultiPolygon
    centroid: Point
    compositions: tuple[ForestComposition, ...]

    @property
    def geometry_json(self) -> str:
        return json.dumps(mapping(self.geometry), separators=(",", ":"))

    @property
    def centroid_json(self) -> str:
        return json.dumps(mapping(self.centroid), separators=(",", ":"))


@dataclass(frozen=True)
class ParcelProcessingResult:
    incident_id: str
    source_parcel_count: int
    affected_parcel_count: int
    persisted: bool


def _confidence(forest_area_ha: float, affected_area_ha: float, species: str | None) -> Confidence:
    if affected_area_ha <= 0 or forest_area_ha <= 0:
        return "low"
    coverage = forest_area_ha / affected_area_ha
    if coverage >= 0.8 and species:
        return "high"
    return "medium"


def calculate_affected_parcels(
    incident_geometry: BaseGeometry,
    parcels: Sequence[SourceParcel],
    forests: Sequence[SourceForest],
) -> tuple[AffectedParcel, ...]:
    results: list[AffectedParcel] = []
    for parcel in parcels:
        affected_geometry_raw = parcel.geometry.intersection(incident_geometry)
        if affected_geometry_raw.is_empty:
            continue
        try:
            affected_geometry = _as_multipolygon(affected_geometry_raw)
        except ValueError as error:
            raise ParcelProcessingError(str(error)) from error
        affected_area_ha = round(_geodesic_area_ha(affected_geometry), 4)

        forest_parts: list[BaseGeometry] = []
        composition_parts: dict[tuple[str, str | None], list[BaseGeometry]] = defaultdict(list)
        for forest in forests:
            forest_intersection = affected_geometry.intersection(forest.geometry)
            if forest_intersection.is_empty:
                continue
            forest_parts.append(forest_intersection)
            composition_parts[(forest.forest_type_label, forest.dominant_species)].append(
                forest_intersection
            )

        forest_area_ha = 0.0
        compositions: list[ForestComposition] = []
        if forest_parts:
            forest_union = _as_multipolygon(unary_union(forest_parts))
            forest_area_ha = round(_geodesic_area_ha(forest_union), 4)
            for (forest_type, species), parts in composition_parts.items():
                composition_geometry = _as_multipolygon(unary_union(parts))
                area_ha = round(_geodesic_area_ha(composition_geometry), 4)
                compositions.append(
                    ForestComposition(
                        forest_type=forest_type,
                        species=species,
                        area_ha=area_ha,
                        percentage=round(area_ha / forest_area_ha * 100, 4),
                    )
                )
            compositions.sort(key=lambda item: item.area_ha, reverse=True)

        dominant_species = next(
            (item.species for item in compositions if item.species is not None),
            None,
        )
        results.append(
            AffectedParcel(
                source=parcel,
                affected_area_ha=affected_area_ha,
                affected_ratio=round(min(affected_area_ha / parcel.parcel_area_ha, 1), 6),
                forest_area_ha=forest_area_ha,
                dominant_species=dominant_species,
                confidence=_confidence(forest_area_ha, affected_area_ha, dominant_species),
                geometry=parcel.geometry,
                centroid=parcel.geometry.centroid,
                compositions=tuple(compositions),
            )
        )
    return tuple(results)


def process_parcels(
    database_url: str,
    incident_external_id: str,
    *,
    dry_run: bool = False,
) -> ParcelProcessingResult:
    with (
        psycopg.connect(database_url, row_factory=dict_row) as connection,
        connection.cursor() as cursor,
    ):
        cursor.execute(
            """
            select id, extensions.ST_AsGeoJSON(geometry) as geometry
            from public.incidents where external_id = %s
            """,
            (incident_external_id,),
        )
        incident = cursor.fetchone()
        if not incident:
            raise ParcelProcessingError(f"Incident inconnu : {incident_external_id}")
        cursor.execute(
            """
            select parcel_uid, insee_code, commune_name, section, parcel_number,
                   parcel_area_ha, source_id, extensions.ST_AsGeoJSON(geometry) as geometry
            from public.cadastral_parcels_raw
            where extensions.ST_Intersects(
              geometry,
              (select geometry from public.incidents where id = %s)
            )
            """,
            (incident["id"],),
        )
        parcels = tuple(
            SourceParcel(
                parcel_uid=row["parcel_uid"],
                insee_code=row["insee_code"],
                commune_name=row["commune_name"],
                section=row["section"],
                parcel_number=row["parcel_number"],
                parcel_area_ha=float(row["parcel_area_ha"]),
                source_id=str(row["source_id"]),
                geometry=_as_multipolygon(shape(json.loads(row["geometry"]))),
            )
            for row in cursor.fetchall()
        )
        cursor.execute(
            """
            select forest_source_id, forest_type_code, forest_type_label,
                   dominant_species, source_id,
                   extensions.ST_AsGeoJSON(geometry) as geometry
            from public.affected_forests where incident_id = %s
            """,
            (incident["id"],),
        )
        forests = tuple(
            SourceForest(
                forest_source_id=row["forest_source_id"],
                forest_type_code=row["forest_type_code"],
                forest_type_label=row["forest_type_label"],
                dominant_species=row["dominant_species"],
                source_id=str(row["source_id"]),
                geometry=_as_multipolygon(shape(json.loads(row["geometry"]))),
            )
            for row in cursor.fetchall()
        )
        incident_geometry = shape(json.loads(incident["geometry"]))
        affected = calculate_affected_parcels(incident_geometry, parcels, forests)

        if not dry_run:
            cursor.execute(
                "delete from public.affected_parcels where incident_id = %s",
                (incident["id"],),
            )
            for parcel in affected:
                cursor.execute(
                    """
                    insert into public.affected_parcels (
                      incident_id, insee_code, commune_name, section, parcel_number,
                      parcel_uid, parcel_area_ha, affected_area_ha, affected_ratio,
                      forest_area_ha, dominant_species, estimated_volume_min_m3,
                      estimated_volume_max_m3, confidence, geometry, centroid,
                      geometry_web, source_id, methodology_version
                    )
                    values (
                      %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                      null, null, %s,
                      extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(%s), 4326)),
                      extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(%s), 4326),
                      extensions.ST_Multi(extensions.ST_SimplifyPreserveTopology(
                        extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(%s), 4326),
                        0.00002
                      )),
                      %s, %s
                    )
                    returning id
                    """,
                    (
                        incident["id"],
                        parcel.source.insee_code,
                        parcel.source.commune_name,
                        parcel.source.section,
                        parcel.source.parcel_number,
                        parcel.source.parcel_uid,
                        parcel.source.parcel_area_ha,
                        parcel.affected_area_ha,
                        parcel.affected_ratio,
                        parcel.forest_area_ha,
                        parcel.dominant_species,
                        parcel.confidence,
                        parcel.geometry_json,
                        parcel.centroid_json,
                        parcel.geometry_json,
                        parcel.source.source_id,
                        METHODOLOGY_VERSION,
                    ),
                )
                parcel_id = cursor.fetchone()["id"]
                cursor.executemany(
                    """
                    insert into public.parcel_forest_compositions (
                      parcel_id, forest_type, species, area_ha, percentage
                    )
                    values (%s, %s, %s, %s, %s)
                    """,
                    [
                        (
                            parcel_id,
                            item.forest_type,
                            item.species,
                            item.area_ha,
                            item.percentage,
                        )
                        for item in parcel.compositions
                    ],
                )
            cursor.execute(
                """
                delete from public.data_sources
                where metadata ->> 'dataset' = 'cadastre'
                  and not exists (
                    select 1 from public.cadastral_parcels_raw
                    where source_id = public.data_sources.id
                  )
                  and not exists (
                    select 1 from public.affected_parcels
                    where source_id = public.data_sources.id
                  )
                """
            )

    return ParcelProcessingResult(
        incident_id=str(incident["id"]),
        source_parcel_count=len(parcels),
        affected_parcel_count=len(affected),
        persisted=not dry_run,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--incident", required=True, help="Identifiant externe de l'incident.")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--dry-run", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.database_url:
        print(
            json.dumps(
                {"status": "error", "error": "DATABASE_URL ou --database-url est requis."},
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        return 1
    try:
        result = process_parcels(args.database_url, args.incident, dry_run=args.dry_run)
        output: dict[str, Any] = {
            "status": "validated" if args.dry_run else "persisted",
            "incident_id": result.incident_id,
            "source_parcel_count": result.source_parcel_count,
            "affected_parcel_count": result.affected_parcel_count,
            "methodology_version": METHODOLOGY_VERSION,
            "volume_estimation": None,
        }
        print(json.dumps(output, ensure_ascii=False, sort_keys=True))
        return 0
    except (ParcelProcessingError, OSError, psycopg.Error) as error:
        print(json.dumps({"status": "error", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
