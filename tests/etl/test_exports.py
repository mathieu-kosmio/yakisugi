from __future__ import annotations

import csv
import io
import json
import os
import zipfile
from datetime import date
from pathlib import Path

import geopandas as gpd
import psycopg
import pytest
from pypdf import PdfReader
from shapely.geometry import Polygon

from scripts.exports.generate_export import (
    ExportData,
    generate_export,
    load_export_data,
    persist_export_record,
    upload_export_archive,
)
from scripts.import_incident import (
    IncidentRecord,
    file_checksum,
    persist_incident,
    prepare_incident,
)


def sample_export_data() -> ExportData:
    return ExportData(
        incident={
            "id": "11111111-1111-4111-8111-111111111111",
            "slug": "saumos-2026",
            "name": "Saumos 2026",
            "external_id": "EMSR899",
            "start_date": date(2026, 7, 22),
            "source_name": "Source test",
            "source_url": "https://example.test/incident",
            "source_date": date(2026, 7, 23),
            "area_ha": 1200,
        },
        parcels=(
            {
                "commune_name": "Saumos",
                "insee_code": "33448",
                "section": "AB",
                "parcel_number": "0042",
                "parcel_uid": "33448000AB0042",
                "parcel_area_ha": 7.6,
                "affected_area_ha": 6.9,
                "affected_ratio": 0.91,
                "forest_area_ha": 6.5,
                "dominant_species": "Pin maritime",
                "estimated_volume_min_m3": None,
                "estimated_volume_max_m3": None,
                "confidence": "high",
                "methodology_version": "parcel-forest-v1",
                "longitude": -1.04,
                "latitude": 45.02,
                "geometry": json.dumps(
                    {
                        "type": "Polygon",
                        "coordinates": [
                            [[-1.05, 45], [-1.03, 45], [-1.03, 45.02], [-1.05, 45]]
                        ],
                    }
                ),
            },
        ),
        industries=(
            {
                "siret": "10000000100011",
                "company_name": "Scierie des Pins",
                "naf_code": "16.10A",
                "category": "SAWMILL",
                "address": "1 route des Pins",
                "commune": "Salaunes",
                "distance_km": 18.2,
                "longitude": -0.83,
                "latitude": 44.94,
            },
        ),
        forest_area_ha=944.2,
    )


def test_generate_export_creates_deterministic_complete_archive(tmp_path: Path) -> None:
    data = sample_export_data()

    first = generate_export(data, tmp_path / "first")
    second = generate_export(data, tmp_path / "second")

    assert first.sha256 == second.sha256
    with zipfile.ZipFile(first.path) as archive:
        assert set(archive.namelist()) == {
            "README.pdf",
            "parcelles.csv",
            "parcelles.geojson",
            "industriels.csv",
            "statistiques.csv",
            "methodology.txt",
        }
        parcel_rows = list(
            csv.DictReader(io.StringIO(archive.read("parcelles.csv").decode("utf-8-sig")))
        )
        assert parcel_rows[0]["volume_min_m3"] == ""
        assert parcel_rows[0]["volume_max_m3"] == ""
        geojson = json.loads(archive.read("parcelles.geojson"))
        assert geojson["features"][0]["id"] == "33448000AB0042"
        assert geojson["features"][0]["geometry"]["type"] == "Polygon"
        pdf = PdfReader(io.BytesIO(archive.read("README.pdf")))
        assert len(pdf.pages) == 1
        text = pdf.pages[0].extract_text()
        assert "Saumos 2026" in text
        assert "Volume" not in text or "vides" in text


def test_upload_export_archive_uses_private_storage_endpoint(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    result = generate_export(sample_export_data(), tmp_path)
    captured = {}

    class Response:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["authorization"] = request.get_header("Authorization")
        captured["content_type"] = request.get_header("Content-type")
        captured["body"] = request.data
        captured["timeout"] = timeout
        return Response()

    monkeypatch.setattr("scripts.exports.generate_export.urlopen", fake_urlopen)
    upload_export_archive(
        result,
        "https://project.supabase.co/",
        "service-role-test",
        "incident-exports",
    )

    assert captured["url"].endswith(
        "/storage/v1/object/incident-exports/bois-sinistre-saumos-2026.zip"
    )
    assert captured["authorization"] == "Bearer service-role-test"
    assert captured["content_type"] == "application/zip"
    assert captured["body"] == result.path.read_bytes()
    assert captured["timeout"] == 60


@pytest.mark.skipif(
    not os.environ.get("YAKISUGI_TEST_DATABASE_URL"),
    reason="YAKISUGI_TEST_DATABASE_URL absent",
)
def test_export_loads_full_postgis_data_and_records_checksum(tmp_path: Path) -> None:
    database_url = os.environ["YAKISUGI_TEST_DATABASE_URL"]
    incident_file = tmp_path / "incident.geojson"
    gpd.GeoDataFrame(
        geometry=[Polygon([(0, 0), (0.02, 0), (0.02, 0.02), (0, 0.02)])],
        crs="EPSG:4326",
    ).to_file(incident_file, driver="GeoJSON")
    record = IncidentRecord(
        slug="export-integration-test",
        name="Export integration test",
        external_id="YAKISUGI-EXPORT-INTEGRATION-TEST",
        start_date=date(2026, 7, 22),
        source_name="Fixture export pytest",
        source_url="https://example.test/incident",
        source_date=None,
        department_codes=(),
        checksum=file_checksum(incident_file),
    )

    try:
        incident_result = persist_incident(database_url, prepare_incident(incident_file), record)
        with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                insert into public.affected_forests (
                  incident_id, forest_source_id, forest_type_label, dominant_species,
                  area_ha, affected_ratio, geometry
                ) values (
                  %s, 'export:forest-1', 'Futaie de conifères', 'Pin maritime',
                  1, 1,
                  extensions.ST_Multi(extensions.ST_GeomFromText(
                    'POLYGON((0 0,0.01 0,0.01 0.01,0 0.01,0 0))', 4326
                  ))
                )
                """,
                (incident_result.incident_id,),
            )
            cursor.execute(
                """
                insert into public.affected_parcels (
                  incident_id, insee_code, commune_name, section, parcel_number,
                  parcel_uid, parcel_area_ha, affected_area_ha, affected_ratio,
                  forest_area_ha, dominant_species, confidence, geometry, centroid,
                  methodology_version
                ) values (
                  %s, '33448', 'Saumos', 'AB', '0042', 'EXPORT33448AB0042',
                  1, 1, 1, 1, 'Pin maritime', 'high',
                  extensions.ST_Multi(extensions.ST_GeomFromText(
                    'POLYGON((0 0,0.01 0,0.01 0.01,0 0.01,0 0))', 4326
                  )),
                  extensions.ST_GeomFromText('POINT(0.005 0.005)', 4326),
                  'parcel-forest-v1'
                )
                """,
                (incident_result.incident_id,),
            )
            cursor.execute(
                """
                insert into public.industrial_sites (
                  siret, siren, company_name, naf_code, category, address,
                  postal_code, commune, longitude, latitude, location
                ) values (
                  '91000000100011', '910000001', 'Scierie export', '16.10A',
                  'SAWMILL', '1 rue du Bois', '33000', 'Bordeaux', 0.1, 0,
                  extensions.ST_SetSRID(extensions.ST_MakePoint(0.1, 0), 4326)
                ) returning id
                """
            )
            site_id = cursor.fetchone()[0]
            cursor.execute(
                """
                insert into public.incident_industrial_sites (
                  incident_id, industrial_site_id, distance_km, distance_band,
                  methodology_version
                ) values (%s, %s, 11.1, '0_25', 'distance-geodesic-v1')
                """,
                (incident_result.incident_id, site_id),
            )

        data = load_export_data(database_url, record.external_id)
        result = generate_export(data, tmp_path / "exports")
        persist_export_record(database_url, incident_result.incident_id, result)

        assert result.parcel_count == 1
        assert result.industry_count == 1
        with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                "select sha256, methodology_version from public.exports where storage_path = %s",
                (result.path.name,),
            )
            checksum, methodology = cursor.fetchone()
        assert checksum == result.sha256
        assert methodology == "export-v1"
    finally:
        with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                "delete from public.exports where storage_path = 'bois-sinistre-export-integration-test.zip'"
            )
            cursor.execute(
                "delete from public.incidents where external_id = %s",
                (record.external_id,),
            )
            cursor.execute("delete from public.industrial_sites where siret = '91000000100011'")
            cursor.execute(
                "delete from public.data_sources where metadata ->> 'external_id' = %s",
                (record.external_id,),
            )
