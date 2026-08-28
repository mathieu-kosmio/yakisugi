from __future__ import annotations

import json
import os
from io import BytesIO
from pathlib import Path

import psycopg
import pytest

from scripts.import_industries import (
    GeocodingCache,
    geocode_address,
    geocoding_key,
    load_category_mapping,
    main,
    persist_industries,
    prepare_industries,
)


def industry_row(
    siret: str,
    *,
    status: str = "A",
    naf_code: str = "16.10A",
    longitude: float | None = -0.6,
    latitude: float | None = 44.8,
) -> dict:
    return {
        "siret": siret,
        "siren": siret[:9],
        "companyName": f"Entreprise {siret}",
        "tradeName": None,
        "etatAdministratifEtablissement": status,
        "activitePrincipaleEtablissement": naf_code,
        "address": "1 rue du Bois",
        "postalCode": "33000",
        "commune": "Bordeaux",
        "longitude": longitude,
        "latitude": latitude,
    }


def test_category_mapping_is_versioned_configuration() -> None:
    mapping = load_category_mapping(Path("config/industry-categories.json"))

    assert mapping["02.20Z"] == "FORESTRY"
    assert mapping["16.10A"] == "SAWMILL"
    assert mapping["16.24Z"] == "PACKAGING"
    assert mapping["46.73A"] == "WOOD_TRADING"


def test_prepare_industries_filters_and_reuses_geocoding_cache(tmp_path: Path) -> None:
    cache_path = tmp_path / "geocoding.json"
    cache = GeocodingCache(cache_path)
    categories = load_category_mapping(Path("config/industry-categories.json"))
    rows = [
        industry_row("11111111100011"),
        industry_row("22222222200022", longitude=None, latitude=None),
        industry_row("33333333300033", status="F"),
        industry_row("44444444400044", naf_code="99.99Z"),
    ]

    batch = prepare_industries(rows, categories, cache)

    assert batch.read_count == 4
    assert len(batch.industries) == 2
    assert batch.inactive_count == 1
    assert batch.out_of_scope_count == 1
    assert batch.unresolved_count == 0
    assert batch.industries[1].longitude == -0.6
    cache.save()
    payload = json.loads(cache_path.read_text())
    assert "1 rue du Bois" not in cache_path.read_text()
    assert geocoding_key("1 rue du Bois", "33000", "Bordeaux") in payload["entries"]


def test_prepare_industries_counts_unresolved_addresses(tmp_path: Path) -> None:
    batch = prepare_industries(
        [industry_row("55555555500055", longitude=None, latitude=None)],
        load_category_mapping(Path("config/industry-categories.json")),
        GeocodingCache(tmp_path / "empty-cache.json"),
    )

    assert batch.industries == ()
    assert batch.unresolved_count == 1


def test_prepare_industries_geocodes_missing_address_and_caches_result(tmp_path: Path) -> None:
    cache = GeocodingCache(tmp_path / "geocoding.json")
    calls: list[tuple[str, str, str]] = []

    def fake_geocoder(address: str, postal_code: str, commune: str) -> tuple[float, float]:
        calls.append((address, postal_code, commune))
        return -0.57, 44.84

    batch = prepare_industries(
        [industry_row("88888888800088", longitude=None, latitude=None)],
        load_category_mapping(Path("config/industry-categories.json")),
        cache,
        fake_geocoder,
    )

    assert len(batch.industries) == 1
    assert calls == [("1 rue du Bois", "33000", "Bordeaux")]
    assert cache.get("1 rue du Bois", "33000", "Bordeaux") == (-0.57, 44.84)


def test_geocode_address_parses_geoplateforme_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requested_urls: list[str] = []

    class FakeResponse(BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            self.close()

    def fake_urlopen(request, timeout):
        requested_urls.append(request.full_url)
        assert timeout == 3
        return FakeResponse(
            json.dumps(
                {
                    "type": "FeatureCollection",
                    "features": [
                        {
                            "type": "Feature",
                            "properties": {"_score": 0.91},
                            "geometry": {"type": "Point", "coordinates": [-0.57, 44.84]},
                        }
                    ],
                }
            ).encode()
        )

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    coordinates = geocode_address(
        "1 rue du Bois",
        "33000",
        "Bordeaux",
        timeout_seconds=3,
    )

    assert coordinates == (-0.57, 44.84)
    assert "index=address" in requested_urls[0]
    assert "postcode=33000" in requested_urls[0]


def test_geocode_address_sanitizes_leading_punctuation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requested_urls: list[str] = []

    class FakeResponse(BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            self.close()

    def fake_urlopen(request, timeout):
        requested_urls.append(request.full_url)
        return FakeResponse(json.dumps({"features": []}).encode())

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    assert geocode_address("- LONGERINAS", "33500", "LIBOURNE") is None
    assert "q=LONGERINAS+33500+LIBOURNE" in requested_urls[0]


def test_cli_dry_run_does_not_write_cache(tmp_path: Path, capsys: pytest.CaptureFixture) -> None:
    source = tmp_path / "industries.json"
    source.write_text(json.dumps([industry_row("66666666600066")]))
    cache_path = tmp_path / "geocoding.json"

    exit_code = main(
        [
            "--file",
            str(source),
            "--categories",
            "config/industry-categories.json",
            "--geocoding-cache",
            str(cache_path),
            "--source-url",
            "https://example.test/sirene",
            "--dry-run",
        ]
    )

    assert exit_code == 0
    assert json.loads(capsys.readouterr().out)["active_in_scope_count"] == 1
    assert not cache_path.exists()


@pytest.mark.skipif(
    not os.environ.get("YAKISUGI_TEST_DATABASE_URL"),
    reason="YAKISUGI_TEST_DATABASE_URL absent",
)
def test_persist_industries_upserts_active_sites(tmp_path: Path) -> None:
    database_url = os.environ["YAKISUGI_TEST_DATABASE_URL"]
    cache = GeocodingCache(tmp_path / "geocoding.json")
    batch = prepare_industries(
        [industry_row("77777777700077")],
        load_category_mapping(Path("config/industry-categories.json")),
        cache,
    )

    try:
        first_count = persist_industries(
            database_url,
            batch,
            source_name="Fixture SIRENE pytest",
            source_url="https://example.test/sirene",
            source_date=None,
            checksum="test-checksum",
        )
        second_count = persist_industries(
            database_url,
            batch,
            source_name="Fixture SIRENE pytest",
            source_url="https://example.test/sirene",
            source_date=None,
            checksum="test-checksum",
        )

        assert first_count == 1
        assert second_count == 1
        with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                select count(*), min(category::text),
                       min(extensions.ST_SRID(location)), min(active::int)
                from public.industrial_sites where siret = %s
                """,
                ("77777777700077",),
            )
            count, category, srid, active = cursor.fetchone()
        assert count == 1
        assert category == "SAWMILL"
        assert srid == 4326
        assert active == 1
    finally:
        with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                "delete from public.industrial_sites where siret = %s",
                ("77777777700077",),
            )
            cursor.execute(
                """
                delete from public.data_sources
                where metadata ->> 'dataset' = 'sirene'
                  and name = 'Fixture SIRENE pytest'
                """
            )
