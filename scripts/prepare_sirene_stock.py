"""Prepare a small Yakisugi CSV from the official SIRENE stock files."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from scripts.import_industries import IndustryCategory, load_category_mapping, normalize_naf

OUTPUT_FIELDS = [
    "siret",
    "siren",
    "companyName",
    "tradeName",
    "etatAdministratifEtablissement",
    "activitePrincipaleEtablissement",
    "address",
    "postalCode",
    "commune",
    "longitude",
    "latitude",
]


def clean(value: Any) -> str:
    text = "" if value is None else str(value).strip()
    return "" if text in {"[ND]", "[NN]"} else text


def establishment_department(row: Mapping[str, Any]) -> str:
    commune = clean(row.get("codeCommuneEtablissement")).upper()
    postal_code = clean(row.get("codePostalEtablissement"))
    candidate = commune or postal_code
    if candidate.startswith(("2A", "2B")):
        return candidate[:2]
    return candidate[:3] if candidate.startswith(("971", "972", "973", "974", "976")) else candidate[:2]


def build_address(row: Mapping[str, Any]) -> str:
    parts = [
        clean(row.get("numeroVoieEtablissement")),
        clean(row.get("indiceRepetitionEtablissement")),
        clean(row.get("typeVoieEtablissement")),
        clean(row.get("libelleVoieEtablissement")),
    ]
    address = " ".join(part for part in parts if part)
    return address or clean(row.get("complementAdresseEtablissement"))


def select_establishments(
    establishments_path: Path,
    categories: Mapping[str, IndustryCategory],
    departments: set[str],
) -> tuple[list[dict[str, str]], set[str], int]:
    selected: list[dict[str, str]] = []
    sirens: set[str] = set()
    read_count = 0
    with establishments_path.open(newline="", encoding="utf-8-sig") as source:
        for row in csv.DictReader(source):
            read_count += 1
            if clean(row.get("etatAdministratifEtablissement")) != "A":
                continue
            naf = normalize_naf(clean(row.get("activitePrincipaleEtablissement")))
            if naf not in categories or establishment_department(row) not in departments:
                continue
            siret = clean(row.get("siret"))
            siren = clean(row.get("siren")) or siret[:9]
            if len(siret) != 14 or not siret.isdigit() or len(siren) != 9:
                continue
            selected.append(
                {
                    "siret": siret,
                    "siren": siren,
                    "tradeName": clean(row.get("enseigne1Etablissement"))
                    or clean(row.get("denominationUsuelleEtablissement")),
                    "etatAdministratifEtablissement": "A",
                    "activitePrincipaleEtablissement": naf,
                    "address": build_address(row),
                    "postalCode": clean(row.get("codePostalEtablissement")),
                    "commune": clean(row.get("libelleCommuneEtablissement")),
                    "longitude": "",
                    "latitude": "",
                }
            )
            sirens.add(siren)
    return selected, sirens, read_count


def load_company_names(units_path: Path, sirens: set[str]) -> dict[str, str]:
    names: dict[str, str] = {}
    with units_path.open(newline="", encoding="utf-8-sig") as source:
        for row in csv.DictReader(source):
            siren = clean(row.get("siren"))
            if siren not in sirens:
                continue
            name = clean(row.get("denominationUniteLegale")) or clean(
                row.get("denominationUsuelle1UniteLegale")
            )
            if name:
                names[siren] = name
    return names


def prepare_sirene_stock(
    establishments_path: Path,
    units_path: Path,
    categories_path: Path,
    departments: set[str],
    output_path: Path,
) -> dict[str, int]:
    categories = load_category_mapping(categories_path)
    rows, sirens, read_count = select_establishments(
        establishments_path, categories, departments
    )
    names = load_company_names(units_path, sirens)
    prepared = []
    for row in rows:
        company_name = names.get(row["siren"]) or row["tradeName"]
        if not company_name or not row["address"] or not row["postalCode"] or not row["commune"]:
            continue
        prepared.append({**row, "companyName": company_name})
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as target:
        writer = csv.DictWriter(target, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(prepared)
    return {
        "read_establishments": read_count,
        "selected_establishments": len(rows),
        "written_establishments": len(prepared),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--establishments", required=True, type=Path)
    parser.add_argument("--legal-units", required=True, type=Path)
    parser.add_argument("--categories", required=True, type=Path)
    parser.add_argument("--department", required=True, action="append", dest="departments")
    parser.add_argument("--output", required=True, type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        result = prepare_sirene_stock(
            args.establishments,
            args.legal_units,
            args.categories,
            {value.upper() for value in args.departments},
            args.output,
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(json.dumps({"status": "error", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps({"status": "prepared", **result}, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
