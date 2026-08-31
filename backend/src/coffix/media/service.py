import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta
from typing import Never, Protocol, cast
from uuid import UUID

from coffix.api.errors import ApiError
from coffix.core.clock import Clock
from coffix.core.database import SessionFactory
from coffix.core.ids import IdGenerator
from coffix.media.models import MediaObject, MediaUpload, MediaUploadState
from coffix.media.repository import MediaRepository
from coffix.media.store import MediaPurpose, MediaStore, UploadRequest, UploadTarget
from coffix.users.models import Role

ALLOWED_CONTENT_TYPES = {
    "image/heic",
    "image/jpeg",
    "image/png",
    "video/mp4",
}
HEIC_BRANDS = {b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1"}


class MediaPolicyError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class MediaPolicy:
    max_image_bytes: int
    max_video_bytes: int
    max_service_files: int

    def validate_upload(
        self,
        *,
        purpose: MediaPurpose,
        content_type: str,
        size_bytes: int,
        existing_service_files: int,
    ) -> None:
        if content_type not in ALLOWED_CONTENT_TYPES:
            raise MediaPolicyError("MEDIA_TYPE_NOT_ALLOWED", "unsupported media type")
        if content_type.startswith("image/"):
            maximum = self.max_image_bytes
        else:
            maximum = self.max_video_bytes
        if size_bytes <= 0:
            raise MediaPolicyError("MEDIA_SIZE_INVALID", "media size must be positive")
        if size_bytes > maximum:
            raise MediaPolicyError("MEDIA_TOO_LARGE", "media size exceeds the allowed limit")
        if purpose.is_service_media and existing_service_files >= self.max_service_files:
            raise MediaPolicyError("MEDIA_FILE_LIMIT_REACHED", "service media limit reached")

    def validate_signature(self, *, content_type: str, header: bytes) -> None:
        if content_type == "image/jpeg":
            matches = header.startswith(b"\xff\xd8\xff")
        elif content_type == "image/png":
            matches = header.startswith(b"\x89PNG\r\n\x1a\n")
        elif content_type == "image/heic":
            matches = len(header) >= 12 and header[4:8] == b"ftyp" and header[8:12] in HEIC_BRANDS
        elif content_type == "video/mp4":
            matches = (
                len(header) >= 12
                and header[4:8] == b"ftyp"
                and header[8:12] not in HEIC_BRANDS
            )
        else:
            matches = False
        if not matches:
            raise MediaPolicyError(
                "MEDIA_SIGNATURE_MISMATCH",
                "stored media does not match the declared type",
            )


class LocalUploadWriter(Protocol):
    async def put_upload(
        self,
        upload_id: UUID,
        *,
        content: bytes,
        content_type: str,
    ) -> None: ...


class MediaService:
    def __init__(
        self,
        repository: MediaRepository,
        store: MediaStore,
        policy: MediaPolicy,
        *,
        clock: Clock,
        ids: IdGenerator,
        upload_ttl_seconds: int,
    ) -> None:
        self.repository = repository
        self.store = store
        self.policy = policy
        self.clock = clock
        self.ids = ids
        self.upload_ttl_seconds = upload_ttl_seconds

    async def create_upload(
        self,
        *,
        owner_id: UUID,
        purpose: MediaPurpose,
        collection_id: UUID | None,
        content_type: str,
        size_bytes: int,
    ) -> tuple[UUID, UploadTarget]:
        now = self.clock.now()
        existing_service_files = 0
        if purpose.is_service_media:
            if collection_id is None:
                raise ApiError(
                    status=422,
                    code="MEDIA_COLLECTION_REQUIRED",
                    title="Service media requires a collection",
                )
            await self.repository.lock_collection(owner_id, collection_id)
            existing_service_files = await self.repository.count_active_service_uploads(
                owner_id=owner_id,
                collection_id=collection_id,
                now=now,
            )
        self._validate_upload(
            purpose=purpose,
            content_type=content_type,
            size_bytes=size_bytes,
            existing_service_files=existing_service_files,
        )
        upload_id = self.ids.new()
        request = UploadRequest(
            upload_id=upload_id,
            content_type=content_type,
            size_bytes=size_bytes,
        )
        target = await self.store.create_upload(request)
        await self.repository.create_upload(
            upload_id=upload_id,
            owner_id=owner_id,
            purpose=purpose,
            collection_id=collection_id,
            object_key=self.store.object_key_for(upload_id),
            content_type=content_type,
            size_bytes=size_bytes,
            expires_at=now + timedelta(seconds=self.upload_ttl_seconds),
        )
        return upload_id, target

    async def put_local_content(
        self,
        *,
        upload_id: UUID,
        owner_id: UUID,
        content: bytes,
        content_type: str,
    ) -> None:
        expected_size = await self.authorize_local_content(
            upload_id=upload_id,
            owner_id=owner_id,
            content_type=content_type,
        )
        if len(content) != expected_size:
            raise ApiError(
                status=422,
                code="MEDIA_SIZE_MISMATCH",
                title="Upload size does not match authorization",
            )
        writer = cast(LocalUploadWriter, self.store)
        if not hasattr(writer, "put_upload"):
            raise ApiError(
                status=404,
                code="NOT_FOUND",
                title="Resource not found",
            )
        await writer.put_upload(
            upload_id,
            content=content,
            content_type=content_type,
        )

    async def authorize_local_content(
        self,
        *,
        upload_id: UUID,
        owner_id: UUID,
        content_type: str,
    ) -> int:
        upload = await self._owned_pending_upload(upload_id, owner_id)
        if content_type != upload.declared_content_type:
            raise ApiError(
                status=422,
                code="MEDIA_TYPE_MISMATCH",
                title="Upload content type does not match authorization",
            )
        return upload.declared_size_bytes

    async def complete_upload(self, *, upload_id: UUID, owner_id: UUID) -> MediaObject:
        upload = await self.repository.get_upload_for_update(upload_id)
        if upload is None or upload.owner_id != owner_id:
            self._not_found()
        if upload.state is MediaUploadState.COMPLETED:
            media = await self.repository.get_media_for_upload(upload.id)
            if media is None:
                raise RuntimeError("completed media upload has no stored media record")
            return media
        if upload.state is not MediaUploadState.PENDING:
            raise ApiError(
                status=410,
                code="MEDIA_UPLOAD_EXPIRED",
                title="Media upload is no longer active",
            )
        if self.clock.now() >= upload.expires_at:
            raise ApiError(
                status=410,
                code="MEDIA_UPLOAD_EXPIRED",
                title="Media upload has expired",
            )
        try:
            stored = await self.store.complete_upload(upload.id)
        except ValueError as exc:
            raise ApiError(
                status=409,
                code="MEDIA_UPLOAD_INCOMPLETE",
                title="Media upload is incomplete",
            ) from exc
        if (
            stored.object_key != upload.object_key
            or stored.content_type != upload.declared_content_type
            or stored.size_bytes != upload.declared_size_bytes
        ):
            await self.store.delete_object(upload.object_key)
            raise ApiError(
                status=422,
                code="MEDIA_UPLOAD_MISMATCH",
                title="Stored media does not match its authorization",
            )
        try:
            self.policy.validate_signature(
                content_type=stored.content_type,
                header=stored.header,
            )
        except MediaPolicyError as exc:
            await self.store.delete_object(upload.object_key)
            raise ApiError(status=422, code=exc.code, title=str(exc)) from exc
        return await self.repository.create_media(
            media_id=self.ids.new(),
            upload=upload,
            content_type=stored.content_type,
            size_bytes=stored.size_bytes,
            completed_at=self.clock.now(),
        )

    async def create_download_url(
        self,
        *,
        media_id: UUID,
        actor_id: UUID,
        actor_role: Role,
    ) -> str:
        media = await self.repository.get_media(media_id)
        if media is None or (media.owner_id != actor_id and actor_role is not Role.ADMIN):
            self._not_found()
        return await self.store.create_download_url(media.object_key)

    async def _owned_pending_upload(self, upload_id: UUID, owner_id: UUID) -> MediaUpload:
        upload = await self.repository.get_upload(upload_id)
        if upload is None or upload.owner_id != owner_id:
            self._not_found()
        if upload.state is not MediaUploadState.PENDING or self.clock.now() >= upload.expires_at:
            raise ApiError(
                status=410,
                code="MEDIA_UPLOAD_EXPIRED",
                title="Media upload is no longer active",
            )
        return upload

    def _validate_upload(
        self,
        *,
        purpose: MediaPurpose,
        content_type: str,
        size_bytes: int,
        existing_service_files: int,
    ) -> None:
        try:
            self.policy.validate_upload(
                purpose=purpose,
                content_type=content_type,
                size_bytes=size_bytes,
                existing_service_files=existing_service_files,
            )
        except MediaPolicyError as exc:
            status = 409 if exc.code == "MEDIA_FILE_LIMIT_REACHED" else 422
            raise ApiError(status=status, code=exc.code, title=str(exc)) from exc

    @staticmethod
    def _not_found() -> Never:
        raise ApiError(status=404, code="NOT_FOUND", title="Resource not found")


class MediaCleanupService:
    def __init__(
        self,
        repository: MediaRepository,
        store: MediaStore,
        *,
        clock: Clock,
    ) -> None:
        self.repository = repository
        self.store = store
        self.clock = clock

    async def cleanup_abandoned(self, *, batch_size: int) -> int:
        if batch_size <= 0:
            raise ValueError("batch_size must be positive")
        expired = await self.repository.lock_expired_uploads(
            now=self.clock.now(),
            batch_size=batch_size,
        )
        for upload in expired:
            await self.store.delete_object(upload.object_key)
            await self.repository.mark_abandoned(upload)
        return len(expired)


async def run_media_cleanup_pass(
    session_factory: SessionFactory,
    *,
    store: MediaStore,
    clock: Clock,
    batch_size: int,
) -> int:
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")
    async with session_factory() as session, session.begin():
        service = MediaCleanupService(
            MediaRepository(session),
            store,
            clock=clock,
        )
        return await service.cleanup_abandoned(batch_size=batch_size)


async def run_media_cleanup_loop(
    session_factory: SessionFactory,
    *,
    store: MediaStore,
    clock: Clock,
    stop_event: asyncio.Event,
    interval_seconds: float = 30,
    batch_size: int = 100,
    on_pass: Callable[[int], None] | None = None,
) -> None:
    if interval_seconds <= 0:
        raise ValueError("interval_seconds must be positive")
    while not stop_event.is_set():
        cleaned = await run_media_cleanup_pass(
            session_factory,
            store=store,
            clock=clock,
            batch_size=batch_size,
        )
        if on_pass is not None:
            on_pass(cleaned)
        if stop_event.is_set():
            return
        if cleaned == batch_size:
            continue
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except TimeoutError:
            pass
