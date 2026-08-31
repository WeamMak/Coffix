from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.orm import Mapped, mapped_column

from coffix.core.database import Base
from coffix.media.store import MediaPurpose


class MediaUploadState(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"
    ABANDONED = "abandoned"


media_upload_state_type = SqlEnum(
    MediaUploadState,
    name="media_upload_state",
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda states: [state.value for state in states],
)
media_purpose_type = SqlEnum(
    MediaPurpose,
    name="media_purpose",
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda purposes: [purpose.value for purpose in purposes],
)


class MediaUpload(Base):
    __tablename__ = "media_uploads"
    __table_args__ = (
        CheckConstraint("declared_size_bytes > 0", name="positive_declared_size"),
        CheckConstraint(
            "state IN ('pending', 'completed', 'abandoned')",
            name="valid_state",
        ),
        CheckConstraint(
            "purpose NOT LIKE 'service_%' OR collection_id IS NOT NULL",
            name="service_collection_present",
        ),
        Index("ix_media_uploads_owner_state", "owner_id", "state"),
        Index("ix_media_uploads_pending_expiry", "state", "expires_at"),
        Index(
            "ix_media_uploads_service_collection",
            "owner_id",
            "collection_id",
            "purpose",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    purpose: Mapped[MediaPurpose] = mapped_column(media_purpose_type)
    collection_id: Mapped[UUID | None] = mapped_column(index=True)
    object_key: Mapped[str] = mapped_column(String(512), unique=True)
    declared_content_type: Mapped[str] = mapped_column(String(80))
    declared_size_bytes: Mapped[int] = mapped_column(Integer)
    state: Mapped[MediaUploadState] = mapped_column(
        media_upload_state_type,
        default=MediaUploadState.PENDING,
        server_default=MediaUploadState.PENDING.value,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class MediaObject(Base):
    __tablename__ = "media_objects"
    __table_args__ = (
        CheckConstraint("size_bytes > 0", name="positive_size"),
        Index("ix_media_objects_owner_created", "owner_id", "created_at"),
        Index("ix_media_objects_service_collection", "collection_id", "purpose"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    upload_id: Mapped[UUID] = mapped_column(
        ForeignKey("media_uploads.id", ondelete="RESTRICT"), unique=True
    )
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    purpose: Mapped[MediaPurpose] = mapped_column(media_purpose_type)
    collection_id: Mapped[UUID | None] = mapped_column(index=True)
    object_key: Mapped[str] = mapped_column(String(512), unique=True)
    content_type: Mapped[str] = mapped_column(String(80))
    size_bytes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
