"""Add atomic stock reservations.

Revision ID: 0004_stock_reservations
Revises: 0003_catalog_and_machine_models
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_stock_reservations"
down_revision: str | None = "0003_catalog_and_machine_models"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "stock_reservations",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()")),
        sa.Column("sku_id", postgresql.UUID(as_uuid=True), nullable=False),
        # Cart and order foreign keys enter with their owning tables in later migrations.
        sa.Column("cart_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("state", sa.String(length=20), server_default="active", nullable=False),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("quantity > 0", name="ck_stock_reservations_positive_quantity"),
        sa.CheckConstraint(
            "(cart_id IS NOT NULL AND order_id IS NULL) OR "
            "(cart_id IS NULL AND order_id IS NOT NULL)",
            name="ck_stock_reservations_exactly_one_owner",
        ),
        sa.CheckConstraint(
            "state IN ('active', 'released', 'consumed')",
            name="ck_stock_reservations_valid_state",
        ),
        sa.ForeignKeyConstraint(
            ["sku_id"],
            ["product_skus.id"],
            name="fk_stock_reservations_sku_id_product_skus",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_stock_reservations"),
    )
    op.create_index("ix_stock_reservations_sku_id", "stock_reservations", ["sku_id"])
    op.create_index(
        "uq_stock_reservations_active_cart_sku",
        "stock_reservations",
        ["cart_id", "sku_id"],
        unique=True,
        postgresql_where=sa.text("state = 'active' AND cart_id IS NOT NULL"),
    )
    op.create_index(
        "uq_stock_reservations_active_order_sku",
        "stock_reservations",
        ["order_id", "sku_id"],
        unique=True,
        postgresql_where=sa.text("state = 'active' AND order_id IS NOT NULL"),
    )
    op.create_index(
        "ix_stock_reservations_active_sku_expiry",
        "stock_reservations",
        ["sku_id", "expires_at"],
        postgresql_where=sa.text("state = 'active'"),
    )
    op.create_index(
        "ix_stock_reservations_active_cart",
        "stock_reservations",
        ["cart_id"],
        postgresql_where=sa.text("state = 'active' AND cart_id IS NOT NULL"),
    )
    op.create_index(
        "ix_stock_reservations_active_order",
        "stock_reservations",
        ["order_id"],
        postgresql_where=sa.text("state = 'active' AND order_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_stock_reservations_active_order", table_name="stock_reservations")
    op.drop_index("ix_stock_reservations_active_cart", table_name="stock_reservations")
    op.drop_index("ix_stock_reservations_active_sku_expiry", table_name="stock_reservations")
    op.drop_index("uq_stock_reservations_active_order_sku", table_name="stock_reservations")
    op.drop_index("uq_stock_reservations_active_cart_sku", table_name="stock_reservations")
    op.drop_index("ix_stock_reservations_sku_id", table_name="stock_reservations")
    op.drop_table("stock_reservations")
