import itertools
from datetime import UTC, datetime
from uuid import UUID

import pytest

from coffix.api.errors import ApiError
from coffix.core.clock import FakeClock
from coffix.service.models import (
    ServiceLocationMode,
    ServiceRequest,
    ServiceRequestState,
    ServiceType,
)
from coffix.service.service import ServiceTransitionService
from coffix.service.state_machine import (
    ServiceAction,
    ServiceActor,
    ServiceTransitionError,
    allowed_service_actions,
    next_service_state,
)

ALLOWED_TRANSITIONS = {
    (
        ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT,
        ServiceAction.CANCEL,
        ServiceActor.CUSTOMER,
    ): ServiceRequestState.CANCELLED,
    (
        ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT,
        ServiceAction.CANCEL,
        ServiceActor.ADMIN,
    ): ServiceRequestState.CANCELLED,
    (
        ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT,
        ServiceAction.CANCEL,
        ServiceActor.SYSTEM,
    ): ServiceRequestState.CANCELLED,
    (
        ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT,
        ServiceAction.DIAGNOSTIC_PAYMENT_CONFIRMED,
        ServiceActor.SYSTEM,
    ): ServiceRequestState.AWAITING_ADMIN_REVIEW,
    (
        ServiceRequestState.AWAITING_ADMIN_REVIEW,
        ServiceAction.SCHEDULE,
        ServiceActor.ADMIN,
    ): ServiceRequestState.SCHEDULED,
    (
        ServiceRequestState.SCHEDULED,
        ServiceAction.RECEIVE,
        ServiceActor.ADMIN,
    ): ServiceRequestState.RECEIVED,
    (
        ServiceRequestState.SCHEDULED,
        ServiceAction.RECEIVE,
        ServiceActor.TECHNICIAN,
    ): ServiceRequestState.RECEIVED,
    (
        ServiceRequestState.RECEIVED,
        ServiceAction.START_DIAGNOSIS,
        ServiceActor.ADMIN,
    ): ServiceRequestState.DIAGNOSING,
    (
        ServiceRequestState.RECEIVED,
        ServiceAction.START_DIAGNOSIS,
        ServiceActor.TECHNICIAN,
    ): ServiceRequestState.DIAGNOSING,
    (
        ServiceRequestState.DIAGNOSING,
        ServiceAction.REQUEST_ADDITIONAL_DECISION,
        ServiceActor.ADMIN,
    ): ServiceRequestState.AWAITING_ADDITIONAL_DECISION,
    (
        ServiceRequestState.DIAGNOSING,
        ServiceAction.START_REPAIR,
        ServiceActor.ADMIN,
    ): ServiceRequestState.REPAIR_IN_PROGRESS,
    (
        ServiceRequestState.AWAITING_ADDITIONAL_DECISION,
        ServiceAction.ACCEPT_ADDITIONAL_QUOTE,
        ServiceActor.CUSTOMER,
    ): ServiceRequestState.AWAITING_ADDITIONAL_PAYMENT,
    (
        ServiceRequestState.AWAITING_ADDITIONAL_DECISION,
        ServiceAction.DECLINE_ADDITIONAL_QUOTE,
        ServiceActor.CUSTOMER,
    ): ServiceRequestState.CANCELLED,
    (
        ServiceRequestState.AWAITING_ADDITIONAL_PAYMENT,
        ServiceAction.ADDITIONAL_PAYMENT_CONFIRMED,
        ServiceActor.SYSTEM,
    ): ServiceRequestState.REPAIR_IN_PROGRESS,
    (
        ServiceRequestState.REPAIR_IN_PROGRESS,
        ServiceAction.READY_FOR_RETURN,
        ServiceActor.ADMIN,
    ): ServiceRequestState.READY_FOR_RETURN,
    (
        ServiceRequestState.REPAIR_IN_PROGRESS,
        ServiceAction.READY_FOR_RETURN,
        ServiceActor.TECHNICIAN,
    ): ServiceRequestState.READY_FOR_RETURN,
    (
        ServiceRequestState.READY_FOR_RETURN,
        ServiceAction.COMPLETE,
        ServiceActor.ADMIN,
    ): ServiceRequestState.COMPLETED,
}


@pytest.mark.parametrize(
    ("state", "action", "actor"),
    itertools.product(ServiceRequestState, ServiceAction, ServiceActor),
)
def test_every_service_transition_is_explicitly_allowed_or_forbidden(
    state: ServiceRequestState,
    action: ServiceAction,
    actor: ServiceActor,
) -> None:
    expected = ALLOWED_TRANSITIONS.get((state, action, actor))

    if expected is None:
        with pytest.raises(ServiceTransitionError):
            next_service_state(state, action, actor)
    else:
        assert next_service_state(state, action, actor) is expected


def test_customer_allowed_actions_include_payment_commands_without_skipping_gates() -> None:
    assert allowed_service_actions(
        ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT,
        ServiceActor.CUSTOMER,
    ) == {"cancel", "pay_diagnostic"}
    assert (
        allowed_service_actions(
            ServiceRequestState.AWAITING_ADMIN_REVIEW,
            ServiceActor.CUSTOMER,
        )
        == set()
    )


class FakeTransitionStore:
    def __init__(self) -> None:
        self.history: list[dict[str, object]] = []
        self.outbox: list[dict[str, object]] = []

    async def transition_with_records(
        self,
        request: ServiceRequest,
        *,
        target: ServiceRequestState,
        actor_id: UUID | None,
        source: str,
        reason: str | None,
        event_type: str,
        payload: dict[str, object],
        occurred_at: datetime,
    ) -> None:
        previous = request.state
        request.state = target
        self.history.append({"from": previous, "to": target})
        self.outbox.append(
            {
                "event_type": event_type,
                "aggregate_id": request.id,
            }
        )


def request_in(state: ServiceRequestState) -> ServiceRequest:
    service_type = ServiceType(
        id=UUID("40000000-0000-4000-8000-000000000001"),
        label_he="בדיקה",
        label_en="Inspection",
        diagnostic_fee_agorot=10_000,
        is_active=True,
        version=1,
    )
    request = ServiceRequest(
        id=UUID("60000000-0000-4000-8000-000000000001"),
        reference="CFX-SVC-TEST",
        customer_id=UUID("10000000-0000-4000-8000-000000000001"),
        machine_id=UUID("20000000-0000-4000-8000-000000000001"),
        service_type_id=service_type.id,
        service_type=service_type,
        diagnostic_payment_id=None,
        assigned_technician_id=None,
        state=state,
        diagnostic_fee_agorot=10_000,
        currency="ILS",
        description="Pressure issue",
        location_mode=ServiceLocationMode.BRING_IN,
        address_snapshot={"city": "Tel Aviv", "country": "IL"},
        preferred_window_start=None,
        preferred_window_end=None,
        confirmed_appointment_start=None,
        confirmed_appointment_end=None,
    )
    request.history = []
    request.notes = []
    request.media = []
    request.quotes = []
    return request


@pytest.mark.asyncio
async def test_transition_service_records_history_and_outbox_together() -> None:
    request = request_in(ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT)
    store = FakeTransitionStore()
    transitions = ServiceTransitionService(
        store,
        clock=FakeClock(datetime(2026, 8, 31, 10, 0, tzinfo=UTC)),
    )

    await transitions.transition(
        request,
        ServiceAction.CANCEL,
        ServiceActor.CUSTOMER,
        actor_id=UUID("10000000-0000-4000-8000-000000000001"),
        reason="Customer cancelled before payment",
    )

    assert request.state is ServiceRequestState.CANCELLED
    assert store.history == [
        {
            "from": ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT,
            "to": ServiceRequestState.CANCELLED,
        }
    ]
    assert store.outbox == [
        {
            "event_type": "service.request.cancelled",
            "aggregate_id": request.id,
        }
    ]


@pytest.mark.asyncio
async def test_transition_service_returns_stable_error_for_invalid_transition() -> None:
    request = request_in(ServiceRequestState.COMPLETED)

    with pytest.raises(ApiError) as error:
        await ServiceTransitionService(
            FakeTransitionStore(),
            clock=FakeClock(datetime(2026, 8, 31, 10, 0, tzinfo=UTC)),
        ).transition(
            request,
            ServiceAction.CANCEL,
            ServiceActor.CUSTOMER,
            actor_id=UUID("10000000-0000-4000-8000-000000000001"),
        )

    assert error.value.status == 409
    assert error.value.code == "SERVICE_TRANSITION_NOT_ALLOWED"
