from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Protocol
from uuid import UUID

from coffix.core.clock import Clock
from coffix.core.settings import AppEnvironment, MediaStorageBackend, Settings


class MediaPurpose(StrEnum):
    MACHINE_REGISTRATION = "machine_registration"
    SERVICE_ISSUE = "service_issue"
    SERVICE_DIAGNOSIS = "service_diagnosis"
    SERVICE_REPAIR = "service_repair"

    @property
    def is_service_media(self) -> bool:
        return self.value.startswith("service_")


def object_key_for_upload(upload_id: UUID) -> str:
    opaque_id = upload_id.hex
    return f"media/{opaque_id[:2]}/{opaque_id}"


@dataclass(frozen=True, slots=True)
class UploadRequest:
    upload_id: UUID
    content_type: str
    size_bytes: int


@dataclass(frozen=True, slots=True)
class UploadTarget:
    url: str
    method: str
    headers: dict[str, str]
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class StoredMedia:
    object_key: str
    content_type: str
    size_bytes: int
    header: bytes


class MediaStore(Protocol):
    def object_key_for(self, upload_id: UUID) -> str: ...

    async def create_upload(self, request: UploadRequest) -> UploadTarget: ...

    async def complete_upload(self, upload_id: UUID) -> StoredMedia: ...

    async def create_download_url(self, object_key: str) -> str: ...

    async def delete_object(self, object_key: str) -> None: ...


async def create_media_store(settings: Settings, clock: Clock) -> MediaStore:
    from coffix.media.adapters.local import LocalMediaStore
    from coffix.media.adapters.s3 import S3MediaStore

    if settings.media_storage_backend is MediaStorageBackend.LOCAL:
        return LocalMediaStore(
            root=settings.media_local_root,
            api_public_url=settings.api_public_url,
            signing_secret=settings.jwt_private_key,
            clock=clock,
            ttl_seconds=settings.media_presign_ttl_seconds,
        )
    bucket = settings.media_s3_bucket
    if bucket is None:
        raise RuntimeError("S3 media storage is not configured")
    from boto3 import client as boto3_client

    store = S3MediaStore(
        client=boto3_client("s3"),
        bucket=bucket,
        prefix=settings.media_s3_prefix,
        clock=clock,
        ttl_seconds=settings.media_presign_ttl_seconds,
    )
    if settings.app_env is AppEnvironment.PROD:
        await store.validate_private_bucket()
    return store
