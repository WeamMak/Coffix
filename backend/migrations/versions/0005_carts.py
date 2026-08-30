"""Add server-owned carts and cart items.

Revision ID: 0005_carts
Revises: 0004_stock_reservations
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005_carts"
down_revision: str | None = "0004_stock_reservations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "carts",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()")),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="active", nullable=False),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "status IN ('active', 'expired', 'checked_out')",
            name="ck_carts_valid_status",
        ),
        sa.CheckConstraint("version >= 1", name="ck_carts_positive_version"),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["users.id"],
            name="fk_carts_customer_id_users",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_carts"),
    )
    op.create_index("ix_carts_customer_id", "carts", ["customer_id"])
    op.create_index(
        "uq_carts_active_customer",
        "carts",
        ["customer_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )
    op.create_index(
        "ix_carts_active_expiry",
        "carts",
        ["expires_at"],
        postgresql_where=sa.text("status = 'active'"),
    )

    op.create_table(
        "cart_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()")),
        sa.Column("cart_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sku_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("latest_displayed_price_agorot", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="ILS", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("quantity > 0", name="ck_cart_items_positive_quantity"),
        sa.CheckConstraint(
            "latest_displayed_price_agorot >= 0",
            name="ck_cart_items_non_negative_latest_displayed_price",
        ),
        sa.CheckConstraint("currency = 'ILS'", name="ck_cart_items_currency_is_ils"),
        sa.ForeignKeyConstraint(
            ["cart_id"],
            ["carts.id"],
            name="fk_cart_items_cart_id_carts",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["sku_id"],
            ["product_skus.id"],
            name="fk_cart_items_sku_id_product_skus",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_cart_items"),
        sa.UniqueConstraint("cart_id", "sku_id", name="uq_cart_items_cart_sku"),
    )
    op.create_index("ix_cart_items_cart_id", "cart_items", ["cart_id"])
    op.create_index("ix_cart_items_sku_id", "cart_items", ["sku_id"])

def downgrade() -> None:
    op.drop_index("ix_cart_items_sku_id", table_name="cart_items")
    op.drop_index("ix_cart_items_cart_id", table_name="cart_items")
    op.drop_table("cart_items")
    op.drop_index("ix_carts_active_expiry", table_name="carts")
    op.drop_index("uq_carts_active_customer", table_name="carts")
    op.drop_index("ix_carts_customer_id", table_name="carts")
    op.drop_table("carts")
