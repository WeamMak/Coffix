from typing import Never
from uuid import UUID

from coffix.api.errors import ApiError
from coffix.core.clock import Clock
from coffix.scheduling.repository import SchedulingRepository
from coffix.scheduling.schemas import AppointmentConfirmation, ScheduleOverlapWarning
from coffix.service.models import ServiceRequest, ServiceRequestState
from coffix.service.service import ServiceTransitionService
from coffix.service.state_machine import ServiceAction, ServiceActor


class SchedulingService:
    def __init__(self, repository: SchedulingRepository, *, clock: Clock) -> None:
        self.repository = repository
        self.transitions = ServiceTransitionService(repository, clock=clock)

    async def confirm(
        self,
        request_id: UUID,
        data: AppointmentConfirmation,
        *,
        admin_id: UUID,
    ) -> tuple[ServiceRequest, list[ScheduleOverlapWarning]]:
        request = await self.repository.get_request_for_update(request_id)
        if request is None:
            self._not_found()
        if request.state is not ServiceRequestState.AWAITING_ADMIN_REVIEW:
            raise ApiError(
                status=409,
                code="SERVICE_TRANSITION_NOT_ALLOWED",
                title="Service request transition is not allowed",
            )
        if await self.repository.get_active_technician(data.technician_id) is None:
            raise ApiError(
                status=422,
                code="TECHNICIAN_NOT_AVAILABLE",
                title="Technician is not available",
            )
        overlaps = await self.repository.list_overlaps(
            technician_id=data.technician_id,
            start=data.start,
            end=data.end,
            exclude_request_id=request.id,
        )
        await self.repository.set_appointment(
            request,
            technician_id=data.technician_id,
            start=data.start,
            end=data.end,
        )
        await self.transitions.transition(
            request,
            ServiceAction.SCHEDULE,
            ServiceActor.ADMIN,
            actor_id=admin_id,
            reason="Appointment confirmed and technician assigned",
        )
        return request, [
            ScheduleOverlapWarning(
                request_id=item.id,
                reference=item.reference,
                start=item.confirmed_appointment_start,
                end=item.confirmed_appointment_end,
            )
            for item in overlaps
            if item.confirmed_appointment_start is not None
            and item.confirmed_appointment_end is not None
        ]

    @staticmethod
    def _not_found() -> Never:
        raise ApiError(
            status=404,
            code="SERVICE_REQUEST_NOT_FOUND",
            title="Service request not found",
        )
