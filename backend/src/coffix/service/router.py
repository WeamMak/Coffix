import json
from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Path, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.admin.router import context_for
from coffix.auth.policies import AdminActorDep, CustomerActorDep, TechnicianActorDep
from coffix.core.database import get_session
from coffix.payments.repository import PaymentRepository
from coffix.payments.service import PaymentService
from coffix.scheduling.repository import SchedulingRepository
from coffix.scheduling.schemas import (
    AppointmentConfirmation,
    AppointmentConfirmationRead,
    AssignmentChange,
    ScheduleOverlapWarning,
)
from coffix.scheduling.service import SchedulingService
from coffix.service.intake_config import preferred_windows, read_settings, update_settings
from coffix.service.repository import ServiceRepository
from coffix.service.schemas import (
    AdminNoteCreate,
    DiagnosticFeeInput,
    IntakeSettings,
    ServiceCancelInput,
    ServiceIntakeOptionsRead,
    ServiceMediaRead,
    ServiceNoteRead,
    ServiceOperationalAction,
    ServicePaymentIntentRead,
    ServiceQuoteCreate,
    ServiceQuoteDecisionInput,
    ServiceRequestCreate,
    ServiceRequestRead,
    ServiceTypeCreate,
    ServiceTypeRead,
    ServiceTypeUpdate,
    StaffServiceRequestRead,
    TechnicianMediaCreate,
    TechnicianNoteCreate,
)
from coffix.service.service import (
    ServiceRequestService,
    ServiceTypeConfigService,
    ServiceWorkflowService,
)
from coffix.service.staff import StaffService
from coffix.service.state_machine import ServiceActor

SessionDep = Annotated[AsyncSession, Depends(get_session)]
MachineIdPath = Annotated[UUID, Path()]
ServiceRequestIdPath = Annotated[UUID, Path()]
ServiceTypeIdPath = Annotated[UUID, Path()]
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=255)]

router = APIRouter(prefix="/api/v1", tags=["service"])


def request_service_for(request: Request, session: AsyncSession) -> ServiceRequestService:
    try:
        shop_address = json.loads(request.app.state.settings.shop_address_json)
    except (TypeError, ValueError) as exc:
        raise RuntimeError("SHOP_ADDRESS_JSON must contain valid JSON") from exc
    if not isinstance(shop_address, dict):
        raise RuntimeError("SHOP_ADDRESS_JSON must contain a JSON object")
    return ServiceRequestService(
        ServiceRepository(session),
        clock=request.app.state.clock,
        ids=request.app.state.id_generator,
        shop_address=cast(dict[str, Any], shop_address),
    )


def type_service_for(session: AsyncSession) -> ServiceTypeConfigService:
    return ServiceTypeConfigService(ServiceRepository(session))


def workflow_for(request: Request, session: AsyncSession) -> ServiceWorkflowService:
    payments = PaymentService(
        PaymentRepository(session),
        request.app.state.payment_provider,
        clock=request.app.state.clock,
    )
    return ServiceWorkflowService(
        ServiceRepository(session),
        clock=request.app.state.clock,
        payments=payments,
    )


@router.get("/machines/{machine_id}/service-options", response_model=ServiceIntakeOptionsRead)
async def get_service_intake_options(
    machine_id: MachineIdPath,
    actor: CustomerActorDep,
    request: Request,
    session: SessionDep,
) -> ServiceIntakeOptionsRead:
    service = request_service_for(request, session)
    settings = request.app.state.settings
    intake = await read_settings(session)
    return ServiceIntakeOptionsRead(
        version=intake.version,
        urgencies=intake.urgencies,
        preferred_windows=preferred_windows(intake, request.app.state.clock.now()),
        response_hours=intake.response_hours,
        service_types=await service.intake_types(actor.user_id, machine_id),
        shop_address=service.shop_address,
        max_media_files=settings.media_max_service_files,
        max_image_bytes=settings.media_max_image_bytes,
        max_video_bytes=settings.media_max_video_bytes,
    )


@router.post(
    "/machines/{machine_id}/service-requests",
    response_model=ServiceRequestRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_service_request(
    machine_id: MachineIdPath,
    data: ServiceRequestCreate,
    actor: CustomerActorDep,
    request: Request,
    session: SessionDep,
) -> ServiceRequestRead:
    service = request_service_for(request, session)
    service.intake_settings = await read_settings(session)
    created = await service.create(actor.user_id, machine_id, data)
    return service.view(created)


@router.get("/service-requests", response_model=list[ServiceRequestRead])
async def list_service_requests(
    actor: CustomerActorDep,
    request: Request,
    session: SessionDep,
) -> list[ServiceRequestRead]:
    return await request_service_for(request, session).list_for_customer(actor.user_id)


@router.get("/service-requests/{request_id}", response_model=ServiceRequestRead)
async def get_service_request(
    request_id: ServiceRequestIdPath,
    actor: CustomerActorDep,
    request: Request,
    session: SessionDep,
) -> ServiceRequestRead:
    return await request_service_for(request, session).get_for_customer(
        actor.user_id,
        request_id,
    )


@router.post("/service-requests/{request_id}/cancel", response_model=ServiceRequestRead)
async def cancel_service_request(
    request_id: ServiceRequestIdPath,
    actor: CustomerActorDep,
    request: Request,
    session: SessionDep,
) -> ServiceRequestRead:
    return await request_service_for(request, session).cancel(actor.user_id, request_id)


@router.post(
    "/service-requests/{request_id}/diagnostic-payment",
    response_model=ServicePaymentIntentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_diagnostic_payment(
    request_id: ServiceRequestIdPath,
    idempotency_key: IdempotencyKey,
    actor: CustomerActorDep,
    request: Request,
    session: SessionDep,
) -> ServicePaymentIntentRead:
    intent = await workflow_for(request, session).create_diagnostic_payment(
        request_id, actor.user_id, idempotency_key
    )
    return ServicePaymentIntentRead(
        payment_id=intent.payment_id,
        provider_payment_id=intent.provider_payment_id,
        client_secret=intent.client_secret,
        state=intent.state,
    )


@router.post(
    "/service-requests/{request_id}/quote-decision",
    response_model=ServiceRequestRead,
)
async def decide_service_quote(
    request_id: ServiceRequestIdPath,
    data: ServiceQuoteDecisionInput,
    actor: CustomerActorDep,
    request: Request,
    session: SessionDep,
) -> ServiceRequestRead:
    return await workflow_for(request, session).decide_quote(request_id, actor.user_id, data)


@router.post(
    "/service-requests/{request_id}/additional-payment",
    response_model=ServicePaymentIntentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_additional_payment(
    request_id: ServiceRequestIdPath,
    idempotency_key: IdempotencyKey,
    actor: CustomerActorDep,
    request: Request,
    session: SessionDep,
) -> ServicePaymentIntentRead:
    intent = await workflow_for(request, session).create_additional_payment(
        request_id, actor.user_id, idempotency_key
    )
    return ServicePaymentIntentRead(
        payment_id=intent.payment_id,
        provider_payment_id=intent.provider_payment_id,
        client_secret=intent.client_secret,
        state=intent.state,
    )


@router.get("/admin/service-types", response_model=list[ServiceTypeRead])
async def list_service_types(
    actor: AdminActorDep,
    session: SessionDep,
) -> list[ServiceTypeRead]:
    return await type_service_for(session).list_all()


@router.post(
    "/admin/service-types",
    response_model=ServiceTypeRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_service_type(
    data: ServiceTypeCreate,
    actor: AdminActorDep,
    session: SessionDep,
) -> ServiceTypeRead:
    return await type_service_for(session).create(data)


@router.patch("/admin/service-types/{service_type_id}", response_model=ServiceTypeRead)
async def update_service_type(
    service_type_id: ServiceTypeIdPath,
    data: ServiceTypeUpdate,
    actor: AdminActorDep,
    session: SessionDep,
) -> ServiceTypeRead:
    return await type_service_for(session).update(service_type_id, data)


@router.post(
    "/admin/service-requests/{request_id}/appointment",
    response_model=AppointmentConfirmationRead,
)
async def confirm_service_appointment(
    request_id: ServiceRequestIdPath,
    data: AppointmentConfirmation,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> AppointmentConfirmationRead:
    service_request, warnings = await SchedulingService(
        SchedulingRepository(session), clock=request.app.state.clock
    ).confirm(request_id, data, admin_id=actor.user_id)
    return AppointmentConfirmationRead(
        service_request=ServiceRequestService._read(service_request, ServiceActor.ADMIN),
        overlap_warnings=warnings,
    )


@router.post(
    "/admin/service-requests/{request_id}/quote",
    response_model=ServiceRequestRead,
)
async def create_service_quote(
    request_id: ServiceRequestIdPath,
    data: ServiceQuoteCreate,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> ServiceRequestRead:
    return await workflow_for(request, session).create_quote(request_id, actor.user_id, data)


@router.post(
    "/admin/service-requests/{request_id}/no-cost-repair",
    response_model=ServiceRequestRead,
)
async def start_no_cost_repair(
    request_id: ServiceRequestIdPath,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> ServiceRequestRead:
    return await workflow_for(request, session).start_no_cost_repair(request_id, actor.user_id)


@router.post(
    "/admin/service-requests/{request_id}/status",
    response_model=ServiceRequestRead,
)
async def update_admin_service_status(
    request_id: ServiceRequestIdPath,
    data: ServiceOperationalAction,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> ServiceRequestRead:
    return await workflow_for(request, session).admin_action(request_id, actor.user_id, data)


@router.get("/technician/jobs", response_model=list[ServiceRequestRead])
async def list_technician_jobs(
    actor: TechnicianActorDep,
    request: Request,
    session: SessionDep,
) -> list[ServiceRequestRead]:
    return await workflow_for(request, session).list_technician_jobs(actor.user_id)


@router.get("/technician/jobs/{request_id}", response_model=StaffServiceRequestRead)
async def get_technician_job(
    request_id: ServiceRequestIdPath,
    actor: TechnicianActorDep,
    request: Request,
    session: SessionDep,
) -> StaffServiceRequestRead:
    return await StaffService(session, clock=request.app.state.clock).detail(
        request_id, actor.user_id
    )


@router.post("/technician/jobs/{request_id}/status", response_model=ServiceRequestRead)
async def update_technician_job_status(
    request_id: ServiceRequestIdPath,
    data: ServiceOperationalAction,
    actor: TechnicianActorDep,
    request: Request,
    session: SessionDep,
) -> ServiceRequestRead:
    return await workflow_for(request, session).technician_action(request_id, actor.user_id, data)


@router.post(
    "/technician/jobs/{request_id}/notes",
    response_model=ServiceNoteRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_technician_job_note(
    request_id: ServiceRequestIdPath,
    data: TechnicianNoteCreate,
    actor: TechnicianActorDep,
    request: Request,
    session: SessionDep,
) -> ServiceNoteRead:
    note = await workflow_for(request, session).add_technician_note(request_id, actor.user_id, data)
    return ServiceNoteRead(
        id=note.id,
        author_id=note.author_id,
        visibility=note.visibility,
        body=note.body,
        created_at=note.created_at,
    )


@router.post(
    "/technician/jobs/{request_id}/media",
    response_model=ServiceMediaRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_technician_job_media(
    request_id: ServiceRequestIdPath,
    data: TechnicianMediaCreate,
    actor: TechnicianActorDep,
    request: Request,
    session: SessionDep,
) -> ServiceMediaRead:
    item = await workflow_for(request, session).add_technician_media(
        request_id, actor.user_id, data
    )
    return ServiceMediaRead(
        id=item.id,
        media_id=item.media_id,
        uploader_id=item.uploader_id,
        purpose=item.purpose,
        note_id=item.note_id,
        created_at=item.created_at,
    )


@router.get("/admin/service-intake-settings", response_model=IntakeSettings)
async def get_intake_settings(actor: AdminActorDep, session: SessionDep) -> IntakeSettings:
    return await read_settings(session)


@router.put("/admin/service-intake-settings", response_model=IntakeSettings)
async def put_intake_settings(
    data: IntakeSettings, actor: AdminActorDep, session: SessionDep
) -> IntakeSettings:
    return await update_settings(session, data)


@router.post(
    "/admin/service-requests/{request_id}/diagnostic-fee", response_model=ServiceRequestRead
)
async def set_diagnostic_fee(
    request_id: ServiceRequestIdPath,
    data: DiagnosticFeeInput,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> ServiceRequestRead:
    return await workflow_for(request, session).set_diagnostic_fee(request_id, actor.user_id, data)


@router.get("/admin/service-requests/{request_id}", response_model=StaffServiceRequestRead)
async def admin_service_detail(
    request_id: ServiceRequestIdPath,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> StaffServiceRequestRead:
    return await StaffService(session, clock=request.app.state.clock).detail(request_id)


@router.post(
    "/admin/service-requests/{request_id}/notes", response_model=ServiceNoteRead, status_code=201
)
async def admin_service_note(
    request_id: ServiceRequestIdPath,
    data: AdminNoteCreate,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> ServiceNoteRead:
    note = await StaffService(session, clock=request.app.state.clock).note(
        request_id, data, context_for(request, actor.user_id)
    )
    return ServiceNoteRead.model_validate(note, from_attributes=True)


@router.post("/admin/service-requests/{request_id}/cancel", response_model=StaffServiceRequestRead)
async def admin_service_cancel(
    request_id: ServiceRequestIdPath,
    data: ServiceCancelInput,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> StaffServiceRequestRead:
    return await StaffService(session, clock=request.app.state.clock).cancel(
        request_id, data, context_for(request, actor.user_id)
    )


@router.post(
    "/admin/service-requests/{request_id}/appointment-preview",
    response_model=list[ScheduleOverlapWarning],
)
async def preview_service_appointment(
    request_id: ServiceRequestIdPath,
    data: AppointmentConfirmation,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> list[ScheduleOverlapWarning]:
    return await SchedulingService(
        SchedulingRepository(session), clock=request.app.state.clock
    ).preview(request_id, data)


@router.post(
    "/admin/service-requests/{request_id}/assignment", response_model=StaffServiceRequestRead
)
async def change_service_assignment(
    request_id: ServiceRequestIdPath,
    data: AssignmentChange,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> StaffServiceRequestRead:
    item = await SchedulingService(
        SchedulingRepository(session), clock=request.app.state.clock
    ).assign(request_id, data, context_for(request, actor.user_id))
    return await StaffService(session, clock=request.app.state.clock).read(item, ServiceActor.ADMIN)
