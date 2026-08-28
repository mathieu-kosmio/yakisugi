from __future__ import annotations

import os
from datetime import date
from pathlib import Path

import geopandas as gpd
import psycopg
import pytest
from shapely.geometry import Polygon

from scripts.calculate_distances import (
    DistanceCalculationError,
    calculate_distances,
    distance_band,
)
from scripts.import_incident import (
    IncidentRecord,
    file_checksum,
    persist_incident,
    prepare_incident,
)
from scripts.import_industries import (
    GeocodingCache,
    load_category_mapping,
    persist_industries,
    prepare_industries,
)


@pytest.mark.parametrize(
    ("distance", "expected"),
    [
        (0, "0_25"),
        (24.999, "0_25"),
        (25, "25_50"),
        (50, "50_100"),
        (100, "100_150"),
        (150, "150_PLUS"),
        (200, "150_PLUS"),
    ],
)
def test_distance_band_boundaries(distance: float, expected: str) -> None:
    assert distance_band(distance) == expected


def test_distance_band_rejects_negative_value() -> None:
    with pytest.raises(DistanceCalculationError, match="négative"):
        distance_band(-1)


def industry_row(siret: str, longitude: float, latitude: float) -> dict:
    return {
        "siret": siret,
        "siren": siret[:9],
        "companyName": f"Entreprise {siret}",
        "tradeName": None,
        "etatAdministratifEtablissement": "A",
        "activitePrincipaleEtablissement": "16.10A",
        "address": f"{siret} rue du Bois",
        "postalCode": "33000",
        "commune": "Bordeaux",
        "longitude": longitude,
        "latitude": latitude,
    }


@pytest.mark.skipif(
    not os.environ.get("YAKISUGI_TEST_DATABASE_URL"),
    reason="YAKISUGI_TEST_DATABASE_URL absent",
)
def test_calculate_distances_persists_only_sites_within_radius(tmp_path: Path) -> None:
    database_url = os.environ["YAKISUGI_TEST_DATABASE_URL"]
    incident_file = tmp_path / "incident.geojson"
    gpd.GeoDataFrame(
        geometry=[Polygon([(-0.01, -0.01), (0.01, -0.01), (0.01, 0.01), (-0.01, 0.01)])],
        crs="EPSG:4326",
    ).to_file(incident_file, driver="GeoJSON")
    incident_record = IncidentRecord(
        slug="distance-integration-test",
        name="Distance integration test",
        external_id="YAKISUGI-DISTANCE-INTEGRATION-TEST",
        start_date=date(2026, 7, 22),
        source_name="Fixture incident pytest",
        source_url="https://example.test/incident",
        source_date=None,
        department_codes=(),
        checksum=file_checksum(incident_file),
    )
    industries = prepare_industries(
        [
            industry_row("90000000100011", 0.1, 0),
            industry_row("90000000200012", 3, 0),
        ],
        load_category_mapping(Path("config/industry-categories.json")),
        GeocodingCache(tmp_path / "geocoding.json"),
    )

    try:
        persist_incident(database_url, prepare_incident(incident_file), incident_record)
        persist_industries(
            database_url,
            industries,
            source_name="Fixture distance pytest",
            source_url="https://example.test/sirene",
            source_date=None,
            checksum="distance-test",
        )

        first = calculate_distances(
            database_url,
            incident_external_id=incident_record.external_id,
        )
        second = calculate_distances(
            database_url,
            incident_external_id=incident_record.external_id,
        )

        assert first[0].industrial_site_count == 1
        assert second[0].industrial_site_count == 1
        with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                select d.distance_km, d.distance_band, d.methodology_version
                from public.incident_industrial_sites d
                join public.incidents i on i.id = d.incident_id
                where i.external_id = %s
                """,
                (incident_record.external_id,),
            )
            rows = cursor.fetchall()
        assert len(rows) == 1
        assert 10 < float(rows[0][0]) < 12
        assert rows[0][1] == "0_25"
        assert rows[0][2] == "distance-geodesic-v1"
    finally:
        with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                "delete from public.incidents where external_id = %s",
                (incident_record.external_id,),
            )
            cursor.execute(
                "delete from public.industrial_sites where siret = any(%s)",
                (["90000000100011", "90000000200012"],),
            )
            cursor.execute(
                """
                delete from public.data_sources
                where name in ('Fixture incident pytest', 'Fixture distance pytest')
                """
            )
