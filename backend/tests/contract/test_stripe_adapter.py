import hashlib
import hmac
import json
import time
from urllib.parse import parse_qs
from uuid import UUID

import httpx
import pytest

from coffix.core.types import Money
from coffix.payments.adapters.stripe import StripePaymentProvider
from coffix.payments.providers import ProviderResource, ProviderState


@pytest.mark.asyncio
async def test_stripe_adapter_creates_intents_and_full_refunds_without_network() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/payment_intents"):
            return httpx.Response(
                200,
                json={
                    "id": "pi_123",
                    "client_secret": "pi_123_secret",
                    "status": "requires_payment_method",
                },
            )
        if request.url.path.endswith("/payment_intents/search"):
            return httpx.Response(200, json={"data": [{"id": "pi_123"}]})
        return httpx.Response(200, json={"id": "re_123", "status": "succeeded"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = StripePaymentProvider(
            secret_key="sk_test_synthetic",
            webhook_secret="whsec_synthetic",
            client=client,
        )
        intent = await provider.create_intent(
            payment_id=UUID("00000000-0000-0000-0000-000000000001"),
            amount=Money(4200),
            idempotency_key="checkout-1",
            metadata={"phase": "order"},
        )
        refund = await provider.create_full_refund(
            payment_id=UUID("00000000-0000-0000-0000-000000000001"),
            idempotency_key="refund-1",
        )

    intent_form = parse_qs(requests[0].content.decode())
    refund_form = parse_qs(requests[2].content.decode())
    assert intent.provider_payment_id == "pi_123"
    assert intent.client_secret == "pi_123_secret"
    assert refund.provider_refund_id == "re_123"
    assert requests[0].headers["authorization"] == "Bearer sk_test_synthetic"
    assert requests[0].headers["idempotency-key"] == "checkout-1"
    assert intent_form == {
        "amount": ["4200"],
        "automatic_payment_methods[enabled]": ["true"],
        "currency": ["ils"],
        "metadata[payment_id]": ["00000000-0000-0000-0000-000000000001"],
        "metadata[phase]": ["order"],
    }
    assert dict(requests[1].url.params) == {
        "query": "metadata['payment_id']:'00000000-0000-0000-0000-000000000001'",
        "limit": "2",
    }
    assert refund_form == {"payment_intent": ["pi_123"]}


def test_stripe_adapter_verifies_signature_and_normalizes_event() -> None:
    secret = "whsec_synthetic"
    payload = json.dumps(
        {
            "id": "evt_123",
            "type": "payment_intent.payment_failed",
            "data": {"object": {"id": "pi_123", "status": "requires_payment_method"}},
        },
        separators=(",", ":"),
    ).encode()
    timestamp = int(time.time())
    digest = hmac.new(
        secret.encode(),
        f"{timestamp}.".encode() + payload,
        hashlib.sha256,
    ).hexdigest()
    provider = StripePaymentProvider(
        secret_key="sk_test_synthetic",
        webhook_secret=secret,
    )

    event = provider.verify_webhook(payload, f"t={timestamp},v1={digest}")

    assert event.event_id == "evt_123"
    assert event.provider == "stripe"
    assert event.resource is ProviderResource.PAYMENT
    assert event.provider_object_id == "pi_123"
    assert event.state is ProviderState.FAILED


def test_stripe_adapter_rejects_stale_signature() -> None:
    provider = StripePaymentProvider(
        secret_key="sk_test_synthetic",
        webhook_secret="whsec_synthetic",
    )
    payload = b"{}"
    old_timestamp = int(time.time()) - 600
    digest = hmac.new(
        b"whsec_synthetic",
        f"{old_timestamp}.".encode() + payload,
        hashlib.sha256,
    ).hexdigest()

    with pytest.raises(ValueError, match="timestamp"):
        provider.verify_webhook(payload, f"t={old_timestamp},v1={digest}")
