from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path

import geopandas as gpd
import psycopg
import pytest
from shapely.geometry import Point, Polygon

from scripts.import_incident import (
    IncidentImportError,
    IncidentRecord,
    file_checksum,
    main,
    persist_incident,
    prepare_incident,
    slugify,
)


def write_geojson(path: Path, geometries: list, crs: str = "EPSG:4326") -> Path:
    frame = gpd.GeoDataFrame(
        {"feature_id": [f"feature-{index}" for index in range(len(geometries))]},
        geometry=geometries,
        crs=crs,
    )
    frame.to_file(path, driver="GeoJSON")
    return path


def test_prepare_incident_dissolves_polygons_and_calculates_area(tmp_path: Path) -> None:
    source = write_geojson(
        tmp_path / "incident.geojson",
        [
            Polygon([(-1.0, 45.0), (-0.999, 45.0), (-0.999, 45.001), (-1.0, 45.001)]),
            Polygon(
                [(-0.999, 45.0), (-0.998, 45.0), (-0.998, 45.001), (-0.999, 45.001)]
            ),
        ],
    )

    incident = prepare_incident(source)

    assert incident.geometry.geom_type == "MultiPolygon"
    assert incident.source_feature_count == 2
    assert incident.repaired_feature_count == 0
    assert 1.7 < incident.area_ha < 1.8


def test_prepare_incident_reprojects_and_repairs_invalid_polygon(tmp_path: Path) -> None:
    invalid = Polygon([(0, 0), (100, 100), (100, 0), (0, 100), (0, 0)])
    source = write_geojson(tmp_path / "invalid.geojson", [invalid], crs="EPSG:3857")

    incident = prepare_incident(source)

    assert incident.geometry.is_valid
    assert incident.repaired_feature_count == 1
    assert incident.area_ha > 0
    min_x, min_y, max_x, max_y = incident.geometry.bounds
    assert -180 <= min_x <= max_x <= 180
    assert -90 <= min_y <= max_y <= 90


def test_prepare_incident_rejects_non_polygon_geometry(tmp_path: Path) -> None:
    source = write_geojson(tmp_path / "point.geojson", [Point(-1, 45)])

    with pytest.raises(IncidentImportError, match="un polygone est requis"):
        prepare_incident(source)


def test_prepare_incident_rejects_missing_crs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = tmp_path / "without-crs.geojson"
    source.touch()
    frame_without_crs = gpd.GeoDataFrame(
        geometry=[Polygon([(0, 0), (1, 0), (1, 1), (0, 0)])]
    )
    monkeypatch.setattr(gpd, "read_file", lambda _: frame_without_crs)

    with pytest.raises(IncidentImportError, match="coordonnées source est absent"):
        prepare_incident(source)


def test_slugify_normalizes_french_text() -> None:
    assert slugify("Incendie de Saumos Été 2026") == "incendie-de-saumos-ete-2026"


def test_cli_dry_run_returns_structured_summary(tmp_path: Path, capsys: pytest.CaptureFixture) -> None:
    source = write_geojson(
        tmp_path / "incident.geojson",
        [Polygon([(-1, 45), (-0.999, 45), (-0.999, 45.001), (-1, 45.001)])],
    )

    exit_code = main(
        [
            "--file",
            str(source),
            "--name",
            "Saumos 2026",
            "--external-id",
            "TEST-DRY-RUN",
            "--start-date",
            "2026-07-22",
            "--source-url",
            "https://example.test/source",
            "--dry-run",
        ]
    )

    assert exit_code == 0
    output = json.loads(capsys.readouterr().out)
    assert output["status"] == "validated"
    assert output["crs"] == "EPSG:4326"
    assert output["source_feature_count"] == 1
    assert "incident_id" not in output


def test_cli_requires_database_url_outside_dry_run(
    tmp_path: Path, capsys: pytest.CaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    source = write_geojson(
        tmp_path / "incident.geojson",
        [Polygon([(-1, 45), (-0.999, 45), (-0.999, 45.001), (-1, 45.001)])],
    )

    exit_code = main(
        [
            "--file",
            str(source),
            "--name",
            "Saumos 2026",
            "--external-id",
            "TEST-NO-DB",
            "--start-date",
            "2026-07-22",
            "--source-url",
            "https://example.test/source",
        ]
    )

    assert exit_code == 1
    output = json.loads(capsys.readouterr().err)
    assert "DATABASE_URL" in output["error"]


@pytest.mark.skipif(
    not os.environ.get("YAKISUGI_TEST_DATABASE_URL"),
    reason="YAKISUGI_TEST_DATABASE_URL absent",
)
def test_persist_incident_is_idempotent_against_postgis(tmp_path: Path) -> None:
    database_url = os.environ["YAKISUGI_TEST_DATABASE_URL"]
    source = write_geojson(
        tmp_path / "incident.geojson",
        [Polygon([(-1, 45), (-0.999, 45), (-0.999, 45.001), (-1, 45.001)])],
    )
    prepared = prepare_incident(source)
    record = IncidentRecord(
        slug="incident-integration-test",
        name="Incident integration test",
        external_id="YAKISUGI-INTEGRATION-TEST",
        start_date=date(2026, 7, 22),
        source_name="Fixture pytest",
        source_url="https://example.test/source",
        source_date=None,
        department_codes=("33",),
        checksum=file_checksum(source),
    )

    try:
        first = persist_incident(database_url, prepared, record)
        second = persist_incident(database_url, prepared, record)

        assert first.action == "inserted"
        assert second.action == "updated"
        assert first.incident_id == second.incident_id
        with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                select area_ha, extensions.ST_SRID(geometry), department_codes
                from public.incidents where external_id = %s
                """,
                (record.external_id,),
            )
            area_ha, srid, department_codes = cursor.fetchone()
        assert float(area_ha) == prepared.area_ha
        assert srid == 4326
        assert department_codes == ["33"]
    finally:
        with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                "delete from public.incidents where external_id = %s",
                (record.external_id,),
            )
            cursor.execute(
                """
                delete from public.data_sources
                where metadata ->> 'external_id' = %s
                """,
                (record.external_id,),
            )
