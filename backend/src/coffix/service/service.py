from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Any, Never, Protocol, cast
from uuid import UUID

from coffix.api.errors import ApiError
from coffix.core.clock import Clock
from coffix.core.ids import IdGenerator
from coffix.core.types import Money
from coffix.machines.models import RegisteredMachine
from coffix.media.models import MediaObject
from coffix.media.store import MediaPurpose
from coffix.payments.models import Payment, PaymentPhase, PaymentState
from coffix.payments.providers import ProviderEvent, ProviderState
from coffix.payments.service import PaymentIntent, PaymentService
from coffix.service.models import (
    ServiceLocationMode,
    ServiceMedia,
    ServiceMediaPurpose,
    ServiceNote,
    ServiceNoteVisibility,
    ServiceQuote,
    ServiceQuoteDecision,
    ServiceRequest,
    ServiceRequestState,
    ServiceType,
)
from coffix.service.schemas import (
    ServiceHistoryRead,
    ServiceMediaRead,
    ServiceNoteRead,
    ServiceOperationalAction,
    ServiceQuoteCreate,
    ServiceQuoteDecisionInput,
    ServiceQuoteRead,
    ServiceRequestCreate,
    ServiceRequestRead,
    ServiceTypeCreate,
    ServiceTypeRead,
    ServiceTypeUpdate,
    TechnicianMediaCreate,
    TechnicianNoteCreate,
)
from coffix.service.state_machine import (
    ServiceAction,
    ServiceActor,
    ServiceTransitionError,
    allowed_service_actions,
    next_service_state,
)
from coffix.users.models import Address


class QuoteDecisionError(ValueError):
    pass


def decide_quote(
    quote: ServiceQuote,
    decision: ServiceQuoteDecision,
    decided_at: datetime,
) -> None:
    if decision is ServiceQuoteDecision.PENDING:
        raise QuoteDecisionError("quote decision must be a final decision")
    if quote.decision is not ServiceQuoteDecision.PENDING:
        raise QuoteDecisionError("quote has already been decided")
    quote.decision = decision
    quote.decided_at = decided_at


class ServiceRequestStore(Protocol):
    async def get_owned_machine(
        self,
        machine_id: UUID,
        customer_id: UUID,
    ) -> RegisteredMachine | None: ...

    async def get_active_service_type_for_model(
        self,
        service_type_id: UUID,
        machine_model_id: UUID,
    ) -> ServiceType | None: ...

    async def get_owned_address(
        self,
        address_id: UUID,
        customer_id: UUID,
    ) -> Address | None: ...

    async def get_issue_media_for_update(
        self,
        media_ids: list[UUID],
    ) -> list[MediaObject]: ...

    async def create_request(self, **values: object) -> ServiceRequest: ...

    async def list_for_customer(self, customer_id: UUID) -> list[ServiceRequest]: ...

    async def get_for_customer(
        self,
        request_id: UUID,
        customer_id: UUID,
    ) -> ServiceRequest | None: ...

    async def get_for_customer_for_update(
        self,
        request_id: UUID,
        customer_id: UUID,
    ) -> ServiceRequest | None: ...


class ServiceTransitionStore(Protocol):
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
    ) -> None: ...


class ServiceTransitionService:
    def __init__(self, store: ServiceTransitionStore, *, clock: Clock) -> None:
        self.store = store
        self.clock = clock

    async def transition(
        self,
        request: ServiceRequest,
        action: ServiceAction,
        actor: ServiceActor,
        *,
        actor_id: UUID | None,
        reason: str | None = None,
    ) -> None:
        try:
            target = next_service_state(request.state, action, actor)
        except ServiceTransitionError as exc:
            raise ApiError(
                status=409,
                code="SERVICE_TRANSITION_NOT_ALLOWED",
                title="Service request transition is not allowed",
            ) from exc
        await self.store.transition_with_records(
            request,
            target=target,
            actor_id=actor_id,
            source=actor.value,
            reason=reason,
            event_type=f"service.request.{target.value}",
            payload={
                "service_request_id": str(request.id),
                "state": target.value,
            },
            occurred_at=self.clock.now(),
        )


class ServiceRequestService:
    def __init__(
        self,
        store: ServiceRequestStore,
        *,
        clock: Clock,
        ids: IdGenerator,
        shop_address: dict[str, Any],
    ) -> None:
        if shop_address.get("country") != "IL":
            raise ValueError("shop address must use country IL")
        self.store = store
        self.clock = clock
        self.ids = ids
        self.shop_address = deepcopy(shop_address)
        self.transitions = ServiceTransitionService(
            cast(ServiceTransitionStore, store),
            clock=clock,
        )

    async def create(
        self,
        customer_id: UUID,
        machine_id: UUID,
        data: ServiceRequestCreate,
    ) -> ServiceRequest:
        machine = await self.store.get_owned_machine(machine_id, customer_id)
        if machine is None:
            raise ApiError(status=404, code="MACHINE_NOT_FOUND", title="Machine not found")
        service_type = await self.store.get_active_service_type_for_model(
            data.service_type_id,
            machine.machine_model_id,
        )
        if service_type is None:
            raise ApiError(
                status=422,
                code="SERVICE_TYPE_NOT_AVAILABLE",
                title="Service type is not available for this machine",
            )
        address_snapshot = await self._address_snapshot(customer_id, data)
        media = await self.store.get_issue_media_for_update(data.media_ids)
        if len(media) != len(data.media_ids) or any(
            item.owner_id != customer_id or item.purpose is not MediaPurpose.SERVICE_ISSUE
            for item in media
        ):
            raise ApiError(
                status=422,
                code="SERVICE_MEDIA_NOT_AVAILABLE",
                title="Service issue media is not available",
            )
        request_id = self.ids.new()
        preferred_start: datetime | None = None
        preferred_end: datetime | None = None
        if data.preferred_window is not None:
            preferred_start = data.preferred_window.start
            preferred_end = data.preferred_window.end
        return await self.store.create_request(
            id=request_id,
            reference=f"CFX-SVC-{request_id.hex[:12].upper()}",
            customer_id=customer_id,
            machine_id=machine.id,
            service_type_id=service_type.id,
            service_type=service_type,
            diagnostic_fee_agorot=service_type.diagnostic_fee_agorot,
            currency="ILS",
            state=ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT,
            description=data.description.strip(),
            location_mode=data.location_mode,
            address_snapshot=address_snapshot,
            preferred_window_start=preferred_start,
            preferred_window_end=preferred_end,
            confirmed_appointment_start=None,
            confirmed_appointment_end=None,
            assigned_technician_id=None,
            diagnostic_payment_id=None,
            media=media,
            actor_id=customer_id,
            now=self.clock.now(),
        )

    async def list_for_customer(self, customer_id: UUID) -> list[ServiceRequestRead]:
        requests = await self.store.list_for_customer(customer_id)
        return [self._read(request) for request in requests]

    def view(self, request: ServiceRequest) -> ServiceRequestRead:
        return self._read(request)

    async def get_for_customer(
        self,
        customer_id: UUID,
        request_id: UUID,
    ) -> ServiceRequestRead:
        request = await self.store.get_for_customer(request_id, customer_id)
        if request is None:
            self._not_found()
        return self._read(request)

    async def cancel(
        self,
        customer_id: UUID,
        request_id: UUID,
    ) -> ServiceRequestRead:
        request = await self.store.get_for_customer_for_update(request_id, customer_id)
        if request is None:
            self._not_found()
        await self.transitions.transition(
            request,
            ServiceAction.CANCEL,
            ServiceActor.CUSTOMER,
            actor_id=customer_id,
            reason="Customer cancelled before diagnostic payment",
        )
        return self._read(request)

    async def _address_snapshot(
        self,
        customer_id: UUID,
        data: ServiceRequestCreate,
    ) -> dict[str, Any]:
        if data.location_mode is ServiceLocationMode.BRING_IN:
            return deepcopy(self.shop_address)
        if data.address_id is not None:
            address = await self.store.get_owned_address(data.address_id, customer_id)
            if address is None:
                raise ApiError(status=404, code="ADDRESS_NOT_FOUND", title="Address not found")
            return {
                "recipient_name": address.recipient_name,
                "phone_e164": address.phone_e164,
                "street": address.street,
                "building": address.building,
                "apartment": address.apartment,
                "city": address.city,
                "postal_code": address.postal_code,
                "country": address.country,
            }
        assert data.address is not None
        snapshot = cast(dict[str, Any], data.address.model_dump())
        snapshot["phone_e164"] = snapshot.pop("phone")
        return snapshot

    @staticmethod
    def _not_found() -> Never:
        raise ApiError(
            status=404,
            code="SERVICE_REQUEST_NOT_FOUND",
            title="Service request not found",
        )

    @staticmethod
    def _read(
        request: ServiceRequest,
        actor: ServiceActor = ServiceActor.CUSTOMER,
    ) -> ServiceRequestRead:
        return ServiceRequestRead(
            id=request.id,
            reference=request.reference,
            machine_id=request.machine_id,
            service_type_id=request.service_type_id,
            service_type_label_he=request.service_type.label_he,
            state=request.state,
            diagnostic_fee_agorot=request.diagnostic_fee_agorot,
            currency="ILS",
            description=request.description,
            location_mode=request.location_mode,
            address_snapshot=dict(request.address_snapshot),
            preferred_window_start=request.preferred_window_start,
            preferred_window_end=request.preferred_window_end,
            confirmed_appointment_start=request.confirmed_appointment_start,
            confirmed_appointment_end=request.confirmed_appointment_end,
            assigned_technician_id=request.assigned_technician_id,
            history=[
                ServiceHistoryRead(
                    from_state=entry.from_state,
                    to_state=entry.to_state,
                    source=entry.source,
                    reason=entry.reason,
                    created_at=entry.created_at,
                )
                for entry in request.history
            ],
            notes=[
                ServiceNoteRead(
                    id=note.id,
                    author_id=note.author_id,
                    visibility=note.visibility,
                    body=note.body,
                    created_at=note.created_at,
                )
                for note in request.notes
                if actor is not ServiceActor.CUSTOMER
                or note.visibility is ServiceNoteVisibility.CUSTOMER
            ],
            media=[
                ServiceMediaRead(
                    id=item.id,
                    media_id=item.media_id,
                    uploader_id=item.uploader_id,
                    purpose=item.purpose,
                    note_id=item.note_id,
                    created_at=item.created_at,
                )
                for item in request.media
            ],
            quotes=[
                ServiceQuoteRead(
                    id=quote.id,
                    amount_agorot=quote.amount_agorot,
                    currency="ILS",
                    explanation=quote.explanation,
                    decision=quote.decision,
                    decided_at=quote.decided_at,
                    created_at=quote.created_at,
                )
                for quote in request.quotes
            ],
            allowed_actions=tuple(sorted(allowed_service_actions(request.state, actor))),
            created_at=request.created_at,
            updated_at=request.updated_at,
        )


class ServiceWorkflowService:
    def __init__(
        self,
        store: Any,
        *,
        clock: Clock,
        payments: PaymentService | None = None,
    ) -> None:
        self.store = store
        self.clock = clock
        self.payments = payments
        self.transitions = ServiceTransitionService(store, clock=clock)

    async def create_diagnostic_payment(
        self,
        request_id: UUID,
        customer_id: UUID,
        idempotency_key: str,
    ) -> PaymentIntent:
        request = await self.store.get_for_customer_for_update(request_id, customer_id)
        if request is None:
            ServiceRequestService._not_found()
        if request.state is not ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT:
            self._payment_not_allowed()
        payments = self._payments()
        if request.diagnostic_payment_id is not None:
            return await payments.get_intent(request.diagnostic_payment_id)
        intent = await payments.create_payment(
            owner_id=request.id,
            phase=PaymentPhase.DIAGNOSTIC,
            amount=Money(request.diagnostic_fee_agorot, request.currency),
            idempotency_key=idempotency_key,
            metadata={"service_request_id": str(request.id)},
        )
        await self.store.set_diagnostic_payment(request, intent.payment_id)
        return intent

    async def create_quote(
        self,
        request_id: UUID,
        admin_id: UUID,
        data: ServiceQuoteCreate,
    ) -> ServiceRequestRead:
        request = await self._request_for_update(request_id)
        if request.state is not ServiceRequestState.DIAGNOSING or any(
            quote.decision is ServiceQuoteDecision.PENDING for quote in request.quotes
        ):
            raise ApiError(
                status=409,
                code="SERVICE_QUOTE_NOT_ALLOWED",
                title="An additional quote cannot be created",
            )
        await self.store.create_quote(
            request,
            admin_id=admin_id,
            amount_agorot=data.amount_agorot,
            explanation=data.explanation.strip(),
        )
        await self.transitions.transition(
            request,
            ServiceAction.REQUEST_ADDITIONAL_DECISION,
            ServiceActor.ADMIN,
            actor_id=admin_id,
            reason="Additional repair cost quoted",
        )
        return ServiceRequestService._read(request, ServiceActor.ADMIN)

    async def decide_quote(
        self,
        request_id: UUID,
        customer_id: UUID,
        data: ServiceQuoteDecisionInput,
    ) -> ServiceRequestRead:
        request = await self.store.get_for_customer_for_update(request_id, customer_id)
        if request is None:
            ServiceRequestService._not_found()
        pending = next(
            (quote for quote in request.quotes if quote.decision is ServiceQuoteDecision.PENDING),
            None,
        )
        if pending is None:
            raise ApiError(
                status=409,
                code="SERVICE_QUOTE_DECISION_NOT_ALLOWED",
                title="There is no quote awaiting a decision",
            )
        decide_quote(pending, data.decision, self.clock.now())
        accepted = data.decision is ServiceQuoteDecision.ACCEPTED
        await self.transitions.transition(
            request,
            (
                ServiceAction.ACCEPT_ADDITIONAL_QUOTE
                if accepted
                else ServiceAction.DECLINE_ADDITIONAL_QUOTE
            ),
            ServiceActor.CUSTOMER,
            actor_id=customer_id,
            reason="Customer accepted additional quote" if accepted else "Customer declined quote",
        )
        return ServiceRequestService._read(request)

    async def create_additional_payment(
        self,
        request_id: UUID,
        customer_id: UUID,
        idempotency_key: str,
    ) -> PaymentIntent:
        request = await self.store.get_for_customer_for_update(request_id, customer_id)
        if request is None:
            ServiceRequestService._not_found()
        quote = next(
            (item for item in request.quotes if item.decision is ServiceQuoteDecision.ACCEPTED),
            None,
        )
        if request.state is not ServiceRequestState.AWAITING_ADDITIONAL_PAYMENT or quote is None:
            self._payment_not_allowed()
        payments = self._payments()
        if quote.additional_payment_id is not None:
            return await payments.get_intent(quote.additional_payment_id)
        intent = await payments.create_payment(
            owner_id=request.id,
            phase=PaymentPhase.ADDITIONAL,
            amount=Money(quote.amount_agorot, quote.currency),
            idempotency_key=idempotency_key,
            metadata={
                "service_request_id": str(request.id),
                "service_quote_id": str(quote.id),
            },
        )
        await self.store.set_additional_payment(quote, intent.payment_id)
        return intent

    async def start_no_cost_repair(self, request_id: UUID, admin_id: UUID) -> ServiceRequestRead:
        request = await self._request_for_update(request_id)
        await self.transitions.transition(
            request,
            ServiceAction.START_REPAIR,
            ServiceActor.ADMIN,
            actor_id=admin_id,
            reason="No additional cost required",
        )
        return ServiceRequestService._read(request, ServiceActor.ADMIN)

    async def admin_action(
        self,
        request_id: UUID,
        admin_id: UUID,
        data: ServiceOperationalAction,
    ) -> ServiceRequestRead:
        request = await self._request_for_update(request_id)
        action = self._operational_action(data.action)
        await self.transitions.transition(
            request,
            action,
            ServiceActor.ADMIN,
            actor_id=admin_id,
        )
        return ServiceRequestService._read(request, ServiceActor.ADMIN)

    async def list_technician_jobs(self, technician_id: UUID) -> list[ServiceRequestRead]:
        return [
            ServiceRequestService._read(item, ServiceActor.TECHNICIAN)
            for item in await self.store.list_for_technician(technician_id)
        ]

    async def get_technician_job(self, request_id: UUID, technician_id: UUID) -> ServiceRequestRead:
        request = await self.store.get_for_technician(request_id, technician_id)
        if request is None:
            ServiceRequestService._not_found()
        return ServiceRequestService._read(request, ServiceActor.TECHNICIAN)

    async def technician_action(
        self,
        request_id: UUID,
        technician_id: UUID,
        data: ServiceOperationalAction,
    ) -> ServiceRequestRead:
        request = await self.store.get_for_technician(request_id, technician_id, for_update=True)
        if request is None:
            ServiceRequestService._not_found()
        action = self._operational_action(data.action)
        await self.transitions.transition(
            request,
            action,
            ServiceActor.TECHNICIAN,
            actor_id=technician_id,
        )
        return ServiceRequestService._read(request, ServiceActor.TECHNICIAN)

    async def add_technician_note(
        self,
        request_id: UUID,
        technician_id: UUID,
        data: TechnicianNoteCreate,
    ) -> ServiceNote:
        request = await self.store.get_for_technician(request_id, technician_id, for_update=True)
        if request is None:
            ServiceRequestService._not_found()
        note = ServiceNote(
            request_id=request.id,
            author_id=technician_id,
            visibility=ServiceNoteVisibility.INTERNAL,
            body=data.body.strip(),
        )
        request.notes.append(note)
        await self.store.add_note(note)
        return note

    async def add_technician_media(
        self,
        request_id: UUID,
        technician_id: UUID,
        data: TechnicianMediaCreate,
    ) -> ServiceMedia:
        request = await self.store.get_for_technician(request_id, technician_id, for_update=True)
        if request is None:
            ServiceRequestService._not_found()
        media = await self.store.get_service_media_for_update(data.media_id)
        purpose_by_upload = {
            MediaPurpose.SERVICE_DIAGNOSIS: ServiceMediaPurpose.DIAGNOSIS,
            MediaPurpose.SERVICE_REPAIR: ServiceMediaPurpose.REPAIR,
        }
        if (
            media is None
            or media.owner_id != technician_id
            or media.collection_id != request.id
            or media.purpose not in purpose_by_upload
        ):
            raise ApiError(
                status=422,
                code="SERVICE_MEDIA_NOT_AVAILABLE",
                title="Service media is not available",
            )
        return await self.store.add_service_media(
            request,
            media_id=media.id,
            uploader_id=technician_id,
            purpose=purpose_by_upload[media.purpose],
        )

    async def handle_provider_event(self, payment: Payment, event: ProviderEvent) -> str | None:
        if (
            event.state is not ProviderState.CONFIRMED
            or payment.state is not PaymentState.CONFIRMED
        ):
            return None
        request = await self.store.get_for_update(payment.owner_id)
        if request is None:
            return "unmatched_owner"
        if payment.phase is PaymentPhase.DIAGNOSTIC:
            if request.diagnostic_payment_id != payment.id:
                return "unmatched_owner"
            action = ServiceAction.DIAGNOSTIC_PAYMENT_CONFIRMED
        elif payment.phase is PaymentPhase.ADDITIONAL:
            quote = next(
                (item for item in request.quotes if item.additional_payment_id == payment.id),
                None,
            )
            if quote is None:
                return "unmatched_owner"
            action = ServiceAction.ADDITIONAL_PAYMENT_CONFIRMED
        else:
            return None
        try:
            await self.transitions.transition(
                request,
                action,
                ServiceActor.SYSTEM,
                actor_id=None,
                reason=f"{payment.phase.value} payment confirmed by provider",
            )
        except ApiError as exc:
            if exc.code == "SERVICE_TRANSITION_NOT_ALLOWED":
                return "ignored_owner_state"
            raise
        return None

    async def _request_for_update(self, request_id: UUID) -> ServiceRequest:
        request = await self.store.get_for_update(request_id)
        if request is None:
            ServiceRequestService._not_found()
        return request

    def _payments(self) -> PaymentService:
        if self.payments is None:
            raise RuntimeError("payment commands are not configured")
        return self.payments

    @staticmethod
    def _operational_action(action: str) -> ServiceAction:
        return {
            "receive": ServiceAction.RECEIVE,
            "start_diagnosis": ServiceAction.START_DIAGNOSIS,
            "ready_for_return": ServiceAction.READY_FOR_RETURN,
            "complete": ServiceAction.COMPLETE,
        }[action]

    @staticmethod
    def _payment_not_allowed() -> Never:
        raise ApiError(
            status=409,
            code="SERVICE_PAYMENT_NOT_ALLOWED",
            title="Service payment is not allowed in the current state",
        )


class ServiceTypeStore(Protocol):
    async def list_service_types(self) -> list[ServiceType]: ...

    async def get_service_type_for_update(self, service_type_id: UUID) -> ServiceType | None: ...

    async def existing_machine_model_ids(self, model_ids: set[UUID]) -> set[UUID]: ...

    async def create_service_type(
        self,
        *,
        label_he: str,
        label_en: str,
        diagnostic_fee_agorot: int,
        is_active: bool,
        machine_model_ids: list[UUID],
    ) -> ServiceType: ...

    async def update_service_type(
        self,
        service_type: ServiceType,
        *,
        changes: dict[str, object],
        machine_model_ids: list[UUID] | None,
    ) -> ServiceType: ...


class ServiceTypeConfigService:
    def __init__(self, store: ServiceTypeStore) -> None:
        self.store = store

    async def list_all(self) -> list[ServiceTypeRead]:
        return [self._read(item) for item in await self.store.list_service_types()]

    async def create(self, data: ServiceTypeCreate) -> ServiceTypeRead:
        await self._validate_models(data.machine_model_ids)
        service_type = await self.store.create_service_type(
            label_he=data.label_he.strip(),
            label_en=data.label_en.strip(),
            diagnostic_fee_agorot=data.diagnostic_fee_agorot,
            is_active=data.is_active,
            machine_model_ids=data.machine_model_ids,
        )
        return self._read(service_type)

    async def update(
        self,
        service_type_id: UUID,
        data: ServiceTypeUpdate,
    ) -> ServiceTypeRead:
        service_type = await self.store.get_service_type_for_update(service_type_id)
        if service_type is None:
            raise ApiError(
                status=404,
                code="SERVICE_TYPE_NOT_FOUND",
                title="Service type not found",
            )
        if service_type.version != data.expected_version:
            raise ApiError(
                status=409,
                code="SERVICE_TYPE_VERSION_CONFLICT",
                title="Service type was updated by another request",
            )
        if data.machine_model_ids is not None:
            await self._validate_models(data.machine_model_ids)
        changes = data.model_dump(
            exclude={"expected_version", "machine_model_ids"},
            exclude_none=True,
        )
        updated = await self.store.update_service_type(
            service_type,
            changes=changes,
            machine_model_ids=data.machine_model_ids,
        )
        return self._read(updated)

    async def _validate_models(self, model_ids: list[UUID]) -> None:
        if await self.store.existing_machine_model_ids(set(model_ids)) != set(model_ids):
            raise ApiError(
                status=422,
                code="MACHINE_MODEL_NOT_FOUND",
                title="One or more machine models do not exist",
            )

    @staticmethod
    def _read(service_type: ServiceType) -> ServiceTypeRead:
        return ServiceTypeRead(
            id=service_type.id,
            label_he=service_type.label_he,
            label_en=service_type.label_en,
            diagnostic_fee_agorot=service_type.diagnostic_fee_agorot,
            is_active=service_type.is_active,
            version=service_type.version,
            machine_model_ids=[link.machine_model_id for link in service_type.model_links],
            created_at=service_type.created_at,
            updated_at=service_type.updated_at,
        )
