from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Any, Never, Protocol, cast
from uuid import UUID

from coffix.api.errors import ApiError
from coffix.core.clock import Clock
from coffix.core.ids import IdGenerator
from coffix.machines.models import RegisteredMachine
from coffix.media.models import MediaObject
from coffix.media.store import MediaPurpose
from coffix.service.models import (
    ServiceLocationMode,
    ServiceNoteVisibility,
    ServiceRequest,
    ServiceRequestState,
    ServiceType,
)
from coffix.service.schemas import (
    ServiceHistoryRead,
    ServiceMediaRead,
    ServiceNoteRead,
    ServiceQuoteRead,
    ServiceRequestCreate,
    ServiceRequestRead,
    ServiceTypeCreate,
    ServiceTypeRead,
    ServiceTypeUpdate,
)
from coffix.service.state_machine import (
    ServiceAction,
    ServiceActor,
    ServiceTransitionError,
    allowed_service_actions,
    next_service_state,
)
from coffix.users.models import Address


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
    def _read(request: ServiceRequest) -> ServiceRequestRead:
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
                if note.visibility is ServiceNoteVisibility.CUSTOMER
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
            allowed_actions=tuple(
                sorted(allowed_service_actions(request.state, ServiceActor.CUSTOMER))
            ),
            created_at=request.created_at,
            updated_at=request.updated_at,
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
