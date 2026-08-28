"""Generate a controlled Yakisugi ZIP export from full PostGIS records."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import sys
import tempfile
import zipfile
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote
from urllib.request import Request, urlopen

import psycopg
from psycopg.rows import dict_row
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

METHODOLOGY_VERSION = "export-v1"
ARCHIVE_DATE = (2026, 1, 1, 0, 0, 0)


class ExportGenerationError(ValueError):
    """Raised when an export cannot be generated from complete source data."""


@dataclass(frozen=True)
class ExportData:
    incident: dict[str, Any]
    parcels: tuple[dict[str, Any], ...]
    industries: tuple[dict[str, Any], ...]
    forest_area_ha: float


@dataclass(frozen=True)
class ExportResult:
    path: Path
    sha256: str
    parcel_count: int
    industry_count: int


def _load_export_data(database_url: str, identifier: Any, field: str) -> ExportData:
    if field not in {"id", "external_id"}:
        raise ValueError("Champ d'identification incident non autorisé")
    with (
        psycopg.connect(database_url, row_factory=dict_row) as connection,
        connection.cursor() as cursor,
    ):
        cursor.execute(
            f"""
            select id, slug, name, external_id, start_date, source_name, source_url,
                   source_date, area_ha
            from public.incidents where {field} = %s
            """,
            (identifier,),
        )
        incident = cursor.fetchone()
        if not incident:
            raise ExportGenerationError(f"Incident inconnu : {identifier}")

        cursor.execute(
            """
            select commune_name, insee_code, section, parcel_number, parcel_uid,
                   parcel_area_ha, affected_area_ha, affected_ratio, forest_area_ha,
                   dominant_species, estimated_volume_min_m3, estimated_volume_max_m3,
                   confidence, methodology_version,
                   extensions.ST_X(centroid) as longitude,
                   extensions.ST_Y(centroid) as latitude,
                   extensions.ST_AsGeoJSON(geometry) as geometry
            from public.affected_parcels
            where incident_id = %s
            order by parcel_uid
            """,
            (incident["id"],),
        )
        parcels = tuple(dict(row) for row in cursor.fetchall())

        cursor.execute(
            """
            select site.siret, site.company_name, site.naf_code, site.category,
                   site.address, site.commune, proximity.distance_km,
                   site.longitude, site.latitude
            from public.incident_industrial_sites proximity
            join public.industrial_sites site on site.id = proximity.industrial_site_id
            where proximity.incident_id = %s
            order by proximity.distance_km, site.siret
            """,
            (incident["id"],),
        )
        industries = tuple(dict(row) for row in cursor.fetchall())

        cursor.execute(
            "select coalesce(sum(area_ha), 0) from public.affected_forests where incident_id = %s",
            (incident["id"],),
        )
        forest_area_ha = float(cursor.fetchone()["coalesce"])

    return ExportData(
        incident=dict(incident),
        parcels=parcels,
        industries=industries,
        forest_area_ha=forest_area_ha,
    )


def load_export_data(database_url: str, incident_external_id: str) -> ExportData:
    return _load_export_data(database_url, incident_external_id, "external_id")


def load_export_data_by_incident_id(database_url: str, incident_id: Any) -> ExportData:
    return _load_export_data(database_url, incident_id, "id")


def _csv_bytes(fieldnames: Sequence[str], rows: Sequence[dict[str, Any]]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({key: "" if value is None else value for key, value in row.items()})
    return ("\ufeff" + stream.getvalue()).encode("utf-8")


def parcels_csv(data: ExportData) -> bytes:
    rows = [
        {
            "incident": data.incident["name"],
            "commune": parcel["commune_name"],
            "code_insee": parcel["insee_code"],
            "section": parcel["section"],
            "numero": parcel["parcel_number"],
            "surface_parcelle_ha": parcel["parcel_area_ha"],
            "surface_affectee_ha": parcel["affected_area_ha"],
            "ratio_affecte": parcel["affected_ratio"],
            "surface_forestiere_ha": parcel["forest_area_ha"],
            "essence_dominante": parcel["dominant_species"],
            "volume_min_m3": parcel["estimated_volume_min_m3"],
            "volume_max_m3": parcel["estimated_volume_max_m3"],
            "niveau_confiance": parcel["confidence"],
            "longitude": parcel["longitude"],
            "latitude": parcel["latitude"],
        }
        for parcel in data.parcels
    ]
    return _csv_bytes(
        [
            "incident",
            "commune",
            "code_insee",
            "section",
            "numero",
            "surface_parcelle_ha",
            "surface_affectee_ha",
            "ratio_affecte",
            "surface_forestiere_ha",
            "essence_dominante",
            "volume_min_m3",
            "volume_max_m3",
            "niveau_confiance",
            "longitude",
            "latitude",
        ],
        rows,
    )


def industries_csv(data: ExportData) -> bytes:
    rows = [
        {
            "siret": site["siret"],
            "entreprise": site["company_name"],
            "ape": site["naf_code"],
            "categorie": site["category"],
            "adresse": site["address"],
            "commune": site["commune"],
            "distance_incident_km": site["distance_km"],
            "longitude": site["longitude"],
            "latitude": site["latitude"],
        }
        for site in data.industries
    ]
    return _csv_bytes(
        [
            "siret",
            "entreprise",
            "ape",
            "categorie",
            "adresse",
            "commune",
            "distance_incident_km",
            "longitude",
            "latitude",
        ],
        rows,
    )


def parcels_geojson(data: ExportData) -> bytes:
    features = []
    for parcel in data.parcels:
        properties = {
            key: value
            for key, value in parcel.items()
            if key != "geometry"
        }
        features.append(
            {
                "type": "Feature",
                "id": parcel["parcel_uid"],
                "properties": properties,
                "geometry": json.loads(parcel["geometry"]),
            }
        )
    return (
        json.dumps(
            {"type": "FeatureCollection", "features": features},
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
            default=str,
        )
        + "\n"
    ).encode()


def statistics_csv(data: ExportData) -> bytes:
    within_25 = sum(float(site["distance_km"]) < 25 for site in data.industries)
    within_50 = sum(float(site["distance_km"]) < 50 for site in data.industries)
    within_100 = sum(float(site["distance_km"]) < 100 for site in data.industries)
    rows = [
        {"indicateur": "surface_incident", "valeur": data.incident["area_ha"], "unite": "ha"},
        {"indicateur": "surface_forestiere", "valeur": data.forest_area_ha, "unite": "ha"},
        {"indicateur": "parcelles", "valeur": len(data.parcels), "unite": "nombre"},
        {"indicateur": "industries_moins_25_km", "valeur": within_25, "unite": "nombre"},
        {"indicateur": "industries_moins_50_km", "valeur": within_50, "unite": "nombre"},
        {"indicateur": "industries_moins_100_km", "valeur": within_100, "unite": "nombre"},
        {"indicateur": "volume_min_m3", "valeur": None, "unite": "m3"},
        {"indicateur": "volume_max_m3", "valeur": None, "unite": "m3"},
    ]
    return _csv_bytes(["indicateur", "valeur", "unite"], rows)


def methodology_text(data: ExportData) -> bytes:
    text = f"""YAKISUGI - METHODOLOGIE D'EXPORT

Version : {METHODOLOGY_VERSION}
Incident : {data.incident['name']}
Identifiant externe : {data.incident['external_id'] or 'non renseigne'}
Source : {data.incident['source_name']}
URL source : {data.incident['source_url']}
Date source : {data.incident['source_date'] or 'non renseignee'}

Les surfaces proviennent d'intersections géométriques hors ligne en EPSG:4326.
Les distances industrielles sont géodésiques et calculées à vol d'oiseau.
Les géométries GeoJSON sont les géométries complètes réservées à l'export.
Les volumes restent vides sans coefficient forestier documenté et validé.

Limites : absence d'inventaire terrain, qualité du bois inconnue, état sanitaire
non déterminé, exploitabilité et desserte non vérifiées, aucun propriétaire cadastral.
"""
    return text.encode()


def _invariant_canvas(*args, **kwargs):
    kwargs["invariant"] = 1
    return canvas.Canvas(*args, **kwargs)


def build_readme_pdf(path: Path, data: ExportData) -> None:
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="YakisugiTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=26,
            leading=30,
            textColor=colors.HexColor("#173f2a"),
            spaceAfter=8 * mm,
        )
    )
    styles.add(
        ParagraphStyle(
            name="YakisugiHeading",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=14,
            textColor=colors.HexColor("#c75b2b"),
            spaceBefore=5 * mm,
            spaceAfter=2 * mm,
        )
    )
    document = SimpleDocTemplate(
        str(path),
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"Export Yakisugi - {data.incident['name']}",
        author="Yakisugi",
    )
    metrics = Table(
        [
            ["Périmètre", "Forêt affectée", "Parcelles", "Industries"],
            [
                f"{float(data.incident['area_ha']):,.1f} ha",
                f"{data.forest_area_ha:,.1f} ha",
                str(len(data.parcels)),
                str(len(data.industries)),
            ],
        ],
        colWidths=[40 * mm] * 4,
    )
    metrics.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#173f2a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#dce8d7")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d7dbd1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d7dbd1")),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story = [
        Paragraph("Yakisugi", styles["YakisugiTitle"]),
        Paragraph(data.incident["name"], styles["Heading1"]),
        Paragraph(
            "Archive professionnelle des parcelles forestières potentiellement affectées et des sites industriels proches.",
            styles["BodyText"],
        ),
        Spacer(1, 7 * mm),
        metrics,
        Paragraph("Contenu de l'archive", styles["YakisugiHeading"]),
        Paragraph(
            "parcelles.csv, parcelles.geojson, industriels.csv, statistiques.csv et methodology.txt.",
            styles["BodyText"],
        ),
        Paragraph("Provenance", styles["YakisugiHeading"]),
        Paragraph(
            f"Source incident : {data.incident['source_name']}<br/>URL : {data.incident['source_url']}<br/>Date : {data.incident['source_date'] or 'non renseignée'}",
            styles["BodyText"],
        ),
        Paragraph("Lecture des données", styles["YakisugiHeading"]),
        Paragraph(
            "Les surfaces sont des calculs géographiques. Les distances sont mesurées à vol d'oiseau. Les champs de volume sont vides lorsqu'aucun coefficient documenté et validé n'est disponible.",
            styles["BodyText"],
        ),
        Paragraph("Limites", styles["YakisugiHeading"]),
        Paragraph(
            "Cet export ne remplace pas un inventaire terrain. La qualité du bois, son état sanitaire, son exploitabilité, la desserte et la propriété ne sont pas vérifiés.",
            styles["BodyText"],
        ),
    ]
    document.build(story, canvasmaker=_invariant_canvas)


def _write_deterministic_zip(path: Path, files: dict[str, bytes]) -> None:
    with zipfile.ZipFile(path, "w") as archive:
        for name in sorted(files):
            info = zipfile.ZipInfo(name, date_time=ARCHIVE_DATE)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, files[name])


def generate_export(data: ExportData, output_directory: Path) -> ExportResult:
    output_directory.mkdir(parents=True, exist_ok=True)
    filename = f"bois-sinistre-{data.incident['slug']}.zip"
    output_path = output_directory / filename
    with tempfile.TemporaryDirectory(prefix="yakisugi-export-") as temporary:
        readme_path = Path(temporary) / "README.pdf"
        build_readme_pdf(readme_path, data)
        files = {
            "README.pdf": readme_path.read_bytes(),
            "industriels.csv": industries_csv(data),
            "methodology.txt": methodology_text(data),
            "parcelles.csv": parcels_csv(data),
            "parcelles.geojson": parcels_geojson(data),
            "statistiques.csv": statistics_csv(data),
        }
        _write_deterministic_zip(output_path, files)
    checksum = hashlib.sha256(output_path.read_bytes()).hexdigest()
    return ExportResult(output_path, checksum, len(data.parcels), len(data.industries))


def persist_export_record(database_url: str, incident_id: Any, result: ExportResult) -> str:
    with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            insert into public.exports (incident_id, storage_path, sha256, methodology_version)
            values (%s, %s, %s, %s)
            on conflict (storage_path) do update set
              incident_id = excluded.incident_id,
              sha256 = excluded.sha256,
              methodology_version = excluded.methodology_version,
              generated_at = now()
            returning id
            """,
            (incident_id, result.path.name, result.sha256, METHODOLOGY_VERSION),
        )
        return str(cursor.fetchone()[0])


def upload_export_archive(
    result: ExportResult,
    supabase_url: str,
    service_role_key: str,
    bucket: str,
) -> None:
    object_path = quote(result.path.name, safe="")
    bucket_path = quote(bucket, safe="")
    request = Request(
        f"{supabase_url.rstrip('/')}/storage/v1/object/{bucket_path}/{object_path}",
        data=result.path.read_bytes(),
        method="POST",
        headers={
            "Authorization": f"Bearer {service_role_key}",
            "apikey": service_role_key,
            "Content-Type": "application/zip",
            "x-upsert": "true",
        },
    )
    with urlopen(request, timeout=60) as response:
        if not 200 <= response.status < 300:
            raise ExportGenerationError(f"Échec de l'upload Storage : HTTP {response.status}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--incident", required=True, help="Identifiant externe de l'incident.")
    parser.add_argument("--output-directory", type=Path, default=Path("exports"))
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--upload", action="store_true")
    parser.add_argument("--supabase-url", default=os.environ.get("NEXT_PUBLIC_SUPABASE_URL"))
    parser.add_argument(
        "--secret-key",
        "--service-role-key",
        dest="secret_key",
        default=os.environ.get("SUPABASE_SECRET_KEY")
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY"),
    )
    parser.add_argument(
        "--storage-bucket",
        default=os.environ.get("YAKISUGI_EXPORT_BUCKET", "incident-exports"),
    )
    parser.add_argument("--dry-run", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.database_url:
        print(
            json.dumps(
                {"status": "error", "error": "DATABASE_URL ou --database-url est requis."},
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        return 1
    try:
        data = load_export_data(args.database_url, args.incident)
        if args.dry_run:
            output = {
                "status": "validated",
                "incident": data.incident["slug"],
                "parcel_count": len(data.parcels),
                "industry_count": len(data.industries),
            }
        else:
            result = generate_export(data, args.output_directory)
            if args.upload:
                if not args.supabase_url or not args.secret_key:
                    raise ExportGenerationError(
                        "--upload requiert NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY"
                    )
                upload_export_archive(
                    result,
                    args.supabase_url,
                    args.secret_key,
                    args.storage_bucket,
                )
            persist_export_record(args.database_url, data.incident["id"], result)
            output = {
                "status": "generated",
                "path": str(result.path),
                "sha256": result.sha256,
                "parcel_count": result.parcel_count,
                "industry_count": result.industry_count,
            }
        print(json.dumps(output, ensure_ascii=False, sort_keys=True))
        return 0
    except (ExportGenerationError, OSError, psycopg.Error) as error:
        print(json.dumps({"status": "error", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
