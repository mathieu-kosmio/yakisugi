"""Normalize a targeted SIRENE export from the official Annuaire des Entreprises."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import sys
import time
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from pyproj import Transformer
from pyproj.exceptions import ProjError

from scripts.import_industries import (
    DEFAULT_GEOCODING_ENDPOINT,
    Geocoder,
    GeocodingCache,
    IndustryImportError,
    geocode_address,
    load_category_mapping,
    normalize_naf,
)
from scripts.prepare_sirene_stock import OUTPUT_FIELDS

DEFAULT_SOURCE_URL = "https://annuaire-entreprises.data.gouv.fr/export-sirene"
REQUIRED_FIELDS = {
    "siren",
    "siret",
    "denominationUniteLegale",
    "complementAdresseEtablissement",
    "numeroVoieEtablissement",
    "indiceRepetitionEtablissement",
    "typeVoieEtablissement",
    "libelleVoieEtablissement",
    "codePostalEtablissement",
    "libelleCommuneEtablissement",
    "codeCommuneEtablissement",
    "coordonneeLambertAbscisseEtablissement",
    "coordonneeLambertOrdonneeEtablissement",
    "etatAdministratifEtablissement",
    "enseigne1Etablissement",
    "denominationUsuelleEtablissement",
    "activitePrincipaleEtablissement",
}


class AnnuairePreparationError(ValueError):
    """Raised when an Annuaire export does not match the validated extraction contract."""


def clean(value: Any) -> str:
    text = "" if value is None else str(value).strip()
    return "" if text.upper() in {"ND", "NN", "[ND]", "[NN]"} else text


def file_checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def detect_dialect(path: Path) -> csv.Dialect:
    with path.open(encoding="utf-8-sig", newline="") as source:
        sample = source.read(65536)
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error as error:
        raise AnnuairePreparationError("Séparateur CSV impossible à détecter.") from error


def validate_headers(fieldnames: Sequence[str] | None) -> None:
    missing = REQUIRED_FIELDS - set(fieldnames or ())
    if missing:
        raise AnnuairePreparationError("Colonnes Annuaire absentes : " + ", ".join(sorted(missing)))


def establishment_department(row: Mapping[str, Any]) -> str:
    commune_code = clean(row.get("codeCommuneEtablissement")).upper()
    postal_code = clean(row.get("codePostalEtablissement"))
    candidate = commune_code or postal_code
    if candidate.startswith(("2A", "2B")):
        return candidate[:2]
    if candidate.startswith(("971", "972", "973", "974", "976")):
        return candidate[:3]
    return candidate[:2]


def build_address(row: Mapping[str, Any]) -> str:
    street = " ".join(
        part
        for part in (
            clean(row.get("numeroVoieEtablissement")),
            clean(row.get("indiceRepetitionEtablissement")),
            clean(row.get("typeVoieEtablissement")),
            clean(row.get("libelleVoieEtablissement")),
        )
        if part
    )
    complement = clean(row.get("complementAdresseEtablissement"))
    return " ".join(part for part in (complement, street) if part)


def trade_name(row: Mapping[str, Any]) -> str:
    return clean(row.get("enseigne1Etablissement")) or clean(
        row.get("denominationUsuelleEtablissement")
    )


def wgs84_coordinates(row: Mapping[str, Any], transformer: Transformer) -> tuple[str, str]:
    raw_x = clean(row.get("coordonneeLambertAbscisseEtablissement"))
    raw_y = clean(row.get("coordonneeLambertOrdonneeEtablissement"))
    if not raw_x or not raw_y:
        return "", ""
    try:
        longitude, latitude = transformer.transform(float(raw_x), float(raw_y))
    except (TypeError, ValueError, ProjError):
        return "", ""
    if not all(map(math.isfinite, (longitude, latitude))):
        return "", ""
    if not (-6 <= longitude <= 10 and 41 <= latitude <= 52):
        return "", ""
    return f"{longitude:.7f}", f"{latitude:.7f}"


def normalize_row(
    row: Mapping[str, Any], transformer: Transformer, row_number: int
) -> tuple[dict[str, str] | None, str | None, bool]:
    siret = clean(row.get("siret")).replace(" ", "")
    siren = clean(row.get("siren")).replace(" ", "") or siret[:9]
    if not (len(siret) == 14 and siret.isdigit() and len(siren) == 9 and siren.isdigit()):
        raise AnnuairePreparationError(f"SIRET ou SIREN invalide à la ligne {row_number}.")
    company_trade_name = trade_name(row)
    company_name = clean(row.get("denominationUniteLegale")) or company_trade_name
    generated_company_name = not company_name
    if not company_name:
        company_name = f"Établissement SIRENE {siret}"
    address = build_address(row)
    postal_code = clean(row.get("codePostalEtablissement"))
    commune = clean(row.get("libelleCommuneEtablissement"))
    if not address or not postal_code or not commune:
        return None, "missing_address", generated_company_name
    longitude, latitude = wgs84_coordinates(row, transformer)
    return (
        {
            "siret": siret,
            "siren": siren,
            "companyName": company_name,
            "tradeName": company_trade_name,
            "etatAdministratifEtablissement": "A",
            "activitePrincipaleEtablissement": normalize_naf(
                clean(row.get("activitePrincipaleEtablissement"))
            ),
            "address": address,
            "postalCode": postal_code,
            "commune": commune,
            "longitude": longitude,
            "latitude": latitude,
        },
        None,
        generated_company_name,
    )


def read_and_normalize(
    source_path: Path, categories_path: Path, departments: set[str]
) -> tuple[list[dict[str, str]], dict[str, int], list[str]]:
    categories = load_category_mapping(categories_path)
    transformer = Transformer.from_crs("EPSG:2154", "EPSG:4326", always_xy=True)
    counts = {
        "read_establishments": 0,
        "written_establishments": 0,
        "generated_company_name": 0,
        "missing_address": 0,
        "source_coordinates": 0,
        "cached_coordinates": 0,
        "geocoded_coordinates": 0,
        "geocoding_errors": 0,
        "missing_coordinates": 0,
    }
    rows: list[dict[str, str]] = []
    seen_sirets: set[str] = set()
    with source_path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source, dialect=detect_dialect(source_path))
        validate_headers(reader.fieldnames)
        for row_number, row in enumerate(reader, start=2):
            counts["read_establishments"] += 1
            validate_scope(row, categories, departments, row_number)
            siret = clean(row.get("siret")).replace(" ", "")
            if siret in seen_sirets:
                raise AnnuairePreparationError(f"SIRET dupliqué : {siret}")
            seen_sirets.add(siret)
            normalized, missing_reason, generated_company_name = normalize_row(
                row, transformer, row_number
            )
            if missing_reason:
                counts[missing_reason] += 1
            if normalized:
                if generated_company_name:
                    counts["generated_company_name"] += 1
                if normalized["longitude"]:
                    counts["source_coordinates"] += 1
                rows.append(normalized)
    rows.sort(key=lambda row: row["siret"])
    counts["written_establishments"] = len(rows)
    return rows, counts, sorted(categories)


def validate_scope(
    row: Mapping[str, Any], categories: Mapping[str, str], departments: set[str], row_number: int
) -> None:
    if clean(row.get("etatAdministratifEtablissement")) != "A":
        raise AnnuairePreparationError(f"Ligne {row_number} : établissement non actif.")
    naf_code = normalize_naf(clean(row.get("activitePrincipaleEtablissement")))
    if naf_code not in categories:
        raise AnnuairePreparationError(f"Ligne {row_number} : code APE hors périmètre.")
    if establishment_department(row) not in departments:
        raise AnnuairePreparationError(f"Ligne {row_number} : département hors périmètre.")


def write_output(path: Path, rows: Sequence[Mapping[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def enrich_missing_coordinates(
    rows: Sequence[dict[str, str]],
    counts: dict[str, int],
    cache: GeocodingCache | None,
    geocoder: Geocoder | None,
) -> None:
    cached_since_save = 0
    for row in rows:
        if row["longitude"]:
            continue
        coordinates = (
            cache.get(row["address"], row["postalCode"], row["commune"]) if cache else None
        )
        if coordinates:
            counts["cached_coordinates"] += 1
        elif geocoder:
            try:
                coordinates = geocode_with_retries(
                    geocoder, row["address"], row["postalCode"], row["commune"]
                )
            except IndustryImportError:
                counts["geocoding_errors"] += 1
                coordinates = None
            if coordinates:
                counts["geocoded_coordinates"] += 1
                if cache:
                    cache.put(row["address"], row["postalCode"], row["commune"], *coordinates)
                    cached_since_save += 1
                    if cached_since_save >= 25:
                        cache.save()
                        cached_since_save = 0
        if coordinates:
            row["longitude"] = f"{coordinates[0]:.7f}"
            row["latitude"] = f"{coordinates[1]:.7f}"
        else:
            counts["missing_coordinates"] += 1
    if cache:
        cache.save()


def geocode_with_retries(
    geocoder: Geocoder, address: str, postal_code: str, commune: str
) -> tuple[float, float] | None:
    for attempt in range(3):
        try:
            return geocoder(address, postal_code, commune)
        except IndustryImportError:
            if attempt == 2:
                raise
            time.sleep(0.5 * (attempt + 1))
    return None


def prepare_annuaire_export(
    source_path: Path,
    categories_path: Path,
    departments: set[str],
    output_path: Path,
    manifest_path: Path,
    *,
    source_url: str,
    retrieved_at: str,
    geocoding_cache_path: Path | None = None,
    geocoder: Geocoder | None = None,
) -> dict[str, Any]:
    if not source_path.is_file():
        raise AnnuairePreparationError(f"Fichier introuvable : {source_path}")
    normalized_departments = {value.upper() for value in departments}
    rows, counts, naf_codes = read_and_normalize(
        source_path, categories_path, normalized_departments
    )
    cache = GeocodingCache(geocoding_cache_path) if geocoding_cache_path else None
    enrich_missing_coordinates(rows, counts, cache, geocoder)
    write_output(output_path, rows)
    manifest = {
        "version": 1,
        "dataset": "sirene-annuaire",
        "source": {
            "url": source_url,
            "retrieved_at": retrieved_at,
            "filename": source_path.name,
            "sha256": file_checksum(source_path),
        },
        "filters": {
            "active_only": True,
            "departments": sorted(normalized_departments),
            "naf_codes": naf_codes,
        },
        "counts": counts,
        "output": {"filename": output_path.name, "sha256": file_checksum(output_path)},
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return manifest


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--categories", type=Path, default=Path("config/industry-categories.json"))
    parser.add_argument("--department", required=True, action="append", dest="departments")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--source-url", default=DEFAULT_SOURCE_URL)
    parser.add_argument("--retrieved-at", required=True)
    parser.add_argument("--geocoding-cache", type=Path, default=Path("data/geocoding-cache.json"))
    parser.add_argument("--geocode-missing", action="store_true")
    parser.add_argument("--geocoding-endpoint", default=DEFAULT_GEOCODING_ENDPOINT)
    parser.add_argument("--geocoding-timeout", type=float, default=10)
    parser.add_argument("--min-geocoding-score", type=float, default=0.5)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
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
        result = prepare_annuaire_export(
            args.file,
            args.categories,
            set(args.departments),
            args.output,
            args.manifest,
            source_url=args.source_url,
            retrieved_at=args.retrieved_at,
            geocoding_cache_path=args.geocoding_cache,
            geocoder=geocoder,
        )
    except (AnnuairePreparationError, OSError, json.JSONDecodeError) as error:
        print(
            json.dumps({"status": "error", "error": str(error)}, ensure_ascii=False),
            file=sys.stderr,
        )
        return 1
    print(json.dumps({"status": "prepared", **result["counts"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
