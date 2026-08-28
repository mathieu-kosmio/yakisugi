"""Intersect normalized forest polygons with an incident and persist calculated areas."""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import psycopg
from psycopg.rows import dict_row
from shapely.geometry import MultiPolygon, mapping, shape
from shapely.geometry.base import BaseGeometry

from scripts.import_incident import _as_multipolygon, _geodesic_area_ha


class ForestProcessingError(ValueError):
    """Raised when forest intersections cannot be calculated safely."""


@dataclass(frozen=True)
class SourceForest:
    forest_source_id: str
    forest_type_code: str | None
    forest_type_label: str
    dominant_species: str | None
    source_id: str
    geometry: MultiPolygon


@dataclass(frozen=True)
class AffectedForest:
    forest_source_id: str
    forest_type_code: str | None
    forest_type_label: str
    dominant_species: str | None
    source_id: str
    area_ha: float
    affected_ratio: float
    geometry: MultiPolygon

    @property
    def geometry_json(self) -> str:
        return json.dumps(mapping(self.geometry), separators=(",", ":"))


@dataclass(frozen=True)
class ProcessingResult:
    incident_id: str
    source_forest_count: int
    affected_forest_count: int
    affected_area_ha: float
    persisted: bool


def intersect_forests(
    incident_geometry: BaseGeometry,
    forests: Sequence[SourceForest],
) -> tuple[AffectedForest, ...]:
    affected: list[AffectedForest] = []
    for forest in forests:
        intersection = incident_geometry.intersection(forest.geometry)
        if intersection.is_empty:
            continue
        try:
            geometry = _as_multipolygon(intersection)
        except ValueError as error:
            raise ForestProcessingError(str(error)) from error
        source_area_ha = _geodesic_area_ha(forest.geometry)
        area_ha = _geodesic_area_ha(geometry)
        affected.append(
            AffectedForest(
                forest_source_id=forest.forest_source_id,
                forest_type_code=forest.forest_type_code,
                forest_type_label=forest.forest_type_label,
                dominant_species=forest.dominant_species,
                source_id=forest.source_id,
                area_ha=round(area_ha, 4),
                affected_ratio=round(min(area_ha / source_area_ha, 1), 6),
                geometry=geometry,
            )
        )
    return tuple(affected)


def process_forests(
    database_url: str,
    incident_external_id: str,
    *,
    dry_run: bool = False,
) -> ProcessingResult:
    with (
        psycopg.connect(database_url, row_factory=dict_row) as connection,
        connection.cursor() as cursor,
    ):
        cursor.execute(
            """
            select id, department_codes, extensions.ST_AsGeoJSON(geometry) as geometry
            from public.incidents where external_id = %s
            """,
            (incident_external_id,),
        )
        incident = cursor.fetchone()
        if not incident:
            raise ForestProcessingError(f"Incident inconnu : {incident_external_id}")

        department_codes = incident["department_codes"]
        if department_codes:
            cursor.execute(
                """
                select forest_source_id, forest_type_code, forest_type_label,
                       dominant_species, source_id,
                       extensions.ST_AsGeoJSON(geometry) as geometry
                from public.forest_raw
                where department_code = any(%s)
                """,
                (department_codes,),
            )
        else:
            cursor.execute(
                """
                select forest_source_id, forest_type_code, forest_type_label,
                       dominant_species, source_id,
                       extensions.ST_AsGeoJSON(geometry) as geometry
                from public.forest_raw
                """
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
        affected = intersect_forests(incident_geometry, forests)

        if not dry_run:
            cursor.execute(
                "delete from public.affected_forests where incident_id = %s",
                (incident["id"],),
            )
            cursor.executemany(
                """
                insert into public.affected_forests (
                  incident_id, forest_source_id, forest_type_code, forest_type_label,
                  dominant_species, area_ha, affected_ratio, geometry, geometry_web, source_id
                )
                values (
                  %s, %s, %s, %s, %s, %s, %s,
                  extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(%s), 4326)),
                  extensions.ST_Multi(extensions.ST_SimplifyPreserveTopology(
                    extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(%s), 4326),
                    0.00005
                  )),
                  %s
                )
                """,
                [
                    (
                        incident["id"],
                        forest.forest_source_id,
                        forest.forest_type_code,
                        forest.forest_type_label,
                        forest.dominant_species,
                        forest.area_ha,
                        forest.affected_ratio,
                        forest.geometry_json,
                        forest.geometry_json,
                        forest.source_id,
                    )
                    for forest in affected
                ],
            )
            cursor.execute(
                """
                delete from public.data_sources
                where metadata ->> 'dataset' = 'forest'
                  and not exists (
                    select 1 from public.forest_raw where source_id = public.data_sources.id
                  )
                  and not exists (
                    select 1 from public.affected_forests where source_id = public.data_sources.id
                  )
                """
            )

    return ProcessingResult(
        incident_id=str(incident["id"]),
        source_forest_count=len(forests),
        affected_forest_count=len(affected),
        affected_area_ha=round(sum(forest.area_ha for forest in affected), 4),
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
        result = process_forests(args.database_url, args.incident, dry_run=args.dry_run)
        output: dict[str, Any] = {
            "status": "validated" if args.dry_run else "persisted",
            "incident_id": result.incident_id,
            "source_forest_count": result.source_forest_count,
            "affected_forest_count": result.affected_forest_count,
            "affected_area_ha": result.affected_area_ha,
        }
        print(json.dumps(output, ensure_ascii=False, sort_keys=True))
        return 0
    except (ForestProcessingError, OSError, psycopg.Error) as error:
        print(json.dumps({"status": "error", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
