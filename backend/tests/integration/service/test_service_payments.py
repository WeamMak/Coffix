from datetime import UTC, datetime, timedelta

import pytest

from coffix.api.errors import ApiError
from coffix.catalog.repository import MachineModelRepository
from coffix.catalog.schemas import MachineModelCreate
from coffix.core.clock import FakeClock
from coffix.core.ids import UuidGenerator
from coffix.machines.repository import MachineRepository
from coffix.payments.adapters.fake import FakePaymentProvider
from coffix.payments.models import PaymentPhase
from coffix.payments.providers import ProviderState
from coffix.payments.repository import PaymentRepository
from coffix.payments.service import PaymentService
from coffix.scheduling.repository import SchedulingRepository
from coffix.scheduling.schemas import AppointmentConfirmation
from coffix.scheduling.service import SchedulingService
from coffix.service.models import (
    ServiceLocationMode,
    ServiceQuoteDecision,
    ServiceRequestState,
)
from coffix.service.repository import ServiceRepository
from coffix.service.schemas import (
    ServiceOperationalAction,
    ServiceQuoteCreate,
    ServiceQuoteDecisionInput,
    ServiceRequestCreate,
)
from coffix.service.service import ServiceRequestService, ServiceWorkflowService
from coffix.users.models import Role
from coffix.users.repository import UserRepository

NOW = datetime(2026, 8, 31, 12, 0, tzinfo=UTC)
SHOP = {"street": "Dizengoff", "building": "1", "city": "Tel Aviv", "country": "IL"}


async def seed_request(database_session):
    users = UserRepository(database_session)
    customer = await users.create(phone_e164="+972501237001", role=Role.CUSTOMER)
    admin = await users.create(phone_e164="+972501237002", role=Role.ADMIN)
    technician = await users.create(phone_e164="+972501237003", role=Role.TECHNICIAN)
    model = await MachineModelRepository(database_session).create(
        MachineModelCreate(manufacturer="Coffix", model_name="Payments")
    )
    machine = await MachineRepository(database_session).create_manual_registration(
        customer_id=customer.id,
        machine_model_id=model.id,
        serial_number="SERVICE-PAYMENTS-1",
        purchase_date=None,
    )
    repository = ServiceRepository(database_session)
    service_type = await repository.create_service_type(
        label_he="בדיקה",
        label_en="Diagnostic",
        diagnostic_fee_agorot=8_500,
        is_active=True,
        machine_model_ids=[model.id],
    )
    request = await ServiceRequestService(
        repository,
        clock=FakeClock(NOW),
        ids=UuidGenerator(),
        shop_address=SHOP,
    ).create(
        customer.id,
        machine.id,
        ServiceRequestCreate(
            service_type_id=service_type.id,
            description="Pressure drops after the machine warms up.",
            location_mode=ServiceLocationMode.BRING_IN,
        ),
    )
    return customer, admin, technician, request


def payment_workflow(database_session, clock):
    provider = FakePaymentProvider(signing_secret="fake-secret")
    event_workflow = ServiceWorkflowService(ServiceRepository(database_session), clock=clock)
    payments = PaymentService(
        PaymentRepository(database_session),
        provider,
        clock=clock,
        handlers={
            PaymentPhase.DIAGNOSTIC: event_workflow.handle_provider_event,
            PaymentPhase.ADDITIONAL: event_workflow.handle_provider_event,
        },
    )
    commands = ServiceWorkflowService(
        ServiceRepository(database_session), clock=clock, payments=payments
    )
    return provider, payments, commands


@pytest.mark.asyncio
async def test_two_phase_payments_gate_scheduling_diagnosis_and_repair(database_session) -> None:
    customer, admin, technician, request = await seed_request(database_session)
    clock = FakeClock(NOW)
    provider, payments, workflow = payment_workflow(database_session, clock)
    scheduling = SchedulingService(SchedulingRepository(database_session), clock=clock)
    appointment = AppointmentConfirmation(
        technician_id=technician.id,
        start=NOW + timedelta(days=1),
        end=NOW + timedelta(days=1, hours=2),
    )

    with pytest.raises(ApiError) as unpaid_schedule:
        await scheduling.confirm(request.id, appointment, admin_id=admin.id)
    assert unpaid_schedule.value.code == "SERVICE_TRANSITION_NOT_ALLOWED"

    diagnostic = await workflow.create_diagnostic_payment(
        request.id, customer.id, "service-diagnostic-1"
    )
    diagnostic_event = provider.build_event(
        event_id="evt-service-diagnostic-1",
        event_type="payment_intent.succeeded",
        provider_object_id=diagnostic.provider_payment_id,
        state=ProviderState.CONFIRMED,
    )
    assert (await payments.process_event(diagnostic_event)).result == "processed"
    assert (await payments.process_event(diagnostic_event)).result == "duplicate"
    stale_diagnostic_event = provider.build_event(
        event_id="evt-service-diagnostic-stale",
        event_type="payment_intent.processing",
        provider_object_id=diagnostic.provider_payment_id,
        state=ProviderState.PENDING,
    )
    assert (await payments.process_event(stale_diagnostic_event)).result == "ignored_out_of_order"
    assert request.state is ServiceRequestState.AWAITING_ADMIN_REVIEW

    await scheduling.confirm(request.id, appointment, admin_id=admin.id)
    await workflow.admin_action(request.id, admin.id, ServiceOperationalAction(action="receive"))
    await workflow.admin_action(
        request.id, admin.id, ServiceOperationalAction(action="start_diagnosis")
    )
    await workflow.create_quote(
        request.id,
        admin.id,
        ServiceQuoteCreate(
            amount_agorot=12_500,
            explanation="Replace the pressure valve.",
        ),
    )
    with pytest.raises(ApiError) as second_quote:
        await workflow.create_quote(
            request.id,
            admin.id,
            ServiceQuoteCreate(amount_agorot=1_000, explanation="Duplicate quote"),
        )
    assert second_quote.value.code == "SERVICE_QUOTE_NOT_ALLOWED"

    await workflow.decide_quote(
        request.id,
        customer.id,
        ServiceQuoteDecisionInput(decision=ServiceQuoteDecision.ACCEPTED),
    )
    with pytest.raises(ApiError) as unpaid_repair:
        await workflow.start_no_cost_repair(request.id, admin.id)
    assert unpaid_repair.value.code == "SERVICE_TRANSITION_NOT_ALLOWED"

    additional = await workflow.create_additional_payment(
        request.id, customer.id, "service-additional-1"
    )
    additional_event = provider.build_event(
        event_id="evt-service-additional-1",
        event_type="payment_intent.succeeded",
        provider_object_id=additional.provider_payment_id,
        state=ProviderState.CONFIRMED,
    )
    assert (await payments.process_event(additional_event)).result == "processed"
    assert request.state is ServiceRequestState.REPAIR_IN_PROGRESS
    assert [entry.source for entry in request.history[-6:]] == [
        "admin",
        "admin",
        "admin",
        "admin",
        "customer",
        "system",
    ]

    with pytest.raises(ApiError) as non_refundable:
        await payments.create_full_refund(
            payment_id=diagnostic.payment_id,
            requested_by=admin.id,
            reason="Service payments stay retained",
            idempotency_key="service-refund-1",
        )
    assert non_refundable.value.code == "SERVICE_PAYMENT_NON_REFUNDABLE"


@pytest.mark.asyncio
async def test_decline_retains_diagnostic_fee_and_no_cost_path_skips_second_payment(
    database_session,
) -> None:
    customer, admin, _, request = await seed_request(database_session)
    clock = FakeClock(NOW)
    provider, payments, workflow = payment_workflow(database_session, clock)
    diagnostic = await workflow.create_diagnostic_payment(
        request.id, customer.id, "declined-service-diagnostic-1"
    )
    await payments.process_event(
        provider.build_event(
            event_id="evt-declined-service-diagnostic-1",
            event_type="payment_intent.succeeded",
            provider_object_id=diagnostic.provider_payment_id,
            state=ProviderState.CONFIRMED,
        )
    )
    request.state = ServiceRequestState.DIAGNOSING

    await workflow.create_quote(
        request.id,
        admin.id,
        ServiceQuoteCreate(amount_agorot=5_000, explanation="Replace the seal."),
    )
    declined = await workflow.decide_quote(
        request.id,
        customer.id,
        ServiceQuoteDecisionInput(decision=ServiceQuoteDecision.DECLINED),
    )
    assert declined.state is ServiceRequestState.CANCELLED
    assert request.quotes[0].additional_payment_id is None
    with pytest.raises(ApiError) as retained_fee:
        await payments.create_full_refund(
            payment_id=diagnostic.payment_id,
            requested_by=admin.id,
            reason="Declining the repair does not refund diagnosis",
            idempotency_key="declined-service-refund-1",
        )
    assert retained_fee.value.code == "SERVICE_PAYMENT_NON_REFUNDABLE"

    no_cost_request = await ServiceRequestService(
        ServiceRepository(database_session),
        clock=clock,
        ids=UuidGenerator(),
        shop_address=SHOP,
    ).create(
        customer.id,
        request.machine_id,
        ServiceRequestCreate(
            service_type_id=request.service_type_id,
            description="Diagnosis found no chargeable replacement parts.",
            location_mode=ServiceLocationMode.BRING_IN,
        ),
    )
    no_cost_request.state = ServiceRequestState.DIAGNOSING
    repaired = await workflow.start_no_cost_repair(no_cost_request.id, admin.id)
    assert repaired.state is ServiceRequestState.REPAIR_IN_PROGRESS
