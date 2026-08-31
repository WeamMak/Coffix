"""Add private media upload lifecycle and stored objects.

Revision ID: 0009_media
Revises: 0008_registered_machines
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009_media"
down_revision: str | None = "0008_registered_machines"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "media_uploads",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("purpose", sa.String(length=40), nullable=False),
        sa.Column("collection_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("object_key", sa.String(length=512), nullable=False),
        sa.Column("declared_content_type", sa.String(length=80), nullable=False),
        sa.Column("declared_size_bytes", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "declared_size_bytes > 0",
            name="ck_media_uploads_positive_declared_size",
        ),
        sa.CheckConstraint(
            "state IN ('pending', 'completed', 'abandoned')",
            name="ck_media_uploads_valid_state",
        ),
        sa.CheckConstraint(
            "purpose NOT LIKE 'service_%' OR collection_id IS NOT NULL",
            name="ck_media_uploads_service_collection_present",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name="fk_media_uploads_owner_id_users",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_media_uploads"),
        sa.UniqueConstraint("object_key", name="uq_media_uploads_object_key"),
    )
    op.create_index("ix_media_uploads_owner_id", "media_uploads", ["owner_id"])
    op.create_index("ix_media_uploads_collection_id", "media_uploads", ["collection_id"])
    op.create_index(
        "ix_media_uploads_owner_state", "media_uploads", ["owner_id", "state"]
    )
    op.create_index(
        "ix_media_uploads_pending_expiry", "media_uploads", ["state", "expires_at"]
    )
    op.create_index(
        "ix_media_uploads_service_collection",
        "media_uploads",
        ["owner_id", "collection_id", "purpose"],
    )

    op.create_table(
        "media_objects",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("upload_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("purpose", sa.String(length=40), nullable=False),
        sa.Column("collection_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("object_key", sa.String(length=512), nullable=False),
        sa.Column("content_type", sa.String(length=80), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("size_bytes > 0", name="ck_media_objects_positive_size"),
        sa.ForeignKeyConstraint(
            ["upload_id"],
            ["media_uploads.id"],
            name="fk_media_objects_upload_id_media_uploads",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name="fk_media_objects_owner_id_users",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_media_objects"),
        sa.UniqueConstraint("upload_id", name="uq_media_objects_upload_id"),
        sa.UniqueConstraint("object_key", name="uq_media_objects_object_key"),
    )
    op.create_index("ix_media_objects_owner_id", "media_objects", ["owner_id"])
    op.create_index("ix_media_objects_collection_id", "media_objects", ["collection_id"])
    op.create_index(
        "ix_media_objects_owner_created", "media_objects", ["owner_id", "created_at"]
    )
    op.create_index(
        "ix_media_objects_service_collection",
        "media_objects",
        ["collection_id", "purpose"],
    )


def downgrade() -> None:
    op.drop_index("ix_media_objects_service_collection", table_name="media_objects")
    op.drop_index("ix_media_objects_owner_created", table_name="media_objects")
    op.drop_index("ix_media_objects_collection_id", table_name="media_objects")
    op.drop_index("ix_media_objects_owner_id", table_name="media_objects")
    op.drop_table("media_objects")
    op.drop_index("ix_media_uploads_service_collection", table_name="media_uploads")
    op.drop_index("ix_media_uploads_pending_expiry", table_name="media_uploads")
    op.drop_index("ix_media_uploads_owner_state", table_name="media_uploads")
    op.drop_index("ix_media_uploads_collection_id", table_name="media_uploads")
    op.drop_index("ix_media_uploads_owner_id", table_name="media_uploads")
    op.drop_table("media_uploads")
