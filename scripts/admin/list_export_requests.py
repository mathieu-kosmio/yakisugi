"""List professional export requests without exposing contact details by default."""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Sequence
from typing import Any

import psycopg
from psycopg.rows import dict_row


def mask_email(value: str) -> str:
    local, separator, domain = value.partition("@")
    if not separator:
        return "***"
    visible = local[:1]
    return f"{visible}{'*' * max(3, len(local) - 1)}@{domain}"


def list_requests(
    database_url: str,
    statuses: Sequence[str],
    include_contact: bool = False,
) -> list[dict[str, Any]]:
    with (
        psycopg.connect(database_url, row_factory=dict_row) as connection,
        connection.cursor() as cursor,
    ):
        cursor.execute(
            """
            select request.id, request.status, request.organization,
                   request.intended_use, request.contact_email, request.created_at,
                   incident.slug as incident_slug, incident.name as incident_name
            from public.export_requests request
            join public.incidents incident on incident.id = request.incident_id
            where request.status = any(%s::public.export_request_status[])
            order by request.created_at
            """,
            (list(statuses),),
        )
        rows = [dict(row) for row in cursor.fetchall()]
    for row in rows:
        if not include_contact:
            row["contact_email"] = mask_email(row["contact_email"])
    return rows


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument(
        "--status",
        action="append",
        dest="statuses",
        default=None,
        help="État à inclure. Option répétable.",
    )
    parser.add_argument("--include-contact", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.database_url:
        print(json.dumps({"status": "error", "error": "DATABASE_URL requis"}), file=sys.stderr)
        return 1
    statuses = args.statuses or ["new", "contacted", "quoted", "payment_pending", "paid"]
    try:
        requests = list_requests(args.database_url, statuses, args.include_contact)
    except psycopg.Error as error:
        print(json.dumps({"status": "error", "error": str(error)}), file=sys.stderr)
        return 1
    print(json.dumps({"status": "ok", "requests": requests}, default=str, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
