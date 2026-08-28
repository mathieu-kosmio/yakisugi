"""Pre-calculate geodesic distances between incidents and active industrial sites."""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Literal

import psycopg
from psycopg.rows import dict_row

DistanceBand = Literal["0_25", "25_50", "50_100", "100_150", "150_PLUS"]
METHODOLOGY_VERSION = "distance-geodesic-v1"


class DistanceCalculationError(ValueError):
    """Raised when proximity calculations cannot be completed safely."""


@dataclass(frozen=True)
class IncidentDistanceResult:
    incident_id: str
    external_id: str | None
    industrial_site_count: int


def distance_band(distance_km: float) -> DistanceBand:
    if distance_km < 0:
        raise DistanceCalculationError("Une distance ne peut pas être négative.")
    if distance_km < 25:
        return "0_25"
    if distance_km < 50:
        return "25_50"
    if distance_km < 100:
        return "50_100"
    if distance_km < 150:
        return "100_150"
    return "150_PLUS"


def calculate_distances(
    database_url: str,
    *,
    incident_external_id: str | None = None,
    max_distance_km: float = 200,
    dry_run: bool = False,
) -> tuple[IncidentDistanceResult, ...]:
    if max_distance_km <= 0:
        raise DistanceCalculationError("La distance maximale doit être strictement positive.")

    with (
        psycopg.connect(database_url, row_factory=dict_row) as connection,
        connection.cursor() as cursor,
    ):
        if incident_external_id:
            cursor.execute(
                "select id, external_id from public.incidents where external_id = %s",
                (incident_external_id,),
            )
        else:
            cursor.execute("select id, external_id from public.incidents")
        incidents = cursor.fetchall()
        if incident_external_id and not incidents:
            raise DistanceCalculationError(f"Incident inconnu : {incident_external_id}")

        results: list[IncidentDistanceResult] = []
        for incident in incidents:
            cursor.execute(
                """
                select count(*) as site_count
                from public.industrial_sites site
                join public.incidents incident on incident.id = %s
                where site.active
                  and extensions.ST_DistanceSphere(
                    site.location,
                    extensions.ST_Centroid(incident.geometry)
                  ) / 1000 <= %s
                """,
                (incident["id"], max_distance_km),
            )
            site_count = cursor.fetchone()["site_count"]
            if not dry_run:
                cursor.execute(
                    "delete from public.incident_industrial_sites where incident_id = %s",
                    (incident["id"],),
                )
                cursor.execute(
                    """
                    with distances as (
                      select
                        site.id as industrial_site_id,
                        extensions.ST_DistanceSphere(
                          site.location,
                          extensions.ST_Centroid(incident.geometry)
                        ) / 1000 as distance_km
                      from public.industrial_sites site
                      join public.incidents incident on incident.id = %s
                      where site.active
                    )
                    insert into public.incident_industrial_sites (
                      incident_id, industrial_site_id, distance_km, distance_band,
                      methodology_version
                    )
                    select
                      %s,
                      industrial_site_id,
                      round(distance_km::numeric, 3),
                      case
                        when distance_km < 25 then '0_25'
                        when distance_km < 50 then '25_50'
                        when distance_km < 100 then '50_100'
                        when distance_km < 150 then '100_150'
                        else '150_PLUS'
                      end,
                      %s
                    from distances
                    where distance_km <= %s
                    """,
                    (
                        incident["id"],
                        incident["id"],
                        METHODOLOGY_VERSION,
                        max_distance_km,
                    ),
                )
            results.append(
                IncidentDistanceResult(
                    incident_id=str(incident["id"]),
                    external_id=incident["external_id"],
                    industrial_site_count=site_count,
                )
            )
    return tuple(results)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--incident", help="Identifiant externe, tous les incidents par défaut.")
    parser.add_argument("--max-distance-km", type=float, default=200)
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
        results = calculate_distances(
            args.database_url,
            incident_external_id=args.incident,
            max_distance_km=args.max_distance_km,
            dry_run=args.dry_run,
        )
        output: dict[str, Any] = {
            "status": "validated" if args.dry_run else "persisted",
            "methodology_version": METHODOLOGY_VERSION,
            "incident_count": len(results),
            "industrial_site_count": sum(item.industrial_site_count for item in results),
            "incidents": [
                {
                    "incident_id": item.incident_id,
                    "external_id": item.external_id,
                    "industrial_site_count": item.industrial_site_count,
                }
                for item in results
            ],
        }
        print(json.dumps(output, ensure_ascii=False, sort_keys=True))
        return 0
    except (DistanceCalculationError, OSError, psycopg.Error) as error:
        print(json.dumps({"status": "error", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
