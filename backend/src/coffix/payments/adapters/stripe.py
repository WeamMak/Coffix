import hashlib
import hmac
import json
import time
from typing import Any
from uuid import UUID

import httpx

from coffix.core.types import Money
from coffix.payments.providers import (
    PaymentIntentResult,
    ProviderEvent,
    ProviderResource,
    ProviderState,
    RefundResult,
)


class StripePaymentProvider:
    name = "stripe"
    base_url = "https://api.stripe.com/v1"

    def __init__(
        self,
        *,
        secret_key: str,
        webhook_secret: str,
        client: httpx.AsyncClient | None = None,
        signature_tolerance_seconds: int = 300,
    ) -> None:
        self.secret_key = secret_key
        self.webhook_secret = webhook_secret
        self.client = client
        self.signature_tolerance_seconds = signature_tolerance_seconds

    async def create_intent(
        self,
        *,
        payment_id: UUID,
        amount: Money,
        idempotency_key: str,
        metadata: dict[str, str],
    ) -> PaymentIntentResult:
        data: dict[str, str] = {
            "amount": str(amount.amount_agorot),
            "currency": "ils",
            "automatic_payment_methods[enabled]": "true",
        }
        data.update({f"metadata[{key}]": value for key, value in metadata.items()})
        data["metadata[payment_id]"] = str(payment_id)
        response = await self._client().post(
            f"{self.base_url}/payment_intents",
            data=data,
            headers=self._headers(idempotency_key),
        )
        response.raise_for_status()
        body = response.json()
        return PaymentIntentResult(
            provider_payment_id=str(body["id"]),
            client_secret=str(body["client_secret"]),
            state=self._payment_state(str(body.get("status", "processing"))),
        )

    async def create_full_refund(
        self,
        *,
        payment_id: UUID,
        idempotency_key: str,
    ) -> RefundResult:
        client = self._client()
        payment_intents = await client.get(
            f"{self.base_url}/payment_intents/search",
            params={
                "query": f"metadata['payment_id']:'{payment_id}'",
                "limit": "2",
            },
            headers={"Authorization": f"Bearer {self.secret_key}"},
        )
        payment_intents.raise_for_status()
        matches = payment_intents.json().get("data", [])
        if not isinstance(matches, list) or len(matches) != 1:
            raise RuntimeError("Stripe PaymentIntent lookup did not return one match")
        provider_payment_id = str(matches[0]["id"])
        response = await client.post(
            f"{self.base_url}/refunds",
            data={"payment_intent": provider_payment_id},
            headers=self._headers(idempotency_key),
        )
        response.raise_for_status()
        body = response.json()
        return RefundResult(
            provider_refund_id=str(body["id"]),
            state=self._refund_state(str(body.get("status", "pending"))),
        )

    def verify_webhook(self, raw_body: bytes, signature: str) -> ProviderEvent:
        timestamp, signatures = self._signature_parts(signature)
        if abs(int(time.time()) - timestamp) > self.signature_tolerance_seconds:
            raise ValueError("webhook signature timestamp is outside tolerance")
        expected = hmac.new(
            self.webhook_secret.encode(),
            f"{timestamp}.".encode() + raw_body,
            hashlib.sha256,
        ).hexdigest()
        if not signatures or not any(
            hmac.compare_digest(expected, candidate) for candidate in signatures
        ):
            raise ValueError("invalid webhook signature")
        try:
            payload = json.loads(raw_body)
            return self._normalize_event(payload)
        except (KeyError, TypeError, json.JSONDecodeError) as exc:
            raise ValueError("invalid webhook payload") from exc

    def _headers(self, idempotency_key: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.secret_key}",
            "Idempotency-Key": idempotency_key,
        }

    def _client(self) -> httpx.AsyncClient:
        if self.client is None:
            raise RuntimeError("Stripe HTTP client is not configured")
        return self.client

    @staticmethod
    def _signature_parts(signature: str) -> tuple[int, list[str]]:
        try:
            parts = [part.split("=", 1) for part in signature.split(",") if "=" in part]
            timestamp = int(next(value for key, value in parts if key == "t"))
            signatures = [value for key, value in parts if key == "v1"]
        except (StopIteration, ValueError) as exc:
            raise ValueError("invalid webhook signature") from exc
        return timestamp, signatures

    @classmethod
    def _normalize_event(cls, payload: Any) -> ProviderEvent:
        if not isinstance(payload, dict):
            raise ValueError("invalid webhook payload")
        event_type = str(payload["type"])
        data = payload["data"]
        provider_object = data["object"]
        provider_object_id = str(provider_object["id"])
        if event_type.startswith("payment_intent."):
            resource = ProviderResource.PAYMENT
            if event_type == "payment_intent.succeeded":
                state = ProviderState.CONFIRMED
            elif event_type in {"payment_intent.payment_failed", "payment_intent.canceled"}:
                state = ProviderState.FAILED
            else:
                state = ProviderState.PENDING
        elif event_type.startswith("refund."):
            resource = ProviderResource.REFUND
            state = cls._refund_state(str(provider_object.get("status", "pending")))
        else:
            resource = ProviderResource.IGNORED
            state = ProviderState.PENDING
        return ProviderEvent(
            provider="stripe",
            event_id=str(payload["id"]),
            event_type=event_type,
            resource=resource,
            provider_object_id=provider_object_id,
            state=state,
            payload=payload,
        )

    @staticmethod
    def _payment_state(status: str) -> ProviderState:
        if status == "succeeded":
            return ProviderState.CONFIRMED
        if status in {"canceled", "requires_payment_method"}:
            return ProviderState.FAILED
        return ProviderState.PENDING

    @staticmethod
    def _refund_state(status: str) -> ProviderState:
        if status == "succeeded":
            return ProviderState.CONFIRMED
        if status in {"failed", "canceled"}:
            return ProviderState.FAILED
        return ProviderState.PENDING
