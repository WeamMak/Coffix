from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.service.models import ServiceRequest
from coffix.service.repository import ServiceRepository
from coffix.users.models import Role, User


class SchedulingRepository(ServiceRepository):
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_request_for_update(self, request_id: UUID) -> ServiceRequest | None:
        return await self.session.scalar(
            select(ServiceRequest)
            .where(ServiceRequest.id == request_id)
            .options(*self._request_options())
            .with_for_update(of=ServiceRequest)
        )

    async def get_active_technician(self, technician_id: UUID) -> User | None:
        return await self.session.scalar(
            select(User).where(
                User.id == technician_id,
                User.role == Role.TECHNICIAN,
                User.is_active.is_(True),
            )
        )

    async def list_overlaps(
        self,
        *,
        technician_id: UUID,
        start: datetime,
        end: datetime,
        exclude_request_id: UUID,
    ) -> list[ServiceRequest]:
        requests = await self.session.scalars(
            select(ServiceRequest)
            .where(
                ServiceRequest.assigned_technician_id == technician_id,
                ServiceRequest.id != exclude_request_id,
                ServiceRequest.confirmed_appointment_start < end,
                ServiceRequest.confirmed_appointment_end > start,
            )
            .order_by(ServiceRequest.confirmed_appointment_start, ServiceRequest.id)
        )
        return list(requests)

    async def set_appointment(
        self,
        request: ServiceRequest,
        *,
        technician_id: UUID,
        start: datetime,
        end: datetime,
    ) -> None:
        request.assigned_technician_id = technician_id
        request.confirmed_appointment_start = start
        request.confirmed_appointment_end = end
        await self.session.flush()
