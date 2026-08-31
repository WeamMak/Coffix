from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID, uuid4

import pytest

from coffix.api.errors import ApiError
from coffix.core.clock import FakeClock
from coffix.core.types import Money
from coffix.payments.adapters.fake import FakePaymentProvider
from coffix.payments.models import PaymentPhase, PaymentState
from coffix.payments.providers import ProviderEvent, ProviderResource, ProviderState
from coffix.payments.service import PaymentService


class MemoryPaymentRepository:
    def __init__(self) -> None:
        self.payments_by_key: dict[str, Any] = {}
        self.payments_by_provider_id: dict[str, Any] = {}
        self.events: dict[tuple[str, str], Any] = {}

    async def get_payment_by_idempotency_key(
        self, idempotency_key: str, *, for_update: bool = False
    ) -> Any | None:
        del for_update
        return self.payments_by_key.get(idempotency_key)

    async def create_payment(self, **values: Any) -> Any:
        from coffix.payments.models import Payment

        payment = Payment(id=uuid4(), **values)
        self.payments_by_key[payment.idempotency_key] = payment
        return payment

    async def set_payment_provider_result(
        self,
        payment: Any,
        *,
        provider_payment_id: str,
        client_secret: str | None = None,
    ) -> None:
        payment.provider_payment_id = provider_payment_id
        payment.provider_client_secret = client_secret
        self.payments_by_provider_id[provider_payment_id] = payment

    async def get_payment_by_provider_id(
        self, provider: str, provider_payment_id: str, *, for_update: bool = False
    ) -> Any | None:
        del provider, for_update
        return self.payments_by_provider_id.get(provider_payment_id)

    async def insert_provider_event(self, event: ProviderEvent, *, received_at: datetime) -> Any:
        from coffix.payments.models import ProviderEventRecord

        key = (event.provider, event.event_id)
        if key in self.events:
            return None
        record = ProviderEventRecord(
            id=uuid4(),
            provider=event.provider,
            external_event_id=event.event_id,
            event_type=event.event_type,
            resource=event.resource,
            provider_object_id=event.provider_object_id,
            payload=event.payload,
            received_at=received_at,
        )
        self.events[key] = record
        return record

    async def flush(self) -> None:
        return None


def service(
    repository: MemoryPaymentRepository,
    *,
    handlers: Mapping[PaymentPhase, Any] | None = None,
) -> PaymentService:
    return PaymentService(
        cast(Any, repository),
        FakePaymentProvider(signing_secret="fake-secret"),
        clock=FakeClock(datetime(2026, 1, 1, tzinfo=UTC)),
        handlers=handlers,
    )


@pytest.mark.asyncio
async def test_create_payment_requires_integer_amount_and_rejects_mismatched_key_reuse() -> None:
    repository = MemoryPaymentRepository()
    payments = service(repository)
    owner_id = uuid4()

    invalid_amount: Any = Money(amount_agorot=cast(Any, 100.5))
    with pytest.raises(ValueError, match="integer agorot"):
        await payments.create_payment(
            owner_id=owner_id,
            phase=PaymentPhase.ORDER,
            amount=invalid_amount,
            idempotency_key="checkout-1",
        )

    first = await payments.create_payment(
        owner_id=owner_id,
        phase=PaymentPhase.ORDER,
        amount=Money(1200),
        idempotency_key="checkout-1",
    )
    repeated = await payments.create_payment(
        owner_id=owner_id,
        phase=PaymentPhase.ORDER,
        amount=Money(1200),
        idempotency_key="checkout-1",
    )

    assert repeated.payment_id == first.payment_id
    assert repeated.provider_payment_id == first.provider_payment_id
    assert first.state is PaymentState.PENDING

    with pytest.raises(ApiError) as error:
        await payments.create_payment(
            owner_id=owner_id,
            phase=PaymentPhase.ORDER,
            amount=Money(1300),
            idempotency_key="checkout-1",
        )
    assert error.value.status == 409
    assert error.value.code == "IDEMPOTENCY_KEY_REUSED"


@pytest.mark.asyncio
async def test_events_are_idempotent_ignore_regressions_and_call_phase_handler_once() -> None:
    repository = MemoryPaymentRepository()
    handled: list[tuple[UUID, ProviderState]] = []

    async def handle(payment: Any, event: ProviderEvent) -> None:
        handled.append((payment.id, event.state))

    payments = service(repository, handlers={PaymentPhase.ORDER: handle})
    created = await payments.create_payment(
        owner_id=uuid4(),
        phase=PaymentPhase.ORDER,
        amount=Money(5000),
        idempotency_key="checkout-2",
    )
    confirmed = ProviderEvent(
        provider="fake",
        event_id="evt-confirmed",
        event_type="payment_intent.succeeded",
        resource=ProviderResource.PAYMENT,
        provider_object_id=created.provider_payment_id,
        state=ProviderState.CONFIRMED,
        payload={"id": "evt-confirmed"},
    )
    stale_pending = ProviderEvent(
        provider="fake",
        event_id="evt-stale",
        event_type="payment_intent.processing",
        resource=ProviderResource.PAYMENT,
        provider_object_id=created.provider_payment_id,
        state=ProviderState.PENDING,
        payload={"id": "evt-stale"},
    )

    first = await payments.process_event(confirmed)
    duplicate = await payments.process_event(confirmed)
    stale = await payments.process_event(stale_pending)

    payment = repository.payments_by_provider_id[created.provider_payment_id]
    assert payment.state is PaymentState.CONFIRMED
    assert first.result == "processed"
    assert duplicate.result == "duplicate"
    assert stale.result == "ignored_out_of_order"
    assert handled == [(created.payment_id, ProviderState.CONFIRMED)]
    assert len(repository.events) == 2


@pytest.mark.asyncio
async def test_failed_payment_can_later_confirm_but_cannot_return_to_pending() -> None:
    repository = MemoryPaymentRepository()
    handled: list[ProviderState] = []

    async def handle(payment: Any, event: ProviderEvent) -> None:
        del payment
        handled.append(event.state)

    payments = service(repository, handlers={PaymentPhase.DIAGNOSTIC: handle})
    created = await payments.create_payment(
        owner_id=uuid4(),
        phase=PaymentPhase.DIAGNOSTIC,
        amount=Money(7500),
        idempotency_key="diagnostic-1",
    )

    async def emit(event_id: str, state: ProviderState) -> str:
        result = await payments.process_event(
            ProviderEvent(
                provider="fake",
                event_id=event_id,
                event_type=f"payment_intent.{state.value}",
                resource=ProviderResource.PAYMENT,
                provider_object_id=created.provider_payment_id,
                state=state,
                payload={"id": event_id},
            )
        )
        return result.result

    assert await emit("evt-failed", ProviderState.FAILED) == "processed"
    assert await emit("evt-late-pending", ProviderState.PENDING) == "ignored_out_of_order"
    assert await emit("evt-recovered", ProviderState.CONFIRMED) == "processed"
    assert (
        repository.payments_by_provider_id[created.provider_payment_id].state
        is PaymentState.CONFIRMED
    )
    assert handled == [ProviderState.FAILED, ProviderState.CONFIRMED]
