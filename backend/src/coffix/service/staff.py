"""Staff job context and administrative notes/cancellation."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.admin.queries import AdminCommands, AuditContext
from coffix.core.clock import Clock
from coffix.machines.models import MachineModel, RegisteredMachine
from coffix.service.models import ServiceNote, ServiceRequest
from coffix.service.repository import ServiceRepository
from coffix.service.schemas import (
    AdminNoteCreate,
    ServiceCancelInput,
    ServiceCustomerRead,
    ServiceMachineRead,
    StaffServiceRequestRead,
)
from coffix.service.service import ServiceRequestService, ServiceTransitionService
from coffix.service.state_machine import ServiceAction, ServiceActor
from coffix.users.models import User


class StaffService:
    def __init__(self, session: AsyncSession, *, clock: Clock) -> None:
        self.session = session
        self.repository = ServiceRepository(session)
        self.clock = clock

    async def read(self, item: ServiceRequest, actor: ServiceActor) -> StaffServiceRequestRead:
        customer, machine, model = (
            await self.session.execute(
                select(User, RegisteredMachine, MachineModel)
                .select_from(RegisteredMachine)
                .join(User, User.id == RegisteredMachine.customer_id)
                .join(MachineModel, MachineModel.id == RegisteredMachine.machine_model_id)
                .where(RegisteredMachine.id == item.machine_id)
            )
        ).one()
        return StaffServiceRequestRead(
            **ServiceRequestService._read(item, actor).model_dump(),
            customer=ServiceCustomerRead(
                id=customer.id, display_name=customer.display_name, phone_e164=customer.phone_e164
            ),
            machine=ServiceMachineRead(
                manufacturer=model.manufacturer,
                model_name=model.model_name,
                serial_number=machine.serial_number,
            ),
        )

    async def detail(
        self, request_id: UUID, technician_id: UUID | None = None
    ) -> StaffServiceRequestRead:
        if technician_id is None:
            item = await self.session.scalar(
                select(ServiceRequest)
                .where(ServiceRequest.id == request_id)
                .options(*self.repository._request_options())
            )
        else:
            item = await self.repository.get_for_technician(request_id, technician_id)
        if item is None:
            ServiceRequestService._not_found()
        return await self.read(
            item, ServiceActor.ADMIN if technician_id is None else ServiceActor.TECHNICIAN
        )

    async def note(
        self, request_id: UUID, data: AdminNoteCreate, context: AuditContext
    ) -> ServiceNote:
        item = await self.repository.get_for_update(request_id)
        if item is None:
            ServiceRequestService._not_found()
        note = ServiceNote(
            request_id=item.id,
            author_id=context.actor_id,
            visibility=data.visibility,
            body=data.body,
            created_at=self.clock.now(),
        )
        await self.repository.add_note(note)
        await AdminCommands(self.session, clock=self.clock).audit(
            action="service.note_added",
            target_type="service_request",
            target_id=item.id,
            before=None,
            after={"note_id": str(note.id), "visibility": data.visibility.value},
            context=context,
        )
        return note

    async def cancel(
        self, request_id: UUID, data: ServiceCancelInput, context: AuditContext
    ) -> StaffServiceRequestRead:
        item = await self.repository.get_for_update(request_id)
        if item is None:
            ServiceRequestService._not_found()
        await ServiceTransitionService(self.repository, clock=self.clock).transition(
            item,
            ServiceAction.CANCEL,
            ServiceActor.ADMIN,
            actor_id=context.actor_id,
            reason=data.reason,
        )
        return await self.read(item, ServiceActor.ADMIN)
