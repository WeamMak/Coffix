from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from coffix.media.store import MediaPurpose


class MediaUploadCreate(BaseModel):
    purpose: MediaPurpose
    collection_id: UUID | None = None
    content_type: str
    size_bytes: int


class MediaUploadCreated(BaseModel):
    upload_id: UUID
    upload_url: str
    method: str
    headers: dict[str, str]
    expires_at: datetime


class MediaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_id: UUID
    purpose: MediaPurpose
    collection_id: UUID | None
    content_type: str
    size_bytes: int
    created_at: datetime


class MediaDownload(BaseModel):
    url: str
