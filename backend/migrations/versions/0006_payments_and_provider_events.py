"""Add provider-independent payments and provider events.

Revision ID: 0006_payments_events
Revises: 0005_carts
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006_payments_events"
down_revision: str | None = "0005_carts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()")),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("phase", sa.String(length=20), nullable=False),
        sa.Column("amount_agorot", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="ILS", nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("provider_payment_id", sa.String(length=255), nullable=True),
        sa.Column("provider_client_secret", sa.Text(), nullable=True),
        sa.Column("state", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("failure_code", sa.String(length=120), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "phase IN ('order', 'diagnostic', 'additional')", name="ck_payments_valid_phase"
        ),
        sa.CheckConstraint("amount_agorot > 0", name="ck_payments_positive_amount"),
        sa.CheckConstraint("currency = 'ILS'", name="ck_payments_currency_is_ils"),
        sa.CheckConstraint(
            "state IN ('pending', 'confirmed', 'failed')", name="ck_payments_valid_state"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_payments"),
        sa.UniqueConstraint("idempotency_key", name="uq_payments_idempotency_key"),
        sa.UniqueConstraint(
            "provider", "provider_payment_id", name="uq_payments_provider_payment_id"
        ),
    )
    op.create_index("ix_payments_owner_id", "payments", ["owner_id"])

    op.create_table(
        "refunds",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()")),
        sa.Column("payment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("amount_agorot", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="ILS", nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("provider_refund_id", sa.String(length=255), nullable=True),
        sa.Column("state", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("amount_agorot > 0", name="ck_refunds_positive_amount"),
        sa.CheckConstraint("currency = 'ILS'", name="ck_refunds_currency_is_ils"),
        sa.CheckConstraint(
            "state IN ('pending', 'confirmed', 'failed')", name="ck_refunds_valid_state"
        ),
        sa.ForeignKeyConstraint(
            ["payment_id"],
            ["payments.id"],
            name="fk_refunds_payment_id_payments",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["requested_by"],
            ["users.id"],
            name="fk_refunds_requested_by_users",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_refunds"),
        sa.UniqueConstraint("idempotency_key", name="uq_refunds_idempotency_key"),
        sa.UniqueConstraint("provider", "provider_refund_id", name="uq_refunds_provider_refund_id"),
    )
    op.create_index("ix_refunds_payment_id", "refunds", ["payment_id"])
    op.create_index("ix_refunds_requested_by", "refunds", ["requested_by"])

    op.create_table(
        "provider_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()")),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("external_event_id", sa.String(length=255), nullable=False),
        sa.Column("event_type", sa.String(length=255), nullable=False),
        sa.Column("resource", sa.String(length=20), nullable=False),
        sa.Column("provider_object_id", sa.String(length=255), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("processing_result", sa.String(length=60), nullable=True),
        sa.Column(
            "result_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column(
            "error_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.CheckConstraint(
            "resource IN ('payment', 'refund', 'ignored')",
            name="ck_provider_events_valid_resource",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_provider_events"),
        sa.UniqueConstraint(
            "provider", "external_event_id", name="uq_provider_events_provider_external_event"
        ),
    )


def downgrade() -> None:
    op.drop_table("provider_events")
    op.drop_index("ix_refunds_requested_by", table_name="refunds")
    op.drop_index("ix_refunds_payment_id", table_name="refunds")
    op.drop_table("refunds")
    op.drop_index("ix_payments_owner_id", table_name="payments")
    op.drop_table("payments")
