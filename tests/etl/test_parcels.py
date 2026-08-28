from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path

import geopandas as gpd
import psycopg
import pytest
from shapely.geometry import MultiPolygon, Polygon

from scripts.import_forest import persist_forests, prepare_forests
from scripts.import_incident import (
    IncidentRecord,
    _geodesic_area_ha,
    file_checksum,
    persist_incident,
    prepare_incident,
)
from scripts.import_parcels import (
    ParcelImportError,
    persist_parcels,
    prepare_parcels,
)
from scripts.import_parcels import (
    main as import_parcels_main,
)
from scripts.process_forests import SourceForest, process_forests
from scripts.process_parcels import (
    SourceParcel,
    calculate_affected_parcels,
    process_parcels,
)
from scripts.process_parcels import (
    main as process_parcels_main,
)


def write_parcel_file(path: Path, geometries: list[Polygon], insee_code: str = "33448") -> Path:
    frame = gpd.GeoDataFrame(
        {
            "id": [f"{insee_code}000AB{index:04d}" for index in range(len(geometries))],
            "commune": [insee_code] * len(geometries),
            "commune_name": ["Commune test"] * len(geometries),
            "section": ["AB"] * len(geometries),
            "numero": [f"{index:04d}" for index in range(len(geometries))],
        },
        geometry=geometries,
        crs="EPSG:4326",
    )
    frame.to_file(path, driver="GeoJSON")
    return path


def write_forest_file(path: Path, geometry: Polygon) -> Path:
    gpd.GeoDataFrame(
        {
            "ID": ["forest-1"],
            "CODE_TFV": ["FF1"],
            "TFV": ["Futaie de conifères"],
            "ESSENCE": ["Pin maritime"],
        },
        geometry=[geometry],
        crs="EPSG:4326",
    ).to_file(path, driver="GeoJSON")
    return path


def test_prepare_parcels_maps_fields_and_calculates_area(tmp_path: Path) -> None:
    source = write_parcel_file(
        tmp_path / "parcels.geojson",
        [Polygon([(-1, 45), (-0.99, 45), (-0.99, 45.01), (-1, 45.01)])],
    )

    batch = prepare_parcels(source, commune_name_column="commune_name")

    assert batch.insee_codes == ("33448",)
    assert len(batch.parcels) == 1
    parcel = batch.parcels[0]
    assert parcel.parcel_uid == "33448000AB0000"
    assert parcel.commune_name == "Commune test"
    assert parcel.parcel_area_ha > 0
    assert parcel.geometry.geom_type == "MultiPolygon"


def test_prepare_parcels_requires_verified_commune_name(tmp_path: Path) -> None:
    source = write_parcel_file(
        tmp_path / "parcels.geojson",
        [Polygon([(-1, 45), (-0.99, 45), (-0.99, 45.01), (-1, 45.01)])],
    )

    with pytest.raises(ParcelImportError, match="commune-name"):
        prepare_parcels(source)


def test_calculate_affected_parcels_sets_confidence_and_no_volume() -> None:
    parcel_geometry = MultiPolygon([Polygon([(0, 0), (0.02, 0), (0.02, 0.02), (0, 0.02)])])
    parcel = SourceParcel(
        parcel_uid="parcel-1",
        insee_code="00001",
        commune_name="Commune",
        section="AB",
        parcel_number="0001",
        parcel_area_ha=_geodesic_area_ha(parcel_geometry),
        source_id="parcel-source",
        geometry=parcel_geometry,
    )
    forest = SourceForest(
        forest_source_id="00:forest-1",
        forest_type_code="FF1",
        forest_type_label="Futaie de conifères",
        dominant_species="Pin maritime",
        source_id="forest-source",
        geometry=parcel_geometry,
    )

    result = calculate_affected_parcels(parcel_geometry, (parcel,), (forest,))

    assert len(result) == 1
    assert result[0].confidence == "high"
    assert result[0].dominant_species == "Pin maritime"
    assert result[0].affected_ratio == 1
    assert result[0].forest_area_ha == result[0].affected_area_ha
    assert result[0].compositions[0].percentage == 100


def test_calculate_affected_parcels_uses_low_confidence_without_forest() -> None:
    parcel_geometry = MultiPolygon([Polygon([(0, 0), (0.02, 0), (0.02, 0.02), (0, 0.02)])])
    parcel = SourceParcel(
        parcel_uid="parcel-1",
        insee_code="00001",
        commune_name="Commune",
        section="AB",
        parcel_number="0001",
        parcel_area_ha=_geodesic_area_ha(parcel_geometry),
        source_id="parcel-source",
        geometry=parcel_geometry,
    )

    result = calculate_affected_parcels(parcel_geometry, (parcel,), ())

    assert result[0].confidence == "low"
    assert result[0].dominant_species is None
    assert result[0].forest_area_ha == 0
    assert result[0].compositions == ()


def test_import_parcels_cli_dry_run_returns_summary(
    tmp_path: Path, capsys: pytest.CaptureFixture
) -> None:
    source = write_parcel_file(
        tmp_path / "parcels.geojson",
        [Polygon([(-1, 45), (-0.99, 45), (-0.99, 45.01), (-1, 45.01)])],
    )

    exit_code = import_parcels_main(
        [
            "--file",
            str(source),
            "--source-url",
            "https://example.test/cadastre",
            "--commune-name-column",
            "commune_name",
            "--dry-run",
        ]
    )

    assert exit_code == 0
    output = json.loads(capsys.readouterr().out)
    assert output["status"] == "validated"
    assert output["insee_codes"] == ["33448"]


def test_process_parcels_cli_requires_database_url(
    capsys: pytest.CaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)

    exit_code = process_parcels_main(["--incident", "TEST"])

    assert exit_code == 1
    assert "DATABASE_URL" in json.loads(capsys.readouterr().err)["error"]


@pytest.mark.skipif(
    not os.environ.get("YAKISUGI_TEST_DATABASE_URL"),
    reason="YAKISUGI_TEST_DATABASE_URL absent",
)
def test_parcel_pipeline_persists_composition_without_volume(tmp_path: Path) -> None:
    database_url = os.environ["YAKISUGI_TEST_DATABASE_URL"]
    incident_polygon = Polygon([(0, 0), (0.02, 0), (0.02, 0.02), (0, 0.02)])
    incident_file = tmp_path / "incident.geojson"
    gpd.GeoDataFrame(geometry=[incident_polygon], crs="EPSG:4326").to_file(
        incident_file, driver="GeoJSON"
    )
    forest_file = write_forest_file(tmp_path / "forest.geojson", incident_polygon)
    parcel_file = write_parcel_file(
        tmp_path / "parcels.geojson",
        [
            Polygon([(0.005, 0.005), (0.015, 0.005), (0.015, 0.015), (0.005, 0.015)]),
            Polygon([(1, 1), (1.01, 1), (1.01, 1.01), (1, 1.01)]),
        ],
        insee_code="98001",
    )
    incident_record = IncidentRecord(
        slug="parcel-pipeline-integration-test",
        name="Parcel pipeline integration test",
        external_id="YAKISUGI-PARCEL-INTEGRATION-TEST",
        start_date=date(2026, 7, 22),
        source_name="Fixture incident pytest",
        source_url="https://example.test/incident",
        source_date=None,
        department_codes=("98",),
        checksum=file_checksum(incident_file),
    )

    try:
        persist_incident(database_url, prepare_incident(incident_file), incident_record)
        forest_batch = prepare_forests(forest_file, "98", species_column="ESSENCE")
        persist_forests(
            database_url,
            forest_batch,
            source_name="Fixture forest pytest",
            source_url="https://example.test/forest",
            source_date=None,
            checksum=file_checksum(forest_file),
        )
        process_forests(database_url, incident_record.external_id)
        parcel_batch = prepare_parcels(parcel_file, commune_name_column="commune_name")
        persist_parcels(
            database_url,
            parcel_batch,
            source_name="Fixture cadastre pytest",
            source_url="https://example.test/cadastre",
            source_date=None,
            checksum=file_checksum(parcel_file),
        )

        result = process_parcels(database_url, incident_record.external_id)
        second_result = process_parcels(database_url, incident_record.external_id)

        assert result.source_parcel_count == 1
        assert result.affected_parcel_count == 1
        assert second_result.affected_parcel_count == 1
        with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                select p.estimated_volume_min_m3, p.estimated_volume_max_m3,
                       p.confidence, p.dominant_species, count(c.id)
                from public.affected_parcels p
                join public.incidents i on i.id = p.incident_id
                left join public.parcel_forest_compositions c on c.parcel_id = p.id
                where i.external_id = %s
                group by p.id
                """,
                (incident_record.external_id,),
            )
            volume_min, volume_max, confidence, species, composition_count = cursor.fetchone()
        assert volume_min is None
        assert volume_max is None
        assert confidence == "high"
        assert species == "Pin maritime"
        assert composition_count == 1
    finally:
        with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                "delete from public.incidents where external_id = %s",
                (incident_record.external_id,),
            )
            cursor.execute("delete from public.forest_raw where department_code = '98'")
            cursor.execute("delete from public.cadastral_parcels_raw where insee_code = '98001'")
            cursor.execute(
                """
                delete from public.data_sources
                where metadata ->> 'external_id' = %s
                   or metadata ->> 'department_code' = '98'
                   or metadata -> 'insee_codes' ? '98001'
                """,
                (incident_record.external_id,),
            )
