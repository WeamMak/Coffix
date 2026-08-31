import hashlib
import hmac
import json
import time
from collections.abc import AsyncIterator
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from coffix.api.app import create_app
from coffix.core.settings import Settings
from coffix.payments.models import Payment, PaymentPhase, PaymentState, ProviderEventRecord


def stripe_signature(payload: bytes, secret: str) -> str:
    timestamp = int(time.time())
    signed = f"{timestamp}.".encode() + payload
    digest = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


async def seed_payment(
    database_url: str, provider_payment_id: str, *, provider: str = "stripe"
) -> None:
    engine = create_async_engine(database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session, session.begin():
        session.add(
            Payment(
                owner_id=uuid4(),
                phase=PaymentPhase.ORDER,
                amount_agorot=4200,
                currency="ILS",
                provider=provider,
                provider_payment_id=provider_payment_id,
                state=PaymentState.PENDING,
                idempotency_key=f"key-{provider_payment_id}",
                request_fingerprint=f"fingerprint-{provider_payment_id}",
            )
        )
    await engine.dispose()


async def payment_state_and_event_count(
    database_url: str, provider_payment_id: str
) -> tuple[PaymentState, int]:
    engine = create_async_engine(database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        state = await session.scalar(
            select(Payment.state).where(Payment.provider_payment_id == provider_payment_id)
        )
        event_count = await session.scalar(select(func.count()).select_from(ProviderEventRecord))
    await engine.dispose()
    assert state is not None
    assert event_count is not None
    return state, event_count


async def stripe_client(database_url: str, secret: str) -> AsyncIterator[AsyncClient]:
    app = create_app(
        Settings(
            app_env="test",
            database_url=database_url,
            payment_provider="stripe",
            stripe_secret_key="sk_test_synthetic",
            stripe_webhook_secret=secret,
        )
    )
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            yield client


@pytest.mark.asyncio
async def test_stripe_webhook_rejects_invalid_signature(migrated_database_url: str) -> None:
    async for client in stripe_client(migrated_database_url, "whsec_test"):
        response = await client.post(
            "/api/v1/webhooks/stripe",
            content=b'{"id":"evt_bad"}',
            headers={"Stripe-Signature": "t=1,v1=invalid"},
        )

    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_WEBHOOK_SIGNATURE"


@pytest.mark.asyncio
async def test_stripe_webhook_verifies_raw_body_and_deduplicates_events(
    migrated_database_url: str,
) -> None:
    secret = "whsec_test"
    provider_payment_id = "pi_synthetic_123"
    await seed_payment(migrated_database_url, provider_payment_id)
    payload = json.dumps(
        {
            "id": "evt_synthetic_123",
            "type": "payment_intent.succeeded",
            "data": {"object": {"id": provider_payment_id, "status": "succeeded"}},
        },
        indent=2,
    ).encode()
    headers = {
        "Content-Type": "application/json",
        "Stripe-Signature": stripe_signature(payload, secret),
    }

    async for client in stripe_client(migrated_database_url, secret):
        first = await client.post("/api/v1/webhooks/stripe", content=payload, headers=headers)
        duplicate = await client.post("/api/v1/webhooks/stripe", content=payload, headers=headers)

    assert first.status_code == 200
    assert first.json() == {"result": "processed"}
    assert duplicate.status_code == 200
    assert duplicate.json() == {"result": "duplicate"}
    assert await payment_state_and_event_count(migrated_database_url, provider_payment_id) == (
        PaymentState.CONFIRMED,
        1,
    )


@pytest.mark.asyncio
async def test_fake_webhook_helper_processes_synthetic_event_in_test(
    migrated_database_url: str,
) -> None:
    provider_payment_id = "fake_pi_synthetic"
    await seed_payment(migrated_database_url, provider_payment_id, provider="fake")
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/test/payments/webhooks",
                json={
                    "event_id": "evt_fake",
                    "event_type": "payment_intent.succeeded",
                    "provider_object_id": provider_payment_id,
                    "state": "confirmed",
                },
            )

    assert response.status_code == 200
    assert response.json() == {"result": "processed"}
    assert await payment_state_and_event_count(migrated_database_url, provider_payment_id) == (
        PaymentState.CONFIRMED,
        1,
    )


@pytest.mark.asyncio
async def test_fake_webhook_helper_is_test_only(migrated_database_url: str) -> None:
    app = create_app(Settings(app_env="local", database_url=migrated_database_url))
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/test/payments/webhooks",
                json={
                    "event_id": "evt_fake",
                    "event_type": "payment_intent.succeeded",
                    "provider_object_id": "fake_pi_missing",
                    "state": "confirmed",
                },
            )

    assert response.status_code == 404
