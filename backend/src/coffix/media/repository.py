from datetime import datetime
from uuid import UUID

from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from coffix.media.models import MediaObject, MediaUpload, MediaUploadState
from coffix.media.store import MediaPurpose


class MediaRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def lock_collection(self, owner_id: UUID, collection_id: UUID) -> None:
        await self.session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:lock_key, 0))"),
            {"lock_key": f"media:{owner_id}:{collection_id}"},
        )

    async def count_active_service_uploads(
        self,
        *,
        owner_id: UUID,
        collection_id: UUID,
        now: datetime,
    ) -> int:
        count = await self.session.scalar(
            select(func.count(MediaUpload.id)).where(
                MediaUpload.owner_id == owner_id,
                MediaUpload.collection_id == collection_id,
                MediaUpload.purpose.in_(
                    (
                        MediaPurpose.SERVICE_ISSUE,
                        MediaPurpose.SERVICE_DIAGNOSIS,
                        MediaPurpose.SERVICE_REPAIR,
                    )
                ),
                MediaUpload.state.in_(
                    (MediaUploadState.PENDING, MediaUploadState.COMPLETED)
                ),
                or_(
                    MediaUpload.state == MediaUploadState.COMPLETED,
                    MediaUpload.expires_at > now,
                ),
            )
        )
        return int(count or 0)

    async def create_upload(
        self,
        *,
        upload_id: UUID,
        owner_id: UUID,
        purpose: MediaPurpose,
        collection_id: UUID | None,
        object_key: str,
        content_type: str,
        size_bytes: int,
        expires_at: datetime,
    ) -> MediaUpload:
        upload = MediaUpload(
            id=upload_id,
            owner_id=owner_id,
            purpose=purpose,
            collection_id=collection_id,
            object_key=object_key,
            declared_content_type=content_type,
            declared_size_bytes=size_bytes,
            expires_at=expires_at,
        )
        self.session.add(upload)
        await self.session.flush()
        return upload

    async def get_upload(self, upload_id: UUID) -> MediaUpload | None:
        return await self.session.get(MediaUpload, upload_id)

    async def get_upload_for_update(self, upload_id: UUID) -> MediaUpload | None:
        return await self.session.scalar(
            select(MediaUpload).where(MediaUpload.id == upload_id).with_for_update()
        )

    async def create_media(
        self,
        *,
        media_id: UUID,
        upload: MediaUpload,
        content_type: str,
        size_bytes: int,
        completed_at: datetime,
    ) -> MediaObject:
        media = MediaObject(
            id=media_id,
            upload_id=upload.id,
            owner_id=upload.owner_id,
            purpose=upload.purpose,
            collection_id=upload.collection_id,
            object_key=upload.object_key,
            content_type=content_type,
            size_bytes=size_bytes,
            created_at=completed_at,
            updated_at=completed_at,
        )
        upload.state = MediaUploadState.COMPLETED
        upload.completed_at = completed_at
        self.session.add(media)
        await self.session.flush()
        return media

    async def get_media(self, media_id: UUID) -> MediaObject | None:
        return await self.session.get(MediaObject, media_id)

    async def get_registration_media_for_update(
        self,
        media_id: UUID,
    ) -> MediaObject | None:
        return await self.session.scalar(
            select(MediaObject).where(MediaObject.id == media_id).with_for_update()
        )

    async def attach_to_collection(
        self,
        media: MediaObject,
        collection_id: UUID,
    ) -> None:
        media.collection_id = collection_id
        await self.session.flush()

    async def list_machine_registration_media(
        self,
        *,
        owner_id: UUID,
        collection_ids: list[UUID],
    ) -> dict[UUID, list[UUID]]:
        if not collection_ids:
            return {}
        media = await self.session.scalars(
            select(MediaObject)
            .where(
                MediaObject.owner_id == owner_id,
                MediaObject.purpose == MediaPurpose.MACHINE_REGISTRATION,
                MediaObject.collection_id.in_(collection_ids),
            )
            .order_by(MediaObject.created_at, MediaObject.id)
        )
        by_collection: dict[UUID, list[UUID]] = {}
        for item in media:
            if item.collection_id is not None:
                by_collection.setdefault(item.collection_id, []).append(item.id)
        return by_collection

    async def get_media_for_upload(self, upload_id: UUID) -> MediaObject | None:
        return await self.session.scalar(
            select(MediaObject).where(MediaObject.upload_id == upload_id)
        )

    async def lock_expired_uploads(
        self,
        *,
        now: datetime,
        batch_size: int,
    ) -> list[MediaUpload]:
        result = await self.session.scalars(
            select(MediaUpload)
            .where(
                MediaUpload.state == MediaUploadState.PENDING,
                MediaUpload.expires_at <= now,
            )
            .order_by(MediaUpload.expires_at, MediaUpload.id)
            .limit(batch_size)
            .with_for_update(skip_locked=True)
        )
        return list(result)

    async def mark_abandoned(self, upload: MediaUpload) -> None:
        upload.state = MediaUploadState.ABANDONED
        await self.session.flush()
