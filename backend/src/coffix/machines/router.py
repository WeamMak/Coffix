from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, status
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.auth.policies import CustomerActorDep
from coffix.catalog.repository import MachineModelRepository
from coffix.core.database import get_session
from coffix.machines.repository import MachineRepository
from coffix.machines.schemas import (
    MachineCreate,
    MachineModelSummary,
    MachineSerialUpdate,
    RegisteredMachineRead,
)
from coffix.machines.service import CustomerMachineService, MachineView
from coffix.media.repository import MediaRepository
from coffix.service.repository import ServiceRepository

SessionDep = Annotated[AsyncSession, Depends(get_session)]
MachineIdPath = Annotated[UUID, Path()]

router = APIRouter(prefix="/api/v1/machines", tags=["machines"])


def machine_service_for(session: AsyncSession) -> CustomerMachineService:
    return CustomerMachineService(
        MachineRepository(session),
        MediaRepository(session),
        ServiceRepository(session),
    )


def machine_read(view: MachineView) -> RegisteredMachineRead:
    machine = view.machine
    return RegisteredMachineRead(
        id=machine.id,
        customer_id=machine.customer_id,
        machine_model_id=machine.machine_model_id,
        serial_number=machine.serial_number,
        serial_pending=machine.serial_pending,
        source=machine.source,
        source_order_item_id=machine.source_order_item_id,
        source_unit_index=machine.source_unit_index,
        purchase_date=machine.purchase_date,
        warranty_start_date=machine.warranty_start_date,
        warranty_end_date=machine.warranty_end_date,
        warranty_months=machine.warranty_months,
        model=MachineModelSummary.model_validate(view.model),
        media_ids=list(view.media_ids),
        service_history=list(view.service_history),
        created_at=machine.created_at,
        updated_at=machine.updated_at,
    )


@router.get("", response_model=list[RegisteredMachineRead])
async def list_machines(
    actor: CustomerActorDep,
    session: SessionDep,
) -> list[RegisteredMachineRead]:
    views = await machine_service_for(session).list_owned(actor.user_id)
    return [machine_read(view) for view in views]


@router.post("", response_model=RegisteredMachineRead, status_code=status.HTTP_201_CREATED)
async def create_machine(
    data: MachineCreate,
    actor: CustomerActorDep,
    session: SessionDep,
) -> RegisteredMachineRead:
    view = await machine_service_for(session).create_manual(actor.user_id, data)
    return machine_read(view)


@router.get("/models", response_model=list[MachineModelSummary])
async def list_supported_models(
    actor: CustomerActorDep,
    session: SessionDep,
) -> list[MachineModelSummary]:
    models = await MachineModelRepository(session).list_models(active_only=True)
    return [MachineModelSummary.model_validate(model) for model in models]


@router.get("/{machine_id}", response_model=RegisteredMachineRead)
async def get_machine(
    machine_id: MachineIdPath,
    actor: CustomerActorDep,
    session: SessionDep,
) -> RegisteredMachineRead:
    view = await machine_service_for(session).get_owned(actor.user_id, machine_id)
    return machine_read(view)


@router.patch("/{machine_id}/serial", response_model=RegisteredMachineRead)
async def complete_machine_serial(
    machine_id: MachineIdPath,
    data: MachineSerialUpdate,
    actor: CustomerActorDep,
    session: SessionDep,
) -> RegisteredMachineRead:
    view = await machine_service_for(session).complete_serial(actor.user_id, machine_id, data)
    return machine_read(view)
