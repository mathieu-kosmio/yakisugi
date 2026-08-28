from __future__ import annotations

import csv
import json
from pathlib import Path

from scripts.prepare_sirene_stock import prepare_sirene_stock


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as target:
        writer = csv.DictWriter(target, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def test_prepare_sirene_stock_filters_and_normalizes_official_files(tmp_path: Path) -> None:
    establishments = tmp_path / "StockEtablissement.csv"
    units = tmp_path / "StockUniteLegale.csv"
    categories = tmp_path / "categories.json"
    output = tmp_path / "sirene-yakisugi.csv"
    categories.write_text(json.dumps({"16.10A": "SAWMILL"}))
    write_csv(
        establishments,
        [
            {
                "siret": "12345678900011",
                "siren": "123456789",
                "etatAdministratifEtablissement": "A",
                "activitePrincipaleEtablissement": "16.10A",
                "codeCommuneEtablissement": "33448",
                "codePostalEtablissement": "33680",
                "libelleCommuneEtablissement": "Saumos",
                "numeroVoieEtablissement": "12",
                "indiceRepetitionEtablissement": "",
                "typeVoieEtablissement": "RTE",
                "libelleVoieEtablissement": "DES PINS",
                "complementAdresseEtablissement": "",
                "enseigne1Etablissement": "Scierie locale",
                "denominationUsuelleEtablissement": "",
            },
            {
                "siret": "98765432100019",
                "siren": "987654321",
                "etatAdministratifEtablissement": "A",
                "activitePrincipaleEtablissement": "16.10A",
                "codeCommuneEtablissement": "40100",
                "codePostalEtablissement": "40100",
                "libelleCommuneEtablissement": "Dax",
                "numeroVoieEtablissement": "1",
                "indiceRepetitionEtablissement": "",
                "typeVoieEtablissement": "RUE",
                "libelleVoieEtablissement": "DU BOIS",
                "complementAdresseEtablissement": "",
                "enseigne1Etablissement": "Hors département",
                "denominationUsuelleEtablissement": "",
            },
        ],
    )
    write_csv(
        units,
        [
            {
                "siren": "123456789",
                "denominationUniteLegale": "BOIS ATLANTIQUE",
                "denominationUsuelle1UniteLegale": "",
            },
            {
                "siren": "987654321",
                "denominationUniteLegale": "BOIS LANDAIS",
                "denominationUsuelle1UniteLegale": "",
            },
        ],
    )

    result = prepare_sirene_stock(establishments, units, categories, {"33"}, output)

    assert result == {
        "read_establishments": 2,
        "selected_establishments": 1,
        "written_establishments": 1,
    }
    with output.open(newline="", encoding="utf-8") as source:
        rows = list(csv.DictReader(source))
    assert rows[0]["companyName"] == "BOIS ATLANTIQUE"
    assert rows[0]["address"] == "12 RTE DES PINS"
    assert rows[0]["longitude"] == ""
    assert "nomUniteLegale" not in rows[0]
