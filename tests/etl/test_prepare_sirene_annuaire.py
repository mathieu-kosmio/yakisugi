from __future__ import annotations

import csv
import json
from pathlib import Path

import pytest

from scripts.import_industries import IndustryImportError
from scripts.prepare_sirene_annuaire import (
    AnnuairePreparationError,
    geocode_with_retries,
    main,
    prepare_annuaire_export,
)

SOURCE_URL = "https://annuaire-entreprises.data.gouv.fr/export-sirene"


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as target:
        writer = csv.DictWriter(target, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def annuaire_row(siret: str = "12345678900011", **overrides: str) -> dict[str, str]:
    row = {
        "siren": siret[:9],
        "siret": siret,
        "statutDiffusionEtablissement": "O",
        "denominationUniteLegale": "BOIS ATLANTIQUE",
        "nomUniteLegale": "Nom à ne pas conserver",
        "prenom1UniteLegale": "Prénom à ne pas conserver",
        "complementAdresseEtablissement": "ZONE ARTISANALE",
        "numeroVoieEtablissement": "12",
        "indiceRepetitionEtablissement": "B",
        "typeVoieEtablissement": "RTE",
        "libelleVoieEtablissement": "DES PINS",
        "codePostalEtablissement": "33680",
        "libelleCommuneEtablissement": "SAUMOS",
        "codeCommuneEtablissement": "33498",
        "coordonneeLambertAbscisseEtablissement": "397041.0",
        "coordonneeLambertOrdonneeEtablissement": "6439778.0",
        "etatAdministratifEtablissement": "A",
        "enseigne1Etablissement": "SCIERIE LOCALE",
        "denominationUsuelleEtablissement": "",
        "activitePrincipaleEtablissement": "16.10A",
    }
    row.update(overrides)
    return row


def prepare(tmp_path: Path, rows: list[dict[str, str]]) -> tuple[dict, list[dict[str, str]]]:
    source = tmp_path / "annuaire.csv"
    output = tmp_path / "yakisugi-industries.csv"
    manifest = tmp_path / "manifest.json"
    categories = tmp_path / "categories.json"
    categories.write_text(json.dumps({"16.10A": "SAWMILL", "02.20Z": "FORESTRY"}))
    write_csv(source, rows)

    result = prepare_annuaire_export(
        source,
        categories,
        {"33", "40"},
        output,
        manifest,
        source_url=SOURCE_URL,
        retrieved_at="2026-08-24",
    )
    with output.open(newline="", encoding="utf-8") as prepared:
        output_rows = list(csv.DictReader(prepared))
    return result, output_rows


def test_prepare_annuaire_export_normalizes_and_converts_coordinates(tmp_path: Path) -> None:
    result, rows = prepare(tmp_path, [annuaire_row()])

    assert result["counts"] == {
        "read_establishments": 1,
        "written_establishments": 1,
        "generated_company_name": 0,
        "missing_address": 0,
        "source_coordinates": 1,
        "cached_coordinates": 0,
        "geocoded_coordinates": 0,
        "geocoding_errors": 0,
        "missing_coordinates": 0,
    }
    assert rows[0]["companyName"] == "BOIS ATLANTIQUE"
    assert rows[0]["tradeName"] == "SCIERIE LOCALE"
    assert rows[0]["address"] == "ZONE ARTISANALE 12 B RTE DES PINS"
    assert -5 < float(rows[0]["longitude"]) < 10
    assert 41 < float(rows[0]["latitude"]) < 52
    assert "nomUniteLegale" not in rows[0]


def test_prepare_annuaire_export_never_reconstructs_person_name(tmp_path: Path) -> None:
    result, rows = prepare(
        tmp_path,
        [
            annuaire_row(
                denominationUniteLegale="",
                enseigne1Etablissement="",
                denominationUsuelleEtablissement="",
            )
        ],
    )

    assert rows[0]["companyName"] == "Établissement SIRENE 12345678900011"
    assert "Nom à ne pas conserver" not in json.dumps(rows, ensure_ascii=False)
    assert "Prénom à ne pas conserver" not in json.dumps(rows, ensure_ascii=False)
    assert result["counts"]["generated_company_name"] == 1


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"etatAdministratifEtablissement": "F"}, "établissement non actif"),
        ({"activitePrincipaleEtablissement": "99.99Z"}, "code APE hors périmètre"),
        ({"codeCommuneEtablissement": "75056"}, "département hors périmètre"),
    ],
)
def test_prepare_annuaire_export_rejects_scope_mismatch(
    tmp_path: Path, overrides: dict[str, str], message: str
) -> None:
    with pytest.raises(AnnuairePreparationError, match=message):
        prepare(tmp_path, [annuaire_row(**overrides)])


def test_prepare_annuaire_export_rejects_duplicate_siret(tmp_path: Path) -> None:
    with pytest.raises(AnnuairePreparationError, match="SIRET dupliqué"):
        prepare(tmp_path, [annuaire_row(), annuaire_row()])


def test_prepare_annuaire_export_writes_provenance_manifest(tmp_path: Path) -> None:
    source = tmp_path / "annuaire.csv"
    output = tmp_path / "yakisugi-industries.csv"
    manifest = tmp_path / "manifest.json"
    categories = tmp_path / "categories.json"
    categories.write_text(json.dumps({"16.10A": "SAWMILL"}))
    write_csv(source, [annuaire_row(coordonneeLambertAbscisseEtablissement="")])

    result = prepare_annuaire_export(
        source,
        categories,
        {"33", "40"},
        output,
        manifest,
        source_url=SOURCE_URL,
        retrieved_at="2026-08-24",
    )
    persisted = json.loads(manifest.read_text())

    assert persisted == result
    assert persisted["source"]["url"] == SOURCE_URL
    assert len(persisted["source"]["sha256"]) == 64
    assert len(persisted["output"]["sha256"]) == 64
    assert persisted["filters"]["departments"] == ["33", "40"]
    assert persisted["filters"]["naf_codes"] == ["16.10A"]
    assert persisted["counts"]["missing_coordinates"] == 1


def test_prepare_annuaire_export_geocodes_missing_coordinates_and_caches_them(
    tmp_path: Path,
) -> None:
    source = tmp_path / "annuaire.csv"
    output = tmp_path / "yakisugi-industries.csv"
    manifest = tmp_path / "manifest.json"
    cache = tmp_path / "geocoding-cache.json"
    categories = tmp_path / "categories.json"
    categories.write_text(json.dumps({"16.10A": "SAWMILL"}))
    write_csv(source, [annuaire_row(coordonneeLambertAbscisseEtablissement="")])
    calls: list[tuple[str, str, str]] = []

    def geocoder(address: str, postal_code: str, commune: str) -> tuple[float, float]:
        calls.append((address, postal_code, commune))
        return -0.57, 44.84

    result = prepare_annuaire_export(
        source,
        categories,
        {"33", "40"},
        output,
        manifest,
        source_url=SOURCE_URL,
        retrieved_at="2026-08-24",
        geocoding_cache_path=cache,
        geocoder=geocoder,
    )
    with output.open(newline="", encoding="utf-8") as prepared:
        rows = list(csv.DictReader(prepared))

    assert calls == [("ZONE ARTISANALE 12 B RTE DES PINS", "33680", "SAUMOS")]
    assert rows[0]["longitude"] == "-0.5700000"
    assert rows[0]["latitude"] == "44.8400000"
    assert result["counts"]["geocoded_coordinates"] == 1
    assert result["counts"]["missing_coordinates"] == 0
    assert cache.exists()


def test_geocode_with_retries_recovers_from_temporary_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    attempts = 0
    waits: list[float] = []

    def geocoder(_address: str, _postal_code: str, _commune: str) -> tuple[float, float]:
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise IndustryImportError("temporaire")
        return -0.57, 44.84

    monkeypatch.setattr("scripts.prepare_sirene_annuaire.time.sleep", waits.append)

    assert geocode_with_retries(geocoder, "1 RUE DU BOIS", "33000", "BORDEAUX") == (
        -0.57,
        44.84,
    )
    assert waits == [0.5, 1.0]


def test_cli_prepares_export_and_reports_missing_source(
    tmp_path: Path, capsys: pytest.CaptureFixture
) -> None:
    source = tmp_path / "annuaire.csv"
    output = tmp_path / "yakisugi-industries.csv"
    manifest = tmp_path / "manifest.json"
    cache = tmp_path / "cache.json"
    categories = tmp_path / "categories.json"
    categories.write_text(json.dumps({"16.10A": "SAWMILL"}))
    write_csv(source, [annuaire_row()])
    common_args = [
        "--categories",
        str(categories),
        "--department",
        "33",
        "--output",
        str(output),
        "--manifest",
        str(manifest),
        "--retrieved-at",
        "2026-08-24",
        "--geocoding-cache",
        str(cache),
    ]

    assert main(["--file", str(source), *common_args]) == 0
    assert json.loads(capsys.readouterr().out)["status"] == "prepared"
    assert main(["--file", str(tmp_path / "missing.csv"), *common_args]) == 1
    assert json.loads(capsys.readouterr().err)["status"] == "error"
