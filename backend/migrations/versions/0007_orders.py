"""Add product orders, snapshots, history, and shipments.

Revision ID: 0007_orders
Revises: 0006_payments_events
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_orders"
down_revision: str | None = "0006_payments_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


ORDER_STATES = (
    "'pending_payment', 'paid', 'processing', 'shipped', 'delivered', "
    "'payment_expired', 'cancelled', 'refunded'"
)


def upgrade() -> None:
    op.create_table(
        "orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()")),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_cart_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("payment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("order_number", sa.String(length=32), nullable=False),
        sa.Column("state", sa.String(length=20), server_default="pending_payment", nullable=False),
        sa.Column("subtotal_agorot", sa.Integer(), nullable=False),
        sa.Column("shipping_agorot", sa.Integer(), nullable=False),
        sa.Column("total_agorot", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="ILS", nullable=False),
        sa.Column("address_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("payment_deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("checkout_idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("checkout_fingerprint", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(f"state IN ({ORDER_STATES})", name="ck_orders_valid_state"),
        sa.CheckConstraint("subtotal_agorot >= 0", name="ck_orders_non_negative_subtotal"),
        sa.CheckConstraint("shipping_agorot >= 0", name="ck_orders_non_negative_shipping"),
        sa.CheckConstraint(
            "total_agorot = subtotal_agorot + shipping_agorot",
            name="ck_orders_valid_total",
        ),
        sa.CheckConstraint("currency = 'ILS'", name="ck_orders_currency_is_ils"),
        sa.ForeignKeyConstraint(
            ["customer_id"], ["users.id"], name="fk_orders_customer_id_users", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["source_cart_id"],
            ["carts.id"],
            name="fk_orders_source_cart_id_carts",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["payment_id"],
            ["payments.id"],
            name="fk_orders_payment_id_payments",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_orders"),
        sa.UniqueConstraint("source_cart_id", name="uq_orders_source_cart_id"),
        sa.UniqueConstraint("payment_id", name="uq_orders_payment_id"),
        sa.UniqueConstraint("order_number", name="uq_orders_order_number"),
        sa.UniqueConstraint(
            "customer_id",
            "checkout_idempotency_key",
            name="uq_orders_customer_checkout_idempotency",
        ),
    )
    op.create_index("ix_orders_customer_id", "orders", ["customer_id"])
    op.create_index("ix_orders_customer_created", "orders", ["customer_id", "created_at"])
    op.create_index("ix_orders_state_created", "orders", ["state", "created_at"])
    op.create_index("ix_orders_payment_deadline", "orders", ["payment_deadline"])

    op.create_table(
        "order_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()")),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sku_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_name_he", sa.String(length=160), nullable=False),
        sa.Column("sku_code", sa.String(length=80), nullable=False),
        sa.Column(
            "attributes",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("unit_price_agorot", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("line_total_agorot", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="ILS", nullable=False),
        sa.Column("machine_model_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("machine_manufacturer", sa.String(length=120), nullable=True),
        sa.Column("machine_model_name", sa.String(length=120), nullable=True),
        sa.Column("machine_warranty_months", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("quantity > 0", name="ck_order_items_positive_quantity"),
        sa.CheckConstraint("unit_price_agorot >= 0", name="ck_order_items_non_negative_unit_price"),
        sa.CheckConstraint(
            "line_total_agorot = unit_price_agorot * quantity",
            name="ck_order_items_valid_line_total",
        ),
        sa.CheckConstraint("currency = 'ILS'", name="ck_order_items_currency_is_ils"),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"], name="fk_order_items_order_id_orders", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["sku_id"],
            ["product_skus.id"],
            name="fk_order_items_sku_id_product_skus",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name="fk_order_items_product_id_products",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_order_items"),
        sa.UniqueConstraint("order_id", "sku_id", name="uq_order_items_order_sku"),
    )
    op.create_index("ix_order_items_order_id", "order_items", ["order_id"])
    op.create_index("ix_order_items_sku_id", "order_items", ["sku_id"])

    op.create_table(
        "order_status_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()")),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("from_state", sa.String(length=20), nullable=True),
        sa.Column("to_state", sa.String(length=20), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source", sa.String(length=30), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name="fk_order_status_history_order_id_orders",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name="fk_order_status_history_actor_id_users",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_order_status_history"),
    )
    op.create_index("ix_order_status_history_order_id", "order_status_history", ["order_id"])
    op.create_index("ix_order_status_history_actor_id", "order_status_history", ["actor_id"])

    op.create_table(
        "shipments",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()")),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("carrier", sa.String(length=120), nullable=False),
        sa.Column("tracking_number", sa.String(length=160), nullable=False),
        sa.Column("tracking_url", sa.String(length=2048), nullable=True),
        sa.Column("shipped_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"], name="fk_shipments_order_id_orders", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_shipments"),
        sa.UniqueConstraint("order_id", name="uq_shipments_order_id"),
    )

    op.create_unique_constraint("uq_refunds_payment_id", "refunds", ["payment_id"])


def downgrade() -> None:
    op.drop_constraint("uq_refunds_payment_id", "refunds", type_="unique")
    op.drop_table("shipments")
    op.drop_index("ix_order_status_history_actor_id", table_name="order_status_history")
    op.drop_index("ix_order_status_history_order_id", table_name="order_status_history")
    op.drop_table("order_status_history")
    op.drop_index("ix_order_items_sku_id", table_name="order_items")
    op.drop_index("ix_order_items_order_id", table_name="order_items")
    op.drop_table("order_items")
    op.drop_index("ix_orders_payment_deadline", table_name="orders")
    op.drop_index("ix_orders_state_created", table_name="orders")
    op.drop_index("ix_orders_customer_created", table_name="orders")
    op.drop_index("ix_orders_customer_id", table_name="orders")
    op.drop_table("orders")
