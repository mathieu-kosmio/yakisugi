from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path

import geopandas as gpd
import psycopg
import pytest
from shapely.geometry import MultiPolygon, Polygon

from scripts.import_forest import (
    ForestImportError,
    persist_forests,
    prepare_forests,
)
from scripts.import_forest import (
    main as import_forest_main,
)
from scripts.import_incident import (
    IncidentRecord,
    file_checksum,
    persist_incident,
    prepare_incident,
)
from scripts.process_forests import (
    SourceForest,
    intersect_forests,
    process_forests,
)
from scripts.process_forests import (
    main as process_forests_main,
)


def write_forest_file(path: Path, geometries: list[Polygon]) -> Path:
    frame = gpd.GeoDataFrame(
        {
            "ID": [f"forest-{index}" for index in range(len(geometries))],
            "CODE_TFV": ["FF1"] * len(geometries),
            "TFV": ["Futaie de conifères"] * len(geometries),
            "ESSENCE": ["Pin maritime"] * len(geometries),
        },
        geometry=geometries,
        crs="EPSG:4326",
    )
    frame.to_file(path, driver="GeoJSON")
    return path


def test_prepare_forests_maps_fields_and_namespaces_ids(tmp_path: Path) -> None:
    source = write_forest_file(
        tmp_path / "forest.geojson",
        [Polygon([(-1, 45), (-0.99, 45), (-0.99, 45.01), (-1, 45.01)])],
    )

    batch = prepare_forests(source, "33", species_column="ESSENCE")

    assert batch.department_code == "33"
    assert batch.repaired_feature_count == 0
    assert len(batch.forests) == 1
    forest = batch.forests[0]
    assert forest.forest_source_id == "33:forest-0"
    assert forest.forest_type_code == "FF1"
    assert forest.forest_type_label == "Futaie de conifères"
    assert forest.dominant_species == "Pin maritime"
    assert forest.geometry.geom_type == "MultiPolygon"


def test_prepare_forests_rejects_missing_mapping_column(tmp_path: Path) -> None:
    source = write_forest_file(
        tmp_path / "forest.geojson",
        [Polygon([(-1, 45), (-0.99, 45), (-0.99, 45.01), (-1, 45.01)])],
    )

    with pytest.raises(ForestImportError, match="NOT_A_COLUMN"):
        prepare_forests(source, "33", type_label_column="NOT_A_COLUMN")


def test_intersect_forests_keeps_only_affected_surface() -> None:
    incident = Polygon([(0, 0), (2, 0), (2, 2), (0, 2)])
    crossing = MultiPolygon([Polygon([(1, 1), (3, 1), (3, 3), (1, 3)])])
    outside = MultiPolygon([Polygon([(4, 4), (5, 4), (5, 5), (4, 5)])])
    forests = (
        SourceForest("33:inside", "FF1", "Conifères", "Pin", "source-1", crossing),
        SourceForest("33:outside", "FF2", "Feuillus", "Chêne", "source-1", outside),
    )

    affected = intersect_forests(incident, forests)

    assert len(affected) == 1
    assert affected[0].forest_source_id == "33:inside"
    assert 0.24 < affected[0].affected_ratio < 0.26
    assert affected[0].area_ha > 0


def test_import_forest_cli_dry_run_returns_summary(
    tmp_path: Path, capsys: pytest.CaptureFixture
) -> None:
    source = write_forest_file(
        tmp_path / "forest.geojson",
        [Polygon([(-1, 45), (-0.99, 45), (-0.99, 45.01), (-1, 45.01)])],
    )

    exit_code = import_forest_main(
        [
            "--file",
            str(source),
            "--department",
            "33",
            "--source-url",
            "https://example.test/forest",
            "--species-column",
            "ESSENCE",
            "--dry-run",
        ]
    )

    assert exit_code == 0
    output = json.loads(capsys.readouterr().out)
    assert output["status"] == "validated"
    assert output["feature_count"] == 1


def test_process_forests_cli_requires_database_url(
    capsys: pytest.CaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)

    exit_code = process_forests_main(["--incident", "TEST"])

    assert exit_code == 1
    assert "DATABASE_URL" in json.loads(capsys.readouterr().err)["error"]


@pytest.mark.skipif(
    not os.environ.get("YAKISUGI_TEST_DATABASE_URL"),
    reason="YAKISUGI_TEST_DATABASE_URL absent",
)
def test_forest_pipeline_persists_only_intersections(tmp_path: Path) -> None:
    database_url = os.environ["YAKISUGI_TEST_DATABASE_URL"]
    incident_file = tmp_path / "incident.geojson"
    gpd.GeoDataFrame(
        geometry=[Polygon([(0, 0), (0.02, 0), (0.02, 0.02), (0, 0.02)])],
        crs="EPSG:4326",
    ).to_file(incident_file, driver="GeoJSON")
    forest_file = write_forest_file(
        tmp_path / "forest.geojson",
        [
            Polygon([(0.01, 0.01), (0.03, 0.01), (0.03, 0.03), (0.01, 0.03)]),
            Polygon([(1, 1), (1.01, 1), (1.01, 1.01), (1, 1.01)]),
        ],
    )
    incident = prepare_incident(incident_file)
    incident_record = IncidentRecord(
        slug="forest-pipeline-integration-test",
        name="Forest pipeline integration test",
        external_id="YAKISUGI-FOREST-INTEGRATION-TEST",
        start_date=date(2026, 7, 22),
        source_name="Fixture pytest",
        source_url="https://example.test/incident",
        source_date=None,
        department_codes=("99",),
        checksum=file_checksum(incident_file),
    )
    batch = prepare_forests(forest_file, "99", species_column="ESSENCE")

    try:
        persist_incident(database_url, incident, incident_record)
        inserted = persist_forests(
            database_url,
            batch,
            source_name="Fixture forest pytest",
            source_url="https://example.test/forest",
            source_date=None,
            checksum=file_checksum(forest_file),
        )
        result = process_forests(database_url, incident_record.external_id)
        second_result = process_forests(database_url, incident_record.external_id)

        assert inserted == 2
        assert result.source_forest_count == 2
        assert result.affected_forest_count == 1
        assert result.affected_area_ha > 0
        assert second_result.affected_forest_count == 1
        with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                select count(*), min(affected_ratio), max(affected_ratio)
                from public.affected_forests af
                join public.incidents i on i.id = af.incident_id
                where i.external_id = %s
                """,
                (incident_record.external_id,),
            )
            count, min_ratio, max_ratio = cursor.fetchone()
        assert count == 1
        assert 0 < float(min_ratio) <= float(max_ratio) <= 1
    finally:
        with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                "delete from public.incidents where external_id = %s",
                (incident_record.external_id,),
            )
            cursor.execute("delete from public.forest_raw where department_code = '99'")
            cursor.execute(
                """
                delete from public.data_sources
                where metadata ->> 'external_id' = %s
                   or metadata ->> 'department_code' = '99'
                """,
                (incident_record.external_id,),
            )
