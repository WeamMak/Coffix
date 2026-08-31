from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.auth.policies import CurrentActorDep
from coffix.core.database import get_session
from coffix.notifications.repository import NotificationRepository
from coffix.notifications.schemas import (
    DeviceTokenRead,
    DeviceTokenRegistration,
    NotificationRead,
    UnreadCountRead,
)
from coffix.notifications.service import NotificationService

SessionDep = Annotated[AsyncSession, Depends(get_session)]
NotificationIdPath = Annotated[UUID, Path()]
LimitQuery = Annotated[int, Query(ge=1, le=100)]
OffsetQuery = Annotated[int, Query(ge=0)]

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


def service_for(request: Request, session: AsyncSession) -> NotificationService:
    return NotificationService(NotificationRepository(session), clock=request.app.state.clock)


@router.get("", response_model=list[NotificationRead])
async def list_notifications(
    actor: CurrentActorDep,
    request: Request,
    session: SessionDep,
    limit: LimitQuery = 50,
    offset: OffsetQuery = 0,
) -> list[NotificationRead]:
    return await service_for(request, session).list_for_recipient(
        actor.user_id,
        limit=limit,
        offset=offset,
    )


@router.get("/unread-count", response_model=UnreadCountRead)
async def unread_count(
    actor: CurrentActorDep,
    request: Request,
    session: SessionDep,
) -> UnreadCountRead:
    return UnreadCountRead(
        unread_count=await service_for(request, session).unread_count(actor.user_id)
    )


@router.post(
    "/device-tokens",
    response_model=DeviceTokenRead,
    status_code=status.HTTP_201_CREATED,
)
async def register_device_token(
    data: DeviceTokenRegistration,
    actor: CurrentActorDep,
    request: Request,
    session: SessionDep,
) -> DeviceTokenRead:
    token = await service_for(request, session).register_device_token(actor.user_id, data)
    return DeviceTokenRead.model_validate(token)


@router.post("/{notification_id}/read", response_model=NotificationRead)
async def mark_notification_read(
    notification_id: NotificationIdPath,
    actor: CurrentActorDep,
    request: Request,
    session: SessionDep,
) -> NotificationRead:
    return await service_for(request, session).mark_read(actor.user_id, notification_id)
