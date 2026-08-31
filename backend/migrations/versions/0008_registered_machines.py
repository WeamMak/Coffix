"""Add registered machines and purchased warranty snapshots.

Revision ID: 0008_registered_machines
Revises: 0007_orders
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_registered_machines"
down_revision: str | None = "0007_orders"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "registered_machines",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("machine_model_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("serial_number", sa.String(length=160), nullable=True),
        sa.Column("serial_pending", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("source_order_item_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_unit_index", sa.Integer(), nullable=True),
        sa.Column("purchase_date", sa.Date(), nullable=True),
        sa.Column("warranty_start_date", sa.Date(), nullable=True),
        sa.Column("warranty_end_date", sa.Date(), nullable=True),
        sa.Column("warranty_months", sa.Integer(), nullable=True),
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
            "source IN ('manual', 'order')",
            name="ck_registered_machines_valid_source",
        ),
        sa.CheckConstraint(
            "serial_pending OR serial_number IS NOT NULL",
            name="ck_registered_machines_serial_present_or_pending",
        ),
        sa.CheckConstraint(
            "source_unit_index IS NULL OR source_unit_index > 0",
            name="ck_registered_machines_positive_source_unit_index",
        ),
        sa.CheckConstraint(
            "warranty_months IS NULL OR warranty_months >= 0",
            name="ck_registered_machines_non_negative_warranty_months",
        ),
        sa.CheckConstraint(
            "warranty_start_date IS NULL OR warranty_end_date >= warranty_start_date",
            name="ck_registered_machines_valid_warranty_period",
        ),
        sa.CheckConstraint(
            "(source = 'order' AND source_order_item_id IS NOT NULL "
            "AND source_unit_index IS NOT NULL AND purchase_date IS NOT NULL "
            "AND warranty_start_date IS NOT NULL AND warranty_end_date IS NOT NULL "
            "AND warranty_months IS NOT NULL) OR "
            "(source = 'manual' AND source_order_item_id IS NULL "
            "AND source_unit_index IS NULL AND warranty_start_date IS NULL "
            "AND warranty_end_date IS NULL AND warranty_months IS NULL)",
            name="ck_registered_machines_source_fields_consistent",
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["users.id"],
            name="fk_registered_machines_customer_id_users",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["machine_model_id"],
            ["machine_models.id"],
            name="fk_registered_machines_machine_model_id_machine_models",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["source_order_item_id"],
            ["order_items.id"],
            name="fk_registered_machines_source_order_item_id_order_items",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_registered_machines"),
        sa.UniqueConstraint(
            "machine_model_id",
            "serial_number",
            name="uq_registered_machines_model_serial",
        ),
        sa.UniqueConstraint(
            "source_order_item_id",
            "source_unit_index",
            name="uq_registered_machines_source_order_item_unit",
        ),
    )
    op.create_index(
        "ix_registered_machines_customer_id",
        "registered_machines",
        ["customer_id"],
    )
    op.create_index(
        "ix_registered_machines_machine_model_id",
        "registered_machines",
        ["machine_model_id"],
    )
    op.create_index(
        "ix_registered_machines_source_order_item_id",
        "registered_machines",
        ["source_order_item_id"],
    )
    op.create_index(
        "ix_registered_machines_customer_created",
        "registered_machines",
        ["customer_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_registered_machines_customer_created",
        table_name="registered_machines",
    )
    op.drop_index(
        "ix_registered_machines_source_order_item_id",
        table_name="registered_machines",
    )
    op.drop_index(
        "ix_registered_machines_machine_model_id",
        table_name="registered_machines",
    )
    op.drop_index(
        "ix_registered_machines_customer_id",
        table_name="registered_machines",
    )
    op.drop_table("registered_machines")
