from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import psycopg
import pytest

from scripts.admin.fulfill_external_order import (
    ExternalFulfillmentError,
    fulfill_external_order,
)
from scripts.admin.list_export_requests import mask_email


def test_mask_email_keeps_only_the_minimum_needed_for_identification() -> None:
    assert mask_email("alice@example.test") == "a****@example.test"
    assert mask_email("invalid") == "***"


def test_external_fulfillment_generates_uploads_and_stores_only_token_hash(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    request = {
        "id": "11111111-1111-4111-8111-111111111111",
        "incident_id": "22222222-2222-4222-8222-222222222222",
        "incident_slug": "saumos-2026",
        "contact_email": "client@example.test",
        "status": "paid",
    }
    result = SimpleNamespace(
        path=tmp_path / "bois-sinistre-saumos-2026.zip",
        sha256="a" * 64,
    )
    captured = {}
    monkeypatch.setattr(
        "scripts.admin.fulfill_external_order.load_request", lambda *_args: request
    )
    monkeypatch.setattr(
        "scripts.admin.fulfill_external_order.load_export_data_by_incident_id",
        lambda *_args: object(),
    )
    monkeypatch.setattr(
        "scripts.admin.fulfill_external_order.generate_export", lambda *_args: result
    )
    monkeypatch.setattr(
        "scripts.admin.fulfill_external_order.upload_export_archive", lambda *args: None
    )
    monkeypatch.setattr(
        "scripts.admin.fulfill_external_order.persist_export_record",
        lambda *_args: "33333333-3333-4333-8333-333333333333",
    )
    monkeypatch.setattr(
        "scripts.admin.fulfill_external_order.create_external_order",
        lambda *args: captured.update({"arguments": args}),
    )
    monkeypatch.setattr(
        "scripts.admin.fulfill_external_order.secrets.token_urlsafe",
        lambda _size: "t" * 43,
    )

    output = fulfill_external_order(
        database_url="postgresql://test",
        request_id=request["id"],
        payment_reference="FACTURE-001",
        amount_total=17_880,
        app_url="https://yakisugi.example/",
        output_directory=tmp_path,
        supabase_url="https://project.supabase.co",
        secret_key="secret",
        storage_bucket="incident-exports",
        now=datetime(2026, 8, 20, 12, tzinfo=UTC),
    )

    assert output["download_url"].endswith("/api/download/" + "t" * 43)
    assert output["download_expires_at"] == "2026-08-27T12:00:00+00:00"
    arguments = captured["arguments"]
    assert arguments[4] == 17_880
    assert arguments[5] != "t" * 43
    assert len(arguments[5]) == 64


def test_external_fulfillment_requires_storage_credentials_before_generation(
    tmp_path: Path,
) -> None:
    with pytest.raises(ExternalFulfillmentError, match="clé secrète Supabase"):
        fulfill_external_order(
            database_url="postgresql://test",
            request_id="request",
            payment_reference="FACTURE-001",
            amount_total=100,
            app_url="https://yakisugi.example",
            output_directory=tmp_path,
            supabase_url=None,
            secret_key=None,
            storage_bucket="incident-exports",
        )


@pytest.mark.skipif(
    not os.environ.get("YAKISUGI_TEST_DATABASE_URL"),
    reason="YAKISUGI_TEST_DATABASE_URL absent",
)
def test_external_fulfillment_persists_paid_order_and_delivered_request(
    tmp_path: Path,
) -> None:
    database_url = os.environ["YAKISUGI_TEST_DATABASE_URL"]
    with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            insert into public.incidents (
              slug, name, external_id, start_date, source_name, source_url,
              geometry, area_ha, status
            ) values (
              'external-sale-integration-test', 'External sale integration test',
              'YAKISUGI-EXTERNAL-SALE-TEST', '2026-07-22', 'Fixture pytest',
              'https://example.test/incident',
              extensions.ST_Multi(extensions.ST_GeomFromText(
                'POLYGON((0 0,0.01 0,0.01 0.01,0 0.01,0 0))', 4326
              )), 1, 'published'
            ) returning id
            """
        )
        incident_id = cursor.fetchone()[0]
        cursor.execute(
            """
            insert into public.export_requests (
              incident_id, contact_name, organization, contact_email,
              intended_use, consent_at, status
            ) values (%s, 'Alice Martin', 'Scierie test', 'alice@example.test',
                      'Étude', now(), 'paid') returning id
            """,
            (incident_id,),
        )
        request_id = cursor.fetchone()[0]

    try:
        output = fulfill_external_order(
            database_url=database_url,
            request_id=str(request_id),
            payment_reference="PAYMENT-INTEGRATION-001",
            amount_total=17_880,
            app_url="https://yakisugi.example",
            output_directory=tmp_path,
            supabase_url=None,
            secret_key=None,
            storage_bucket="incident-exports",
            upload=False,
            now=datetime(2026, 8, 20, 12, tzinfo=UTC),
        )

        assert output["status"] == "delivered"
        assert output["download_url"].startswith(
            "https://yakisugi.example/api/download/"
        )
        with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                select orders.payment_channel, orders.external_payment_reference,
                       orders.stripe_checkout_session_id, length(orders.download_token_hash),
                       request.status::text
                from public.orders orders
                join public.export_requests request on request.id = orders.export_request_id
                where request.id = %s
                """,
                (request_id,),
            )
            channel, reference, stripe_session, hash_length, status = cursor.fetchone()
        assert (channel, reference, stripe_session, hash_length, status) == (
            "external",
            "PAYMENT-INTEGRATION-001",
            None,
            64,
            "delivered",
        )
    finally:
        with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
            cursor.execute("delete from public.orders where incident_id = %s", (incident_id,))
            cursor.execute(
                "delete from public.export_requests where incident_id = %s", (incident_id,)
            )
            cursor.execute("delete from public.exports where incident_id = %s", (incident_id,))
            cursor.execute("delete from public.incidents where id = %s", (incident_id,))
