from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Protocol
from uuid import UUID

from coffix.core.types import Money


class ProviderResource(StrEnum):
    PAYMENT = "payment"
    REFUND = "refund"
    IGNORED = "ignored"


class ProviderState(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    FAILED = "failed"


@dataclass(frozen=True, slots=True)
class PaymentIntentResult:
    provider_payment_id: str
    client_secret: str
    state: ProviderState = ProviderState.PENDING


@dataclass(frozen=True, slots=True)
class RefundResult:
    provider_refund_id: str
    state: ProviderState


@dataclass(frozen=True, slots=True)
class ProviderEvent:
    provider: str
    event_id: str
    event_type: str
    resource: ProviderResource
    provider_object_id: str
    state: ProviderState
    payload: dict[str, Any]


class PaymentProvider(Protocol):
    async def create_intent(
        self,
        *,
        payment_id: UUID,
        amount: Money,
        idempotency_key: str,
        metadata: dict[str, str],
    ) -> PaymentIntentResult: ...

    async def create_full_refund(
        self,
        *,
        payment_id: UUID,
        idempotency_key: str,
    ) -> RefundResult: ...

    def verify_webhook(self, raw_body: bytes, signature: str) -> ProviderEvent: ...
