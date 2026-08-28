"""Normalize a forest dataset and persist its source polygons for offline processing."""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
import psycopg
from psycopg.rows import dict_row
from shapely.geometry import MultiPolygon
from shapely.ops import unary_union

from scripts.import_incident import (
    IncidentImportError,
    _as_multipolygon,
    _repair_polygonal,
    file_checksum,
)


class ForestImportError(ValueError):
    """Raised when a forest source cannot be normalized safely."""


@dataclass(frozen=True)
class PreparedForest:
    forest_source_id: str
    forest_type_code: str | None
    forest_type_label: str
    dominant_species: str | None
    geometry: MultiPolygon

    @property
    def geometry_json(self) -> str:
        from shapely.geometry import mapping

        return json.dumps(mapping(self.geometry), separators=(",", ":"))


@dataclass(frozen=True)
class PreparedForestBatch:
    department_code: str
    forests: tuple[PreparedForest, ...]
    repaired_feature_count: int


def _text_value(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def _required_columns(frame: gpd.GeoDataFrame, columns: Sequence[str | None]) -> None:
    missing = [column for column in columns if column and column not in frame.columns]
    if missing:
        raise ForestImportError(f"Colonnes absentes : {', '.join(missing)}")


def prepare_forests(
    path: Path,
    department_code: str,
    *,
    id_column: str = "ID",
    type_code_column: str | None = "CODE_TFV",
    type_label_column: str = "TFV",
    species_column: str | None = None,
) -> PreparedForestBatch:
    if not path.is_file():
        raise ForestImportError(f"Fichier introuvable : {path}")
    frame = gpd.read_file(path)
    if frame.empty:
        raise ForestImportError("Le fichier forestier ne contient aucune entité.")
    if frame.crs is None:
        raise ForestImportError("Le système de coordonnées forestier est absent.")
    _required_columns(
        frame,
        [id_column, type_code_column, type_label_column, species_column],
    )

    forests: list[PreparedForest] = []
    repaired_count = 0
    seen_ids: set[str] = set()
    for position, (_, row) in enumerate(frame.iterrows()):
        source_id = _text_value(row[id_column])
        label = _text_value(row[type_label_column])
        if not source_id or not label:
            raise ForestImportError(
                f"L'entité {position} doit avoir un identifiant et un type de formation."
            )
        namespaced_id = f"{department_code}:{source_id}"
        if namespaced_id in seen_ids:
            raise ForestImportError(f"Identifiant forestier dupliqué : {namespaced_id}")
        seen_ids.add(namespaced_id)

        try:
            parts, repaired = _repair_polygonal(row.geometry, position)
        except (IncidentImportError, TypeError) as error:
            raise ForestImportError(str(error)) from error
        projected = gpd.GeoSeries(parts, crs=frame.crs).to_crs(epsg=4326)
        geometry = _as_multipolygon(unary_union(list(projected)))
        repaired_count += int(repaired)
        forests.append(
            PreparedForest(
                forest_source_id=namespaced_id,
                forest_type_code=(
                    _text_value(row[type_code_column]) if type_code_column else None
                ),
                forest_type_label=label,
                dominant_species=(
                    _text_value(row[species_column]) if species_column else None
                ),
                geometry=geometry,
            )
        )

    return PreparedForestBatch(
        department_code=department_code,
        forests=tuple(forests),
        repaired_feature_count=repaired_count,
    )


def persist_forests(
    database_url: str,
    batch: PreparedForestBatch,
    *,
    source_name: str,
    source_url: str,
    source_date: date | None,
    checksum: str,
) -> int:
    with (
        psycopg.connect(database_url, row_factory=dict_row) as connection,
        connection.cursor() as cursor,
    ):
        cursor.execute(
            "select distinct source_id from public.forest_raw where department_code = %s",
            (batch.department_code,),
        )
        previous_source_ids = [row["source_id"] for row in cursor.fetchall()]
        cursor.execute(
            """
            insert into public.data_sources (name, source_url, source_date, checksum, metadata)
            values (%s, %s, %s, %s, %s::jsonb)
            returning id
            """,
            (
                source_name,
                source_url,
                source_date,
                checksum,
                json.dumps(
                    {
                        "dataset": "forest",
                        "department_code": batch.department_code,
                        "feature_count": len(batch.forests),
                    }
                ),
            ),
        )
        source_id = cursor.fetchone()["id"]
        cursor.execute(
            "delete from public.forest_raw where department_code = %s",
            (batch.department_code,),
        )
        cursor.executemany(
            """
            insert into public.forest_raw (
              department_code, forest_source_id, forest_type_code, forest_type_label,
              dominant_species, geometry, source_id
            )
            values (
              %s, %s, %s, %s, %s,
              extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(%s), 4326)),
              %s
            )
            """,
            [
                (
                    batch.department_code,
                    forest.forest_source_id,
                    forest.forest_type_code,
                    forest.forest_type_label,
                    forest.dominant_species,
                    forest.geometry_json,
                    source_id,
                )
                for forest in batch.forests
            ],
        )
        if previous_source_ids:
            cursor.execute(
                """
                delete from public.data_sources
                where id = any(%s)
                  and not exists (
                    select 1 from public.forest_raw where source_id = public.data_sources.id
                  )
                  and not exists (
                    select 1 from public.affected_forests where source_id = public.data_sources.id
                  )
                """,
                (previous_source_ids,),
            )
    return len(batch.forests)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--department", required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--source-name", default="IGN BD Forêt")
    parser.add_argument("--source-date", type=date.fromisoformat)
    parser.add_argument("--id-column", default="ID")
    parser.add_argument("--type-code-column", default="CODE_TFV")
    parser.add_argument("--type-label-column", default="TFV")
    parser.add_argument("--species-column")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--dry-run", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        batch = prepare_forests(
            args.file,
            args.department,
            id_column=args.id_column,
            type_code_column=args.type_code_column,
            type_label_column=args.type_label_column,
            species_column=args.species_column,
        )
        output: dict[str, Any] = {
            "status": "validated" if args.dry_run else "persisted",
            "department_code": batch.department_code,
            "feature_count": len(batch.forests),
            "repaired_feature_count": batch.repaired_feature_count,
            "crs": "EPSG:4326",
        }
        if not args.dry_run:
            if not args.database_url:
                raise ForestImportError(
                    "DATABASE_URL ou --database-url est requis hors mode --dry-run."
                )
            output["inserted_count"] = persist_forests(
                args.database_url,
                batch,
                source_name=args.source_name,
                source_url=args.source_url,
                source_date=args.source_date,
                checksum=file_checksum(args.file),
            )
        print(json.dumps(output, ensure_ascii=False, sort_keys=True))
        return 0
    except (ForestImportError, OSError, psycopg.Error) as error:
        print(json.dumps({"status": "error", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
