"""Normalize cadastral parcel polygons and persist their source data."""

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
import psycopg
from psycopg.rows import dict_row
from shapely.geometry import MultiPolygon, mapping
from shapely.ops import unary_union

from scripts.import_forest import ForestImportError, _required_columns, _text_value
from scripts.import_incident import (
    IncidentImportError,
    _as_multipolygon,
    _geodesic_area_ha,
    _repair_polygonal,
    file_checksum,
)


class ParcelImportError(ValueError):
    """Raised when cadastral source data cannot be normalized safely."""


@dataclass(frozen=True)
class PreparedParcel:
    parcel_uid: str
    insee_code: str
    commune_name: str
    section: str
    parcel_number: str
    parcel_area_ha: float
    geometry: MultiPolygon

    @property
    def geometry_json(self) -> str:
        return json.dumps(mapping(self.geometry), separators=(",", ":"))


@dataclass(frozen=True)
class PreparedParcelBatch:
    parcels: tuple[PreparedParcel, ...]
    repaired_feature_count: int

    @property
    def insee_codes(self) -> tuple[str, ...]:
        return tuple(sorted({parcel.insee_code for parcel in self.parcels}))


def prepare_parcels(
    path: Path,
    *,
    id_column: str = "id",
    insee_column: str = "commune",
    commune_name_column: str | None = None,
    commune_name: str | None = None,
    section_column: str = "section",
    number_column: str = "numero",
) -> PreparedParcelBatch:
    if not path.is_file():
        raise ParcelImportError(f"Fichier introuvable : {path}")
    frame = gpd.read_file(path)
    if frame.empty:
        raise ParcelImportError("Le fichier cadastral ne contient aucune entité.")
    if frame.crs is None:
        raise ParcelImportError("Le système de coordonnées cadastral est absent.")
    if not commune_name_column and not commune_name:
        raise ParcelImportError(
            "--commune-name ou --commune-name-column est requis pour conserver un libellé vérifié."
        )
    _required_columns(
        frame,
        [id_column, insee_column, commune_name_column, section_column, number_column],
    )

    parcels: list[PreparedParcel] = []
    seen_ids: set[str] = set()
    repaired_count = 0
    for position, (_, row) in enumerate(frame.iterrows()):
        parcel_uid = _text_value(row[id_column])
        insee_code = _text_value(row[insee_column])
        resolved_commune_name = (
            _text_value(row[commune_name_column]) if commune_name_column else commune_name
        )
        section = _text_value(row[section_column])
        parcel_number = _text_value(row[number_column])
        if not all([parcel_uid, insee_code, resolved_commune_name, section, parcel_number]):
            raise ParcelImportError(f"Les attributs cadastraux de l'entité {position} sont incomplets.")
        if parcel_uid in seen_ids:
            raise ParcelImportError(f"Identifiant parcellaire dupliqué : {parcel_uid}")
        seen_ids.add(parcel_uid)

        try:
            parts, repaired = _repair_polygonal(row.geometry, position)
        except (IncidentImportError, TypeError) as error:
            raise ParcelImportError(str(error)) from error
        projected = gpd.GeoSeries(parts, crs=frame.crs).to_crs(epsg=4326)
        geometry = _as_multipolygon(unary_union(list(projected)))
        repaired_count += int(repaired)
        parcels.append(
            PreparedParcel(
                parcel_uid=parcel_uid,
                insee_code=insee_code,
                commune_name=resolved_commune_name,
                section=section,
                parcel_number=parcel_number,
                parcel_area_ha=round(_geodesic_area_ha(geometry), 4),
                geometry=geometry,
            )
        )

    return PreparedParcelBatch(tuple(parcels), repaired_count)


def persist_parcels(
    database_url: str,
    batch: PreparedParcelBatch,
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
            "select distinct source_id from public.cadastral_parcels_raw where insee_code = any(%s)",
            (list(batch.insee_codes),),
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
                        "dataset": "cadastre",
                        "insee_codes": list(batch.insee_codes),
                        "feature_count": len(batch.parcels),
                    }
                ),
            ),
        )
        source_id = cursor.fetchone()["id"]
        cursor.execute(
            "delete from public.cadastral_parcels_raw where insee_code = any(%s)",
            (list(batch.insee_codes),),
        )
        cursor.executemany(
            """
            insert into public.cadastral_parcels_raw (
              parcel_uid, insee_code, commune_name, section, parcel_number,
              parcel_area_ha, geometry, source_id
            )
            values (
              %s, %s, %s, %s, %s, %s,
              extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(%s), 4326)),
              %s
            )
            """,
            [
                (
                    parcel.parcel_uid,
                    parcel.insee_code,
                    parcel.commune_name,
                    parcel.section,
                    parcel.parcel_number,
                    parcel.parcel_area_ha,
                    parcel.geometry_json,
                    source_id,
                )
                for parcel in batch.parcels
            ],
        )
        if previous_source_ids:
            cursor.execute(
                """
                delete from public.data_sources
                where id = any(%s)
                  and not exists (
                    select 1 from public.cadastral_parcels_raw
                    where source_id = public.data_sources.id
                  )
                  and not exists (
                    select 1 from public.affected_parcels
                    where source_id = public.data_sources.id
                  )
                """,
                (previous_source_ids,),
            )
    return len(batch.parcels)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--source-name", default="Plan cadastral informatisé")
    parser.add_argument("--source-date", type=date.fromisoformat)
    parser.add_argument("--id-column", default="id")
    parser.add_argument("--insee-column", default="commune")
    parser.add_argument("--commune-name-column")
    parser.add_argument("--commune-name")
    parser.add_argument("--section-column", default="section")
    parser.add_argument("--number-column", default="numero")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--dry-run", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        batch = prepare_parcels(
            args.file,
            id_column=args.id_column,
            insee_column=args.insee_column,
            commune_name_column=args.commune_name_column,
            commune_name=args.commune_name,
            section_column=args.section_column,
            number_column=args.number_column,
        )
        output: dict[str, Any] = {
            "status": "validated" if args.dry_run else "persisted",
            "feature_count": len(batch.parcels),
            "repaired_feature_count": batch.repaired_feature_count,
            "insee_codes": batch.insee_codes,
            "crs": "EPSG:4326",
        }
        if not args.dry_run:
            if not args.database_url:
                raise ParcelImportError(
                    "DATABASE_URL ou --database-url est requis hors mode --dry-run."
                )
            output["inserted_count"] = persist_parcels(
                args.database_url,
                batch,
                source_name=args.source_name,
                source_url=args.source_url,
                source_date=args.source_date,
                checksum=file_checksum(args.file),
            )
        print(json.dumps(output, ensure_ascii=False, sort_keys=True))
        return 0
    except (ParcelImportError, ForestImportError, OSError, psycopg.Error) as error:
        print(json.dumps({"status": "error", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
