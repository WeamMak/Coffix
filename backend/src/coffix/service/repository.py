from datetime import datetime
from typing import cast
from uuid import UUID

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.interfaces import ORMOption

from coffix.machines.models import MachineModel, RegisteredMachine
from coffix.machines.schemas import MachineServiceHistoryRead
from coffix.media.models import MediaObject
from coffix.service.models import (
    OutboxEvent,
    ServiceMedia,
    ServiceMediaPurpose,
    ServiceNote,
    ServiceQuote,
    ServiceQuoteDecision,
    ServiceRequest,
    ServiceRequestState,
    ServiceStatusHistory,
    ServiceType,
    ServiceTypeMachineModel,
)
from coffix.users.models import Address


class ServiceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def _request_options() -> tuple[ORMOption, ...]:
        return (
            selectinload(ServiceRequest.service_type),
            selectinload(ServiceRequest.history),
            selectinload(ServiceRequest.notes),
            selectinload(ServiceRequest.media),
            selectinload(ServiceRequest.quotes),
        )

    async def get_owned_machine(
        self,
        machine_id: UUID,
        customer_id: UUID,
    ) -> RegisteredMachine | None:
        return await self.session.scalar(
            select(RegisteredMachine).where(
                RegisteredMachine.id == machine_id,
                RegisteredMachine.customer_id == customer_id,
            )
        )

    async def get_active_service_type_for_model(
        self,
        service_type_id: UUID,
        machine_model_id: UUID,
    ) -> ServiceType | None:
        return await self.session.scalar(
            select(ServiceType)
            .join(
                ServiceTypeMachineModel,
                ServiceTypeMachineModel.service_type_id == ServiceType.id,
            )
            .where(
                ServiceType.id == service_type_id,
                ServiceType.is_active.is_(True),
                ServiceTypeMachineModel.machine_model_id == machine_model_id,
            )
        )

    async def get_owned_address(
        self,
        address_id: UUID,
        customer_id: UUID,
    ) -> Address | None:
        return await self.session.scalar(
            select(Address).where(
                Address.id == address_id,
                Address.user_id == customer_id,
            )
        )

    async def get_issue_media_for_update(
        self,
        media_ids: list[UUID],
    ) -> list[MediaObject]:
        if not media_ids:
            return []
        media = await self.session.scalars(
            select(MediaObject)
            .where(
                MediaObject.id.in_(media_ids),
                ~exists(select(ServiceMedia.id).where(ServiceMedia.media_id == MediaObject.id)),
            )
            .with_for_update()
        )
        return list(media)

    async def create_request(self, **values: object) -> ServiceRequest:
        media = cast(list[MediaObject], values.pop("media"))
        actor_id = cast(UUID, values.pop("actor_id"))
        now = cast(datetime, values.pop("now"))
        request = ServiceRequest(**values)
        request.history = [
            ServiceStatusHistory(
                from_state=None,
                to_state=ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT,
                actor_id=actor_id,
                source="customer",
            )
        ]
        request.media = [
            ServiceMedia(
                media_id=item.id,
                uploader_id=actor_id,
                purpose=ServiceMediaPurpose.ISSUE,
            )
            for item in media
        ]
        request.notes = []
        request.quotes = []
        self.session.add(request)
        self.session.add(
            OutboxEvent(
                event_type="service.request.created",
                aggregate_type="service_request",
                aggregate_id=request.id,
                payload={
                    "service_request_id": str(request.id),
                    "state": ServiceRequestState.AWAITING_DIAGNOSTIC_PAYMENT.value,
                },
                available_at=now,
            )
        )
        await self.session.flush()
        await self.session.refresh(request, attribute_names=["updated_at"])
        return request

    async def list_for_customer(self, customer_id: UUID) -> list[ServiceRequest]:
        requests = await self.session.scalars(
            select(ServiceRequest)
            .where(ServiceRequest.customer_id == customer_id)
            .options(*self._request_options())
            .order_by(ServiceRequest.created_at.desc(), ServiceRequest.id.desc())
        )
        return list(requests)

    async def list_machine_history(
        self,
        customer_id: UUID,
        machine_ids: list[UUID],
    ) -> dict[UUID, list[MachineServiceHistoryRead]]:
        if not machine_ids:
            return {}
        rows = await self.session.execute(
            select(ServiceRequest, ServiceType.label_he)
            .join(ServiceType, ServiceType.id == ServiceRequest.service_type_id)
            .where(
                ServiceRequest.customer_id == customer_id,
                ServiceRequest.machine_id.in_(machine_ids),
            )
            .order_by(ServiceRequest.created_at.desc(), ServiceRequest.id.desc())
        )
        history: dict[UUID, list[MachineServiceHistoryRead]] = {}
        for request, label_he in rows.tuples():
            history.setdefault(request.machine_id, []).append(
                MachineServiceHistoryRead(
                    service_request_id=request.id,
                    reference=request.reference,
                    state=request.state.value,
                    service_type_label_he=label_he,
                    created_at=request.created_at,
                    updated_at=request.updated_at,
                )
            )
        return history

    async def get_for_customer(
        self,
        request_id: UUID,
        customer_id: UUID,
    ) -> ServiceRequest | None:
        return await self.session.scalar(
            select(ServiceRequest)
            .where(
                ServiceRequest.id == request_id,
                ServiceRequest.customer_id == customer_id,
            )
            .options(*self._request_options())
        )

    async def get_for_customer_for_update(
        self,
        request_id: UUID,
        customer_id: UUID,
    ) -> ServiceRequest | None:
        return await self.session.scalar(
            select(ServiceRequest)
            .where(
                ServiceRequest.id == request_id,
                ServiceRequest.customer_id == customer_id,
            )
            .options(*self._request_options())
            .with_for_update(of=ServiceRequest)
        )

    async def get_for_update(self, request_id: UUID) -> ServiceRequest | None:
        return await self.session.scalar(
            select(ServiceRequest)
            .where(ServiceRequest.id == request_id)
            .options(*self._request_options())
            .with_for_update(of=ServiceRequest)
        )

    async def get_for_technician(
        self,
        request_id: UUID,
        technician_id: UUID,
        *,
        for_update: bool = False,
    ) -> ServiceRequest | None:
        statement = (
            select(ServiceRequest)
            .where(
                ServiceRequest.id == request_id,
                ServiceRequest.assigned_technician_id == technician_id,
            )
            .options(*self._request_options())
        )
        if for_update:
            statement = statement.with_for_update(of=ServiceRequest)
        return await self.session.scalar(statement)

    async def list_for_technician(self, technician_id: UUID) -> list[ServiceRequest]:
        requests = await self.session.scalars(
            select(ServiceRequest)
            .where(ServiceRequest.assigned_technician_id == technician_id)
            .options(*self._request_options())
            .order_by(
                ServiceRequest.confirmed_appointment_start.asc().nullslast(),
                ServiceRequest.id,
            )
        )
        return list(requests)

    async def set_diagnostic_payment(self, request: ServiceRequest, payment_id: UUID) -> None:
        request.diagnostic_payment_id = payment_id
        await self.session.flush()

    async def create_quote(
        self,
        request: ServiceRequest,
        *,
        admin_id: UUID,
        amount_agorot: int,
        explanation: str,
    ) -> ServiceQuote:
        quote = ServiceQuote(
            request_id=request.id,
            admin_author_id=admin_id,
            amount_agorot=amount_agorot,
            currency="ILS",
            explanation=explanation,
            decision=ServiceQuoteDecision.PENDING,
        )
        request.quotes.append(quote)
        await self.session.flush()
        return quote

    async def set_additional_payment(self, quote: ServiceQuote, payment_id: UUID) -> None:
        quote.additional_payment_id = payment_id
        await self.session.flush()

    async def get_service_media_for_update(self, media_id: UUID) -> MediaObject | None:
        return await self.session.scalar(
            select(MediaObject)
            .where(
                MediaObject.id == media_id,
                ~exists(select(ServiceMedia.id).where(ServiceMedia.media_id == MediaObject.id)),
            )
            .with_for_update()
        )

    async def add_service_media(
        self,
        request: ServiceRequest,
        *,
        media_id: UUID,
        uploader_id: UUID,
        purpose: ServiceMediaPurpose,
    ) -> ServiceMedia:
        item = ServiceMedia(
            request_id=request.id,
            media_id=media_id,
            uploader_id=uploader_id,
            purpose=purpose,
        )
        request.media.append(item)
        await self.session.flush()
        return item

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
        request.history.append(
            ServiceStatusHistory(
                from_state=previous,
                to_state=target,
                actor_id=actor_id,
                source=source,
                reason=reason,
            )
        )
        self.session.add(
            OutboxEvent(
                event_type=event_type,
                aggregate_type="service_request",
                aggregate_id=request.id,
                payload=payload,
                available_at=occurred_at,
            )
        )
        await self.session.flush()
        await self.session.refresh(request, attribute_names=["updated_at"])

    async def list_service_types(self) -> list[ServiceType]:
        service_types = await self.session.scalars(
            select(ServiceType)
            .options(selectinload(ServiceType.model_links))
            .order_by(ServiceType.label_en, ServiceType.id)
        )
        return list(service_types)

    async def get_service_type_for_update(self, service_type_id: UUID) -> ServiceType | None:
        return await self.session.scalar(
            select(ServiceType)
            .where(ServiceType.id == service_type_id)
            .options(selectinload(ServiceType.model_links))
            .with_for_update()
        )

    async def existing_machine_model_ids(self, model_ids: set[UUID]) -> set[UUID]:
        if not model_ids:
            return set()
        models = await self.session.scalars(
            select(MachineModel.id).where(MachineModel.id.in_(model_ids))
        )
        return set(models)

    async def create_service_type(
        self,
        *,
        label_he: str,
        label_en: str,
        diagnostic_fee_agorot: int,
        is_active: bool,
        machine_model_ids: list[UUID],
    ) -> ServiceType:
        service_type = ServiceType(
            label_he=label_he,
            label_en=label_en,
            diagnostic_fee_agorot=diagnostic_fee_agorot,
            is_active=is_active,
            version=1,
            model_links=[
                ServiceTypeMachineModel(machine_model_id=model_id) for model_id in machine_model_ids
            ],
        )
        self.session.add(service_type)
        await self.session.flush()
        return service_type

    async def update_service_type(
        self,
        service_type: ServiceType,
        *,
        changes: dict[str, object],
        machine_model_ids: list[UUID] | None,
    ) -> ServiceType:
        for field, value in changes.items():
            setattr(service_type, field, value)
        if machine_model_ids is not None:
            service_type.model_links.clear()
            service_type.model_links.extend(
                ServiceTypeMachineModel(machine_model_id=model_id) for model_id in machine_model_ids
            )
        service_type.version += 1
        await self.session.flush()
        await self.session.refresh(
            service_type,
            attribute_names=["updated_at", "model_links"],
        )
        return service_type

    async def add_note(self, note: ServiceNote) -> None:
        self.session.add(note)
        await self.session.flush()
