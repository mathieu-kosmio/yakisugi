"""Filter, geocode from cache and persist active SIRENE industrial sites."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Literal

import psycopg
from psycopg.rows import dict_row

IndustryCategory = Literal[
    "FORESTRY",
    "SAWMILL",
    "PANELS",
    "PACKAGING",
    "WOOD_TRADING",
    "WOOD_ENERGY",
    "OTHER",
]
VALID_CATEGORIES = {
    "FORESTRY",
    "SAWMILL",
    "PANELS",
    "PACKAGING",
    "WOOD_TRADING",
    "WOOD_ENERGY",
    "OTHER",
}
DEFAULT_GEOCODING_ENDPOINT = "https://data.geopf.fr/geocodage/search"
Geocoder = Callable[[str, str, str], tuple[float, float] | None]


class IndustryImportError(ValueError):
    """Raised when industrial source data or configuration is invalid."""


@dataclass(frozen=True)
class PreparedIndustry:
    siret: str
    siren: str
    company_name: str
    trade_name: str | None
    naf_code: str
    category: IndustryCategory
    address: str
    postal_code: str
    commune: str
    longitude: float
    latitude: float


@dataclass(frozen=True)
class PreparedIndustryBatch:
    industries: tuple[PreparedIndustry, ...]
    read_count: int
    inactive_count: int
    out_of_scope_count: int
    unresolved_count: int
    inactive_sirets: tuple[str, ...]


class GeocodingCache:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.entries: dict[str, dict[str, float]] = {}
        self.dirty = False
        if path.exists():
            payload = json.loads(path.read_text())
            if payload.get("version") != 1 or not isinstance(payload.get("entries"), dict):
                raise IndustryImportError("Format de cache de géocodage invalide.")
            self.entries = payload["entries"]

    def get(self, address: str, postal_code: str, commune: str) -> tuple[float, float] | None:
        entry = self.entries.get(geocoding_key(address, postal_code, commune))
        if not entry:
            return None
        return validate_coordinates(entry.get("longitude"), entry.get("latitude"))

    def put(
        self,
        address: str,
        postal_code: str,
        commune: str,
        longitude: float,
        latitude: float,
    ) -> None:
        key = geocoding_key(address, postal_code, commune)
        value = {"longitude": longitude, "latitude": latitude}
        if self.entries.get(key) != value:
            self.entries[key] = value
            self.dirty = True

    def save(self) -> None:
        if not self.dirty:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps({"version": 1, "entries": self.entries}, indent=2, sort_keys=True) + "\n"
        )
        self.dirty = False


def geocoding_key(address: str, postal_code: str, commune: str) -> str:
    normalized = "|".join(
        " ".join(value.upper().split()) for value in (address, postal_code, commune)
    )
    return hashlib.sha256(normalized.encode()).hexdigest()


def load_category_mapping(path: Path) -> dict[str, IndustryCategory]:
    payload = json.loads(path.read_text())
    if not isinstance(payload, dict) or not payload:
        raise IndustryImportError("La configuration NAF doit être un objet non vide.")
    mapping: dict[str, IndustryCategory] = {}
    for raw_code, category in payload.items():
        code = normalize_naf(str(raw_code))
        if category not in VALID_CATEGORIES:
            raise IndustryImportError(f"Catégorie industrielle invalide pour {code} : {category}")
        mapping[code] = category
    return mapping


def normalize_naf(value: str) -> str:
    return value.strip().upper().replace(" ", "")


def _optional_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _required_text(row: Mapping[str, Any], field: str, row_number: int) -> str:
    value = _optional_text(row.get(field))
    if not value:
        raise IndustryImportError(f"Champ {field} absent à la ligne {row_number}.")
    return value


def read_industry_rows(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        raise IndustryImportError(f"Fichier introuvable : {path}")
    if path.suffix.lower() == ".json":
        payload = json.loads(path.read_text())
        if not isinstance(payload, list):
            raise IndustryImportError("Le fichier JSON doit contenir une liste d'établissements.")
        return [dict(row) for row in payload]
    with path.open(newline="", encoding="utf-8-sig") as source:
        return list(csv.DictReader(source))


def validate_coordinates(longitude: Any, latitude: Any) -> tuple[float, float] | None:
    if longitude in (None, "") or latitude in (None, ""):
        return None
    try:
        lon = float(longitude)
        lat = float(latitude)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(lon) or not math.isfinite(lat):
        return None
    if not -180 <= lon <= 180 or not -90 <= lat <= 90:
        return None
    return lon, lat


def geocode_address(
    address: str,
    postal_code: str,
    commune: str,
    *,
    endpoint: str = DEFAULT_GEOCODING_ENDPOINT,
    timeout_seconds: float = 10,
    minimum_score: float = 0.5,
) -> tuple[float, float] | None:
    query_text = f"{address} {postal_code} {commune}".strip()
    first_alphanumeric = next(
        (index for index, character in enumerate(query_text) if character.isalnum()),
        len(query_text),
    )
    query_text = query_text[first_alphanumeric:][:200]
    if len(query_text) < 3:
        return None
    query = urllib.parse.urlencode(
        {
            "q": query_text,
            "index": "address",
            "limit": 1,
            "autocomplete": 0,
            "postcode": postal_code,
            "city": commune,
        }
    )
    request = urllib.request.Request(
        f"{endpoint}?{query}",
        headers={"Accept": "application/json", "User-Agent": "Yakisugi-ETL/0.1"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            payload = json.load(response)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise IndustryImportError(f"Échec du géocodage de {postal_code} {commune}: {error}") from error
    features = payload.get("features") if isinstance(payload, dict) else None
    if not features:
        return None
    feature = features[0]
    properties = feature.get("properties", {})
    score = properties.get("_score", properties.get("score", 0))
    if not isinstance(score, (int, float)) or score < minimum_score:
        return None
    geometry = feature.get("geometry", {})
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or len(coordinates) < 2:
        return None
    return validate_coordinates(coordinates[0], coordinates[1])


def prepare_industries(
    rows: Sequence[Mapping[str, Any]],
    categories: Mapping[str, IndustryCategory],
    cache: GeocodingCache,
    geocoder: Geocoder | None = None,
) -> PreparedIndustryBatch:
    industries: list[PreparedIndustry] = []
    inactive_sirets: list[str] = []
    inactive_count = 0
    out_of_scope_count = 0
    unresolved_count = 0
    seen_sirets: set[str] = set()

    for row_number, row in enumerate(rows, start=1):
        siret = _required_text(row, "siret", row_number).replace(" ", "")
        if not (siret.isdigit() and len(siret) == 14):
            raise IndustryImportError(f"SIRET invalide à la ligne {row_number} : {siret}")
        if siret in seen_sirets:
            raise IndustryImportError(f"SIRET dupliqué : {siret}")
        seen_sirets.add(siret)
        if _required_text(row, "etatAdministratifEtablissement", row_number) != "A":
            inactive_count += 1
            inactive_sirets.append(siret)
            continue

        naf_code = normalize_naf(
            _required_text(row, "activitePrincipaleEtablissement", row_number)
        )
        category = categories.get(naf_code)
        if not category:
            out_of_scope_count += 1
            continue

        address = _required_text(row, "address", row_number)
        postal_code = _required_text(row, "postalCode", row_number)
        commune = _required_text(row, "commune", row_number)
        coordinates = validate_coordinates(row.get("longitude"), row.get("latitude"))
        if coordinates:
            cache.put(address, postal_code, commune, *coordinates)
        else:
            coordinates = cache.get(address, postal_code, commune)
        if not coordinates and geocoder:
            coordinates = geocoder(address, postal_code, commune)
            if coordinates:
                cache.put(address, postal_code, commune, *coordinates)
        if not coordinates:
            unresolved_count += 1
            continue

        siren = _optional_text(row.get("siren")) or siret[:9]
        company_name = _required_text(row, "companyName", row_number)
        industries.append(
            PreparedIndustry(
                siret=siret,
                siren=siren,
                company_name=company_name,
                trade_name=_optional_text(row.get("tradeName")),
                naf_code=naf_code,
                category=category,
                address=address,
                postal_code=postal_code,
                commune=commune,
                longitude=coordinates[0],
                latitude=coordinates[1],
            )
        )

    return PreparedIndustryBatch(
        industries=tuple(industries),
        read_count=len(rows),
        inactive_count=inactive_count,
        out_of_scope_count=out_of_scope_count,
        unresolved_count=unresolved_count,
        inactive_sirets=tuple(inactive_sirets),
    )


def persist_industries(
    database_url: str,
    batch: PreparedIndustryBatch,
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
                        "dataset": "sirene",
                        "read_count": batch.read_count,
                        "imported_count": len(batch.industries),
                    }
                ),
            ),
        )
        source_id = cursor.fetchone()["id"]
        if batch.inactive_sirets:
            cursor.execute(
                "delete from public.industrial_sites where siret = any(%s)",
                (list(batch.inactive_sirets),),
            )
        cursor.executemany(
            """
            insert into public.industrial_sites (
              siret, siren, company_name, trade_name, naf_code, category,
              address, postal_code, commune, longitude, latitude, location,
              active, source_id
            )
            values (
              %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
              extensions.ST_SetSRID(extensions.ST_MakePoint(%s, %s), 4326),
              true, %s
            )
            on conflict (siret) do update set
              siren = excluded.siren,
              company_name = excluded.company_name,
              trade_name = excluded.trade_name,
              naf_code = excluded.naf_code,
              category = excluded.category,
              address = excluded.address,
              postal_code = excluded.postal_code,
              commune = excluded.commune,
              longitude = excluded.longitude,
              latitude = excluded.latitude,
              location = excluded.location,
              active = true,
              source_id = excluded.source_id,
              updated_at = now()
            """,
            [
                (
                    industry.siret,
                    industry.siren,
                    industry.company_name,
                    industry.trade_name,
                    industry.naf_code,
                    industry.category,
                    industry.address,
                    industry.postal_code,
                    industry.commune,
                    industry.longitude,
                    industry.latitude,
                    industry.longitude,
                    industry.latitude,
                    source_id,
                )
                for industry in batch.industries
            ],
        )
        cursor.execute(
            """
            delete from public.data_sources
            where metadata ->> 'dataset' = 'sirene'
              and id <> %s
              and not exists (
                select 1 from public.industrial_sites where source_id = public.data_sources.id
              )
            """,
            (source_id,),
        )
    return len(batch.industries)


def file_checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument(
        "--categories",
        type=Path,
        default=Path("config/industry-categories.json"),
    )
    parser.add_argument("--geocoding-cache", type=Path, required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--source-name", default="INSEE SIRENE")
    parser.add_argument("--source-date", type=date.fromisoformat)
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--geocode-missing", action="store_true")
    parser.add_argument("--geocoding-endpoint", default=DEFAULT_GEOCODING_ENDPOINT)
    parser.add_argument("--geocoding-timeout", type=float, default=10)
    parser.add_argument("--min-geocoding-score", type=float, default=0.5)
    parser.add_argument("--dry-run", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        rows = read_industry_rows(args.file)
        cache = GeocodingCache(args.geocoding_cache)
        geocoder = None
        if args.geocode_missing:
            geocoder = lambda address, postal_code, commune: geocode_address(
                address,
                postal_code,
                commune,
                endpoint=args.geocoding_endpoint,
                timeout_seconds=args.geocoding_timeout,
                minimum_score=args.min_geocoding_score,
            )
        batch = prepare_industries(
            rows,
            load_category_mapping(args.categories),
            cache,
            geocoder,
        )
        output: dict[str, Any] = {
            "status": "validated" if args.dry_run else "persisted",
            "read_count": batch.read_count,
            "active_in_scope_count": len(batch.industries),
            "inactive_count": batch.inactive_count,
            "out_of_scope_count": batch.out_of_scope_count,
            "unresolved_count": batch.unresolved_count,
        }
        if not args.dry_run:
            if not args.database_url:
                raise IndustryImportError(
                    "DATABASE_URL ou --database-url est requis hors mode --dry-run."
                )
            output["inserted_or_updated_count"] = persist_industries(
                args.database_url,
                batch,
                source_name=args.source_name,
                source_url=args.source_url,
                source_date=args.source_date,
                checksum=file_checksum(args.file),
            )
            cache.save()
        print(json.dumps(output, ensure_ascii=False, sort_keys=True))
        return 0
    except (IndustryImportError, OSError, json.JSONDecodeError, psycopg.Error) as error:
        print(json.dumps({"status": "error", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
