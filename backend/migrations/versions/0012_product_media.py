"""Add ordered product media.

Revision ID: 0012_product_media
Revises: 0011_notifications_outbox_audit
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012_product_media"
down_revision: str | None = "0011_notifications_outbox_audit"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_product_skus_id_product_id",
        "product_skus",
        ["id", "product_id"],
    )
    op.create_table(
        "product_media",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sku_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("object_key", sa.String(length=512), nullable=False),
        sa.Column("media_type", sa.String(length=40), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("alt_text_he", sa.String(length=300), nullable=False),
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
            "sort_order >= 0",
            name="ck_product_media_non_negative_sort_order",
        ),
        sa.CheckConstraint(
            "media_type LIKE 'image/%'",
            name="ck_product_media_image_media_type",
        ),
        sa.CheckConstraint(
            "length(trim(alt_text_he)) > 0",
            name="ck_product_media_non_empty_alt_text",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name="fk_product_media_product_id_products",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["sku_id", "product_id"],
            ["product_skus.id", "product_skus.product_id"],
            name="fk_product_media_sku_owned_by_product",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_product_media"),
    )
    op.create_index(
        "ix_product_media_product_sort",
        "product_media",
        ["product_id", "sort_order", "id"],
    )
    op.create_index("ix_product_media_product_id", "product_media", ["product_id"])
    op.create_index("ix_product_media_sku_id", "product_media", ["sku_id"])


def downgrade() -> None:
    op.drop_index("ix_product_media_sku_id", table_name="product_media")
    op.drop_index("ix_product_media_product_id", table_name="product_media")
    op.drop_index("ix_product_media_product_sort", table_name="product_media")
    op.drop_table("product_media")
    op.drop_constraint(
        "uq_product_skus_id_product_id",
        "product_skus",
        type_="unique",
    )
