import hashlib
import json
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from coffix.api.errors import ApiError
from coffix.core.clock import Clock
from coffix.core.types import Money
from coffix.payments.models import Payment, PaymentPhase, PaymentState, Refund, RefundState
from coffix.payments.providers import (
    PaymentProvider,
    ProviderEvent,
    ProviderResource,
)
from coffix.payments.repository import PaymentRepository

type OwnerPhaseHandler = Callable[[Payment, ProviderEvent], Awaitable[str | None]]


@dataclass(frozen=True, slots=True)
class PaymentIntent:
    payment_id: UUID
    provider_payment_id: str
    client_secret: str
    state: PaymentState


@dataclass(frozen=True, slots=True)
class EventProcessingResult:
    result: str


@dataclass(frozen=True, slots=True)
class RefundIntent:
    refund_id: UUID
    provider_refund_id: str
    payment_id: UUID
    amount_agorot: int
    currency: str
    state: RefundState


@dataclass(frozen=True, slots=True)
class ReconciliationCandidate:
    resource: ProviderResource
    local_id: UUID
    owner_id: UUID
    provider: str
    provider_object_id: str
    created_at: datetime


class PaymentService:
    def __init__(
        self,
        repository: PaymentRepository,
        provider: PaymentProvider,
        *,
        clock: Clock,
        handlers: Mapping[PaymentPhase, OwnerPhaseHandler] | None = None,
    ) -> None:
        self.repository = repository
        self.provider = provider
        self.clock = clock
        self.handlers = dict(handlers or {})

    async def get_intent(self, payment_id: UUID) -> PaymentIntent:
        payment = await self.repository.get_payment(payment_id)
        if (
            payment is None
            or payment.provider_payment_id is None
            or payment.provider_client_secret is None
        ):
            raise ApiError(status=404, code="PAYMENT_NOT_FOUND", title="Payment not found")
        return PaymentIntent(
            payment_id=payment.id,
            provider_payment_id=payment.provider_payment_id,
            client_secret=payment.provider_client_secret,
            state=payment.state,
        )

    async def reconciliation_candidates(
        self, *, created_before: datetime, limit: int = 100
    ) -> list[ReconciliationCandidate]:
        if limit <= 0:
            raise ValueError("limit must be positive")
        payments = await self.repository.list_pending_payments(
            created_before=created_before, limit=limit
        )
        refunds = await self.repository.list_pending_refunds(
            created_before=created_before, limit=limit
        )
        candidates = [
            ReconciliationCandidate(
                resource=ProviderResource.PAYMENT,
                local_id=payment.id,
                owner_id=payment.owner_id,
                provider=payment.provider,
                provider_object_id=payment.provider_payment_id,
                created_at=payment.created_at,
            )
            for payment in payments
            if payment.provider_payment_id is not None
        ]
        candidates.extend(
            ReconciliationCandidate(
                resource=ProviderResource.REFUND,
                local_id=refund.id,
                owner_id=refund.payment.owner_id,
                provider=refund.provider,
                provider_object_id=refund.provider_refund_id,
                created_at=refund.created_at,
            )
            for refund in refunds
            if refund.provider_refund_id is not None
        )
        return sorted(candidates, key=lambda candidate: (candidate.created_at, candidate.local_id))[
            :limit
        ]

    async def create_payment(
        self,
        *,
        owner_id: UUID,
        phase: PaymentPhase,
        amount: Money,
        idempotency_key: str,
        metadata: dict[str, str] | None = None,
    ) -> PaymentIntent:
        if type(amount.amount_agorot) is not int or amount.amount_agorot <= 0:
            raise ValueError("payment amount must be positive integer agorot")
        if amount.currency != "ILS":
            raise ValueError("payment currency must be ILS")
        if not idempotency_key.strip():
            raise ValueError("idempotency_key must not be empty")

        provider_name = self._provider_name()
        request_metadata = dict(metadata or {})
        fingerprint = self._fingerprint(
            owner_id=owner_id,
            phase=phase,
            amount=amount,
            metadata=request_metadata,
        )
        existing = await self.repository.get_payment_by_idempotency_key(
            idempotency_key, for_update=True
        )
        if existing is not None:
            if existing.request_fingerprint != fingerprint:
                raise ApiError(
                    status=409,
                    code="IDEMPOTENCY_KEY_REUSED",
                    title="Idempotency key was already used for another payment",
                )
            if existing.provider_payment_id is None or existing.provider_client_secret is None:
                raise ApiError(
                    status=409,
                    code="PAYMENT_CREATION_INCOMPLETE",
                    title="Payment creation is incomplete",
                )
            return PaymentIntent(
                payment_id=existing.id,
                provider_payment_id=existing.provider_payment_id,
                client_secret=existing.provider_client_secret,
                state=existing.state,
            )

        payment = await self.repository.create_payment(
            owner_id=owner_id,
            phase=phase,
            amount_agorot=amount.amount_agorot,
            currency=amount.currency,
            provider=provider_name,
            state=PaymentState.PENDING,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
        )
        result = await self.provider.create_intent(
            payment_id=payment.id,
            amount=amount,
            idempotency_key=idempotency_key,
            metadata={
                **request_metadata,
                "payment_id": str(payment.id),
                "owner_id": str(owner_id),
                "phase": phase.value,
            },
        )
        await self.repository.set_payment_provider_result(
            payment,
            provider_payment_id=result.provider_payment_id,
            client_secret=result.client_secret,
        )
        return PaymentIntent(
            payment_id=payment.id,
            provider_payment_id=result.provider_payment_id,
            client_secret=result.client_secret,
            state=payment.state,
        )

    async def create_full_refund(
        self,
        *,
        payment_id: UUID,
        requested_by: UUID,
        reason: str,
        idempotency_key: str,
    ) -> RefundIntent:
        if not reason.strip():
            raise ValueError("refund reason must not be empty")
        if not idempotency_key.strip():
            raise ValueError("idempotency_key must not be empty")
        payment = await self.repository.get_payment(payment_id)
        if payment is None or payment.state is not PaymentState.CONFIRMED:
            raise ApiError(
                status=409,
                code="PAYMENT_NOT_REFUNDABLE",
                title="Payment is not refundable",
            )
        fingerprint = self._refund_fingerprint(
            payment_id=payment_id,
            requested_by=requested_by,
            reason=reason,
        )
        existing = await self.repository.get_refund_by_idempotency_key(
            idempotency_key, for_update=True
        )
        if existing is not None:
            if existing.request_fingerprint != fingerprint:
                raise ApiError(
                    status=409,
                    code="IDEMPOTENCY_KEY_REUSED",
                    title="Idempotency key was already used for another refund",
                )
            return self._refund_intent(existing)
        payment_refund = await self.repository.get_refund_for_payment(payment_id)
        if payment_refund is not None:
            raise ApiError(
                status=409,
                code="REFUND_ALREADY_EXISTS",
                title="A full refund already exists for this payment",
            )
        refund = await self.repository.create_refund(
            payment,
            requested_by=requested_by,
            reason=reason.strip(),
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
        )
        provider_result = await self.provider.create_full_refund(
            payment_id=payment.id,
            idempotency_key=idempotency_key,
        )
        await self.repository.set_refund_provider_result(
            refund, provider_refund_id=provider_result.provider_refund_id
        )
        return self._refund_intent(refund)

    async def process_event(self, event: ProviderEvent) -> EventProcessingResult:
        now = self.clock.now()
        record = await self.repository.insert_provider_event(event, received_at=now)
        if record is None:
            return EventProcessingResult(result="duplicate")

        if event.resource is ProviderResource.PAYMENT:
            result = await self._process_payment_event(event, now)
        elif event.resource is ProviderResource.REFUND:
            result = await self._process_refund_event(event, now)
        else:
            result = "ignored_unsupported"

        record.processing_result = result
        record.result_metadata = {
            "provider_state": event.state.value,
            "resource": event.resource.value,
        }
        if result == "unmatched":
            record.error_metadata = {"code": "PROVIDER_OBJECT_NOT_FOUND"}
        record.processed_at = now
        await self.repository.flush()
        return EventProcessingResult(result=result)

    async def _process_payment_event(self, event: ProviderEvent, now: datetime) -> str:
        payment = await self.repository.get_payment_by_provider_id(
            event.provider, event.provider_object_id, for_update=True
        )
        if payment is None:
            return "unmatched"
        next_state = PaymentState(event.state.value)
        if not payment.apply_state(next_state, now):
            return "ignored_out_of_order"
        handler = self.handlers.get(payment.phase)
        if handler is not None:
            handler_result = await handler(payment, event)
            if handler_result is not None:
                return handler_result
        return "processed"

    async def _process_refund_event(self, event: ProviderEvent, now: datetime) -> str:
        refund = await self.repository.get_refund_by_provider_id(
            event.provider, event.provider_object_id, for_update=True
        )
        if refund is None:
            return "unmatched"
        next_state = RefundState(event.state.value)
        if not refund.apply_state(next_state, now):
            return "ignored_out_of_order"
        handler = self.handlers.get(refund.payment.phase)
        if handler is not None:
            handler_result = await handler(refund.payment, event)
            if handler_result is not None:
                return handler_result
        return "processed"

    def _provider_name(self) -> str:
        name = getattr(self.provider, "name", None)
        if not isinstance(name, str):
            raise TypeError("payment provider must declare a name")
        return name

    @staticmethod
    def _refund_intent(refund: Refund) -> RefundIntent:
        if refund.provider_refund_id is None:
            raise ApiError(
                status=409,
                code="REFUND_CREATION_INCOMPLETE",
                title="Refund creation is incomplete",
            )
        return RefundIntent(
            refund_id=refund.id,
            provider_refund_id=refund.provider_refund_id,
            payment_id=refund.payment_id,
            amount_agorot=refund.amount_agorot,
            currency=refund.currency,
            state=refund.state,
        )

    @staticmethod
    def _refund_fingerprint(*, payment_id: UUID, requested_by: UUID, reason: str) -> str:
        canonical = json.dumps(
            {
                "payment_id": str(payment_id),
                "requested_by": str(requested_by),
                "reason": reason.strip(),
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode()).hexdigest()

    @staticmethod
    def _fingerprint(
        *,
        owner_id: UUID,
        phase: PaymentPhase,
        amount: Money,
        metadata: dict[str, str],
    ) -> str:
        canonical = json.dumps(
            {
                "owner_id": str(owner_id),
                "phase": phase.value,
                "amount_agorot": amount.amount_agorot,
                "currency": amount.currency,
                "metadata": metadata,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode()).hexdigest()
