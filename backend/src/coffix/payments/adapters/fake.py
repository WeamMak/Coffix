import hashlib
import hmac
import json
from dataclasses import dataclass
from uuid import UUID

from coffix.core.types import Money
from coffix.payments.providers import (
    PaymentIntentResult,
    ProviderEvent,
    ProviderResource,
    ProviderState,
    RefundResult,
)


@dataclass(slots=True)
class FakePaymentProvider:
    signing_secret: str
    name: str = "fake"

    async def create_intent(
        self,
        *,
        payment_id: UUID,
        amount: Money,
        idempotency_key: str,
        metadata: dict[str, str],
    ) -> PaymentIntentResult:
        del amount, idempotency_key, metadata
        identifier = f"fake_pi_{payment_id.hex}"
        return PaymentIntentResult(
            provider_payment_id=identifier,
            client_secret=f"{identifier}_secret",
        )

    async def create_full_refund(
        self,
        *,
        payment_id: UUID,
        idempotency_key: str,
    ) -> RefundResult:
        del idempotency_key
        return RefundResult(
            provider_refund_id=f"fake_re_{payment_id.hex}",
            state=ProviderState.CONFIRMED,
        )

    def verify_webhook(self, raw_body: bytes, signature: str) -> ProviderEvent:
        timestamp, signatures = self._signature_parts(signature)
        signed = f"{timestamp}.".encode() + raw_body
        expected = hmac.new(self.signing_secret.encode(), signed, hashlib.sha256).hexdigest()
        if not any(hmac.compare_digest(expected, candidate) for candidate in signatures):
            raise ValueError("invalid webhook signature")
        return self._event(json.loads(raw_body))

    def build_event(
        self,
        *,
        event_id: str,
        event_type: str,
        provider_object_id: str,
        state: ProviderState,
    ) -> ProviderEvent:
        payload = {
            "id": event_id,
            "type": event_type,
            "data": {"object": {"id": provider_object_id, "status": state.value}},
        }
        return ProviderEvent(
            provider=self.name,
            event_id=event_id,
            event_type=event_type,
            resource=(
                ProviderResource.REFUND
                if event_type.startswith("refund.")
                else ProviderResource.PAYMENT
            ),
            provider_object_id=provider_object_id,
            state=state,
            payload=payload,
        )

    @staticmethod
    def _signature_parts(signature: str) -> tuple[int, list[str]]:
        parts = [part.split("=", 1) for part in signature.split(",") if "=" in part]
        values = {key: value for key, value in parts}
        timestamp = int(values["t"])
        signatures = [value for key, value in parts if key == "v1"]
        return timestamp, signatures

    def _event(self, payload: object) -> ProviderEvent:
        if not isinstance(payload, dict):
            raise ValueError("invalid webhook payload")
        event_id = str(payload["id"])
        event_type = str(payload["type"])
        data = payload.get("data")
        if not isinstance(data, dict) or not isinstance(data.get("object"), dict):
            raise ValueError("invalid webhook payload")
        provider_object = data["object"]
        state = ProviderState(str(provider_object["status"]))
        return self.build_event(
            event_id=event_id,
            event_type=event_type,
            provider_object_id=str(provider_object["id"]),
            state=state,
        )
