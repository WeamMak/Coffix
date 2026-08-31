import json
from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.auth.policies import AdminActorDep, CustomerActorDep
from coffix.core.database import get_session
from coffix.service.repository import ServiceRepository
from coffix.service.schemas import (
    ServiceRequestCreate,
    ServiceRequestRead,
    ServiceTypeCreate,
    ServiceTypeRead,
    ServiceTypeUpdate,
)
from coffix.service.service import ServiceRequestService, ServiceTypeConfigService

SessionDep = Annotated[AsyncSession, Depends(get_session)]
MachineIdPath = Annotated[UUID, Path()]
ServiceRequestIdPath = Annotated[UUID, Path()]
ServiceTypeIdPath = Annotated[UUID, Path()]

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
