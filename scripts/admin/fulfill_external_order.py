"""Generate and deliver an export after an administrator verifies external payment."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import sys
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row

from scripts.exports.generate_export import (
    ExportGenerationError,
    generate_export,
    load_export_data_by_incident_id,
    persist_export_record,
    upload_export_archive,
)


class ExternalFulfillmentError(ValueError):
    """Raised when an external request cannot safely be delivered."""


def load_request(database_url: str, request_id: str) -> dict[str, Any]:
    with (
        psycopg.connect(database_url, row_factory=dict_row) as connection,
        connection.cursor() as cursor,
    ):
        cursor.execute(
            """
            select request.id, request.incident_id, request.contact_email,
                   request.status, incident.slug as incident_slug
            from public.export_requests request
            join public.incidents incident on incident.id = request.incident_id
            where request.id = %s
            """,
            (request_id,),
        )
        request = cursor.fetchone()
    if not request:
        raise ExternalFulfillmentError("Demande d'export inconnue")
    if request["status"] in {"cancelled", "delivered"}:
        raise ExternalFulfillmentError(f"Demande non livrable dans l'état {request['status']}")
    return dict(request)


def create_external_order(
    database_url: str,
    request: dict[str, Any],
    export_id: str,
    payment_reference: str,
    amount_total: int,
    token_hash: str,
    paid_at: datetime,
    expires_at: datetime,
) -> None:
    with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            insert into public.orders (
              incident_id, export_id, customer_email, amount_total, currency,
              status, download_token_hash, download_expires_at, paid_at,
              payment_channel, external_payment_reference, export_request_id
            ) values (%s, %s, %s, %s, 'eur', 'paid', %s, %s, %s, 'external', %s, %s)
            """,
            (
                request["incident_id"],
                export_id,
                request["contact_email"],
                amount_total,
                token_hash,
                expires_at,
                paid_at,
                payment_reference,
                request["id"],
            ),
        )
        cursor.execute(
            """
            update public.export_requests
            set status = 'delivered', paid_at = %s, delivered_at = %s, updated_at = %s
            where id = %s
            """,
            (paid_at, paid_at, paid_at, request["id"]),
        )


def fulfill_external_order(
    *,
    database_url: str,
    request_id: str,
    payment_reference: str,
    amount_total: int,
    app_url: str,
    output_directory: Path,
    supabase_url: str | None,
    secret_key: str | None,
    storage_bucket: str,
    upload: bool = True,
    now: datetime | None = None,
) -> dict[str, Any]:
    if amount_total < 0:
        raise ExternalFulfillmentError("Le montant doit être positif ou nul")
    payment_reference = payment_reference.strip()
    if not payment_reference:
        raise ExternalFulfillmentError("La référence de paiement est requise")
    if upload and (not supabase_url or not secret_key):
        raise ExternalFulfillmentError("L'upload requiert l'URL et la clé secrète Supabase")

    request = load_request(database_url, request_id)
    data = load_export_data_by_incident_id(database_url, request["incident_id"])
    result = generate_export(data, output_directory)
    if upload:
        upload_export_archive(result, supabase_url or "", secret_key or "", storage_bucket)
    export_id = persist_export_record(database_url, request["incident_id"], result)

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    paid_at = now or datetime.now(UTC)
    expires_at = paid_at + timedelta(days=7)
    create_external_order(
        database_url,
        request,
        export_id,
        payment_reference,
        amount_total,
        token_hash,
        paid_at,
        expires_at,
    )
    return {
        "status": "delivered",
        "request_id": request_id,
        "incident": request["incident_slug"],
        "archive": result.path.name,
        "sha256": result.sha256,
        "download_url": f"{app_url.rstrip('/')}/api/download/{token}",
        "download_expires_at": expires_at.isoformat(),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", required=True, dest="request_id")
    parser.add_argument("--payment-reference", required=True)
    parser.add_argument("--amount-total-cents", required=True, type=int)
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--app-url", default=os.environ.get("APP_URL"))
    parser.add_argument("--output-directory", type=Path, default=Path("exports"))
    parser.add_argument("--supabase-url", default=os.environ.get("NEXT_PUBLIC_SUPABASE_URL"))
    parser.add_argument(
        "--secret-key",
        default=os.environ.get("SUPABASE_SECRET_KEY")
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY"),
    )
    parser.add_argument(
        "--storage-bucket",
        default=os.environ.get("YAKISUGI_EXPORT_BUCKET", "incident-exports"),
    )
    parser.add_argument("--skip-upload", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.database_url or not args.app_url:
        print(
            json.dumps({"status": "error", "error": "DATABASE_URL et APP_URL sont requis"}),
            file=sys.stderr,
        )
        return 1
    try:
        result = fulfill_external_order(
            database_url=args.database_url,
            request_id=args.request_id,
            payment_reference=args.payment_reference,
            amount_total=args.amount_total_cents,
            app_url=args.app_url,
            output_directory=args.output_directory,
            supabase_url=args.supabase_url,
            secret_key=args.secret_key,
            storage_bucket=args.storage_bucket,
            upload=not args.skip_upload,
        )
    except (ExternalFulfillmentError, ExportGenerationError, OSError, psycopg.Error) as error:
        print(json.dumps({"status": "error", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
