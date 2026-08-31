from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.api.errors import ApiError
from coffix.auth.policies import CurrentActorDep
from coffix.core.database import get_session
from coffix.media.adapters.local import LocalMediaStore
from coffix.media.repository import MediaRepository
from coffix.media.schemas import (
    MediaDownload,
    MediaRead,
    MediaUploadCreate,
    MediaUploadCreated,
)
from coffix.media.service import MediaPolicy, MediaService
from coffix.media.store import MediaStore

router = APIRouter(prefix="/api/v1/media", tags=["media"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
ContentTypeHeader = Annotated[str, Header(alias="Content-Type")]


def service_for(request: Request, session: AsyncSession) -> MediaService:
    settings = request.app.state.settings
    return MediaService(
        MediaRepository(session),
        request.app.state.media_store,
        MediaPolicy(
            max_image_bytes=settings.media_max_image_bytes,
            max_video_bytes=settings.media_max_video_bytes,
            max_service_files=settings.media_max_service_files,
        ),
        clock=request.app.state.clock,
        ids=request.app.state.id_generator,
        upload_ttl_seconds=settings.media_presign_ttl_seconds,
    )


@router.post("/uploads", status_code=status.HTTP_201_CREATED)
async def create_upload(
    data: MediaUploadCreate,
    request: Request,
    actor: CurrentActorDep,
    session: SessionDep,
) -> MediaUploadCreated:
    upload_id, target = await service_for(request, session).create_upload(
        owner_id=actor.user_id,
        purpose=data.purpose,
        collection_id=data.collection_id,
        content_type=data.content_type,
        size_bytes=data.size_bytes,
    )
    return MediaUploadCreated(
        upload_id=upload_id,
        upload_url=target.url,
        method=target.method,
        headers=target.headers,
        expires_at=target.expires_at,
    )


@router.put("/uploads/{upload_id}/content", status_code=status.HTTP_204_NO_CONTENT)
async def put_local_upload_content(
    upload_id: UUID,
    request: Request,
    content_type: ContentTypeHeader,
    actor: CurrentActorDep,
    session: SessionDep,
) -> Response:
    service = service_for(request, session)
    expected_size = await service.authorize_local_content(
        upload_id=upload_id,
        owner_id=actor.user_id,
        content_type=content_type,
    )
    content = bytearray()
    async for chunk in request.stream():
        if len(content) + len(chunk) > expected_size:
            raise ApiError(
                status=422,
                code="MEDIA_SIZE_MISMATCH",
                title="Upload size does not match authorization",
            )
        content.extend(chunk)
    await service.put_local_content(
        upload_id=upload_id,
        owner_id=actor.user_id,
        content=bytes(content),
        content_type=content_type,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/uploads/{upload_id}/complete", status_code=status.HTTP_201_CREATED)
async def complete_upload(
    upload_id: UUID,
    request: Request,
    actor: CurrentActorDep,
    session: SessionDep,
) -> MediaRead:
    media = await service_for(request, session).complete_upload(
        upload_id=upload_id,
        owner_id=actor.user_id,
    )
    return MediaRead.model_validate(media)


@router.get("/{media_id}/download")
async def create_download(
    media_id: UUID,
    request: Request,
    actor: CurrentActorDep,
    session: SessionDep,
) -> MediaDownload:
    url = await service_for(request, session).create_download_url(
        media_id=media_id,
        actor_id=actor.user_id,
        actor_role=actor.role,
    )
    return MediaDownload(url=url)


@router.get("/local/content", include_in_schema=False)
async def local_download(
    request: Request,
    key: Annotated[str, Query(min_length=1, max_length=512)],
    expires: Annotated[int, Query(gt=0)],
    signature: Annotated[str, Query(min_length=64, max_length=64)],
) -> Response:
    store: MediaStore = request.app.state.media_store
    if not isinstance(store, LocalMediaStore):
        return Response(status_code=status.HTTP_404_NOT_FOUND)
    try:
        path, content_type = await store.open_download(
            object_key=key,
            expires=expires,
            signature=signature,
        )
    except ValueError:
        return Response(status_code=status.HTTP_404_NOT_FOUND)
    return FileResponse(path, media_type=content_type)
