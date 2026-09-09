from typing import Never
from uuid import UUID

from coffix.admin.queries import AdminCommands, AuditContext
from coffix.api.errors import ApiError
from coffix.core.clock import Clock
from coffix.scheduling.repository import SchedulingRepository
from coffix.scheduling.schemas import (
    AppointmentConfirmation,
    AssignmentChange,
    ScheduleOverlapWarning,
)
from coffix.service.models import ServiceRequest, ServiceRequestState
from coffix.service.service import ServiceTransitionService
from coffix.service.state_machine import ServiceAction, ServiceActor, allowed_service_actions


class SchedulingService:
    def __init__(self, repository: SchedulingRepository, *, clock: Clock) -> None:
        self.repository = repository
        self.clock = clock
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
        self._require_overlap_confirmation(overlaps, data.allow_overlap)
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

    async def preview(
        self, request_id: UUID, data: AppointmentConfirmation
    ) -> list[ScheduleOverlapWarning]:
        request = await self.repository.get_request_for_update(request_id)
        if request is None:
            self._not_found()
        if not {"schedule", "assign"}.intersection(
            allowed_service_actions(request.state, ServiceActor.ADMIN)
        ):
            raise ApiError(
                status=409,
                code="SERVICE_TRANSITION_NOT_ALLOWED",
                title="Scheduling is not available",
            )
        if await self.repository.get_active_technician(data.technician_id) is None:
            raise ApiError(
                status=422, code="TECHNICIAN_NOT_AVAILABLE", title="Technician is not available"
            )
        overlaps = await self.repository.list_overlaps(
            technician_id=data.technician_id,
            start=data.start,
            end=data.end,
            exclude_request_id=request_id,
        )
        return [
            ScheduleOverlapWarning(
                request_id=item.id,
                reference=item.reference,
                start=item.confirmed_appointment_start,
                end=item.confirmed_appointment_end,
            )
            for item in overlaps
            if item.confirmed_appointment_start and item.confirmed_appointment_end
        ]

    async def assign(
        self, request_id: UUID, data: AssignmentChange, context: AuditContext
    ) -> ServiceRequest:
        request = await self.repository.get_request_for_update(request_id)
        if request is None:
            self._not_found()
        if "assign" not in allowed_service_actions(request.state, ServiceActor.ADMIN):
            raise ApiError(
                status=409,
                code="SERVICE_TRANSITION_NOT_ALLOWED",
                title="Assignment is not available",
            )
        if request.assigned_technician_id != data.expected_technician_id:
            raise ApiError(
                status=409,
                code="ASSIGNMENT_CHANGED",
                title="Assignment changed; reload before saving",
            )
        if await self.repository.get_active_technician(data.technician_id) is None:
            raise ApiError(
                status=422, code="TECHNICIAN_NOT_AVAILABLE", title="Technician is not available"
            )
        start, end = request.confirmed_appointment_start, request.confirmed_appointment_end
        if start is None or end is None:
            raise ApiError(
                status=409, code="APPOINTMENT_REQUIRED", title="Confirm an appointment first"
            )
        overlaps = await self.repository.list_overlaps(
            technician_id=data.technician_id,
            start=start,
            end=end,
            exclude_request_id=request_id,
        )
        self._require_overlap_confirmation(overlaps, data.allow_overlap)
        await self.repository.set_appointment(
            request, technician_id=data.technician_id, start=start, end=end
        )
        await AdminCommands(self.repository.session, clock=self.clock).audit(
            action="service.assignment_changed",
            target_type="service_request",
            target_id=request_id,
            before={"technician_id": str(data.expected_technician_id)},
            after={"technician_id": str(data.technician_id), "reason": data.reason},
            context=context,
        )
        return request

    @staticmethod
    def _require_overlap_confirmation(overlaps: list[ServiceRequest], allow: bool) -> None:
        if overlaps and not allow:
            raise ApiError(
                status=409,
                code="SCHEDULE_OVERLAP",
                title="Appointment overlaps require confirmation",
                errors={"overlaps": [item.reference for item in overlaps]},
            )

    @staticmethod
    def _not_found() -> Never:
        raise ApiError(
            status=404,
            code="SERVICE_REQUEST_NOT_FOUND",
            title="Service request not found",
        )
