"""Add service request lifecycle, configuration, history, and outbox.

Revision ID: 0010_service_requests
Revises: 0009_media
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_service_requests"
down_revision: str | None = "0009_media"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SERVICE_STATES = (
    "'awaiting_diagnostic_payment', 'awaiting_admin_review', 'scheduled', "
    "'received', 'diagnosing', 'awaiting_additional_decision', "
    "'awaiting_additional_payment', 'repair_in_progress', 'ready_for_return', "
    "'completed', 'cancelled'"
)


def timestamps() -> list[sa.Column[Any]]:
    return [
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
    ]


def upgrade() -> None:
    op.create_table(
        "service_types",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("label_he", sa.String(length=160), nullable=False),
        sa.Column("label_en", sa.String(length=160), nullable=False),
        sa.Column("diagnostic_fee_agorot", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        *timestamps(),
        sa.CheckConstraint(
            "diagnostic_fee_agorot > 0",
            name="ck_service_types_positive_diagnostic_fee",
        ),
        sa.CheckConstraint("version > 0", name="ck_service_types_positive_version"),
        sa.PrimaryKeyConstraint("id", name="pk_service_types"),
        sa.UniqueConstraint("label_en", name="uq_service_types_label_en"),
    )

    op.create_table(
        "service_type_machine_models",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("service_type_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("machine_model_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["service_type_id"],
            ["service_types.id"],
            name="fk_service_type_machine_models_service_type_id_service_types",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["machine_model_id"],
            ["machine_models.id"],
            name="fk_service_type_machine_models_machine_model_id_machine_models",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_service_type_machine_models"),
        sa.UniqueConstraint(
            "service_type_id",
            "machine_model_id",
            name="uq_service_type_machine_models_service_type_model",
        ),
    )
    op.create_index(
        "ix_service_type_machine_models_service_type_id",
        "service_type_machine_models",
        ["service_type_id"],
    )
    op.create_index(
        "ix_service_type_machine_models_machine_model_id",
        "service_type_machine_models",
        ["machine_model_id"],
    )

    op.create_table(
        "service_requests",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("reference", sa.String(length=32), nullable=False),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("machine_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("service_type_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("diagnostic_payment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("assigned_technician_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "state",
            sa.String(length=40),
            server_default="awaiting_diagnostic_payment",
            nullable=False,
        ),
        sa.Column("diagnostic_fee_agorot", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="ILS", nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("location_mode", sa.String(length=20), nullable=False),
        sa.Column(
            "address_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("preferred_window_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("preferred_window_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_appointment_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_appointment_end", sa.DateTime(timezone=True), nullable=True),
        *timestamps(),
        sa.CheckConstraint(
            f"state IN ({SERVICE_STATES})",
            name="ck_service_requests_valid_state",
        ),
        sa.CheckConstraint(
            "location_mode IN ('bring_in', 'pickup')",
            name="ck_service_requests_valid_location_mode",
        ),
        sa.CheckConstraint(
            "diagnostic_fee_agorot > 0",
            name="ck_service_requests_positive_diagnostic_fee",
        ),
        sa.CheckConstraint(
            "currency = 'ILS'",
            name="ck_service_requests_currency_is_ils",
        ),
        sa.CheckConstraint(
            "(preferred_window_start IS NULL AND preferred_window_end IS NULL) OR "
            "(preferred_window_start IS NOT NULL AND preferred_window_end > "
            "preferred_window_start)",
            name="ck_service_requests_valid_preferred_window",
        ),
        sa.CheckConstraint(
            "(confirmed_appointment_start IS NULL AND confirmed_appointment_end IS NULL) OR "
            "(confirmed_appointment_start IS NOT NULL AND confirmed_appointment_end > "
            "confirmed_appointment_start)",
            name="ck_service_requests_valid_confirmed_appointment",
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["users.id"],
            name="fk_service_requests_customer_id_users",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["machine_id"],
            ["registered_machines.id"],
            name="fk_service_requests_machine_id_registered_machines",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["service_type_id"],
            ["service_types.id"],
            name="fk_service_requests_service_type_id_service_types",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["diagnostic_payment_id"],
            ["payments.id"],
            name="fk_service_requests_diagnostic_payment_id_payments",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["assigned_technician_id"],
            ["users.id"],
            name="fk_service_requests_assigned_technician_id_users",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_service_requests"),
        sa.UniqueConstraint("reference", name="uq_service_requests_reference"),
        sa.UniqueConstraint(
            "diagnostic_payment_id",
            name="uq_service_requests_diagnostic_payment_id",
        ),
    )
    op.create_index("ix_service_requests_customer_id", "service_requests", ["customer_id"])
    op.create_index("ix_service_requests_machine_id", "service_requests", ["machine_id"])
    op.create_index("ix_service_requests_service_type_id", "service_requests", ["service_type_id"])
    op.create_index(
        "ix_service_requests_assigned_technician_id",
        "service_requests",
        ["assigned_technician_id"],
    )
    op.create_index(
        "ix_service_requests_customer_created",
        "service_requests",
        ["customer_id", "created_at"],
    )
    op.create_index(
        "ix_service_requests_machine_created",
        "service_requests",
        ["machine_id", "created_at"],
    )
    op.create_index(
        "ix_service_requests_state_created",
        "service_requests",
        ["state", "created_at"],
    )
    op.create_index(
        "ix_service_requests_state_updated",
        "service_requests",
        ["state", "updated_at"],
    )

    op.create_table(
        "service_quotes",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("admin_author_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("additional_payment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("amount_agorot", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="ILS", nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("decision", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        *timestamps(),
        sa.CheckConstraint("amount_agorot > 0", name="ck_service_quotes_positive_amount"),
        sa.CheckConstraint("currency = 'ILS'", name="ck_service_quotes_currency_is_ils"),
        sa.CheckConstraint(
            "decision IN ('pending', 'accepted', 'declined')",
            name="ck_service_quotes_valid_decision",
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["service_requests.id"],
            name="fk_service_quotes_request_id_service_requests",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["admin_author_id"],
            ["users.id"],
            name="fk_service_quotes_admin_author_id_users",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["additional_payment_id"],
            ["payments.id"],
            name="fk_service_quotes_additional_payment_id_payments",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_service_quotes"),
        sa.UniqueConstraint(
            "additional_payment_id",
            name="uq_service_quotes_additional_payment_id",
        ),
    )
    op.create_index("ix_service_quotes_request_id", "service_quotes", ["request_id"])
    op.create_index("ix_service_quotes_admin_author_id", "service_quotes", ["admin_author_id"])
    op.create_index(
        "uq_service_quotes_one_pending",
        "service_quotes",
        ["request_id"],
        unique=True,
        postgresql_where=sa.text("decision = 'pending'"),
    )

    op.create_table(
        "service_notes",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("visibility", sa.String(length=20), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "visibility IN ('internal', 'customer')",
            name="ck_service_notes_valid_visibility",
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["service_requests.id"],
            name="fk_service_notes_request_id_service_requests",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["users.id"],
            name="fk_service_notes_author_id_users",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_service_notes"),
    )
    op.create_index("ix_service_notes_request_id", "service_notes", ["request_id"])
    op.create_index("ix_service_notes_author_id", "service_notes", ["author_id"])

    op.create_table(
        "service_media",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("note_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("uploader_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("purpose", sa.String(length=20), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "purpose IN ('issue', 'diagnosis', 'repair')",
            name="ck_service_media_valid_purpose",
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["service_requests.id"],
            name="fk_service_media_request_id_service_requests",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["note_id"],
            ["service_notes.id"],
            name="fk_service_media_note_id_service_notes",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["media_id"],
            ["media_objects.id"],
            name="fk_service_media_media_id_media_objects",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["uploader_id"],
            ["users.id"],
            name="fk_service_media_uploader_id_users",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_service_media"),
        sa.UniqueConstraint("media_id", name="uq_service_media_media_id"),
    )
    op.create_index("ix_service_media_request_id", "service_media", ["request_id"])
    op.create_index("ix_service_media_note_id", "service_media", ["note_id"])
    op.create_index("ix_service_media_uploader_id", "service_media", ["uploader_id"])

    op.create_table(
        "service_status_history",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("from_state", sa.String(length=40), nullable=True),
        sa.Column("to_state", sa.String(length=40), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source", sa.String(length=30), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["service_requests.id"],
            name="fk_service_status_history_request_id_service_requests",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name="fk_service_status_history_actor_id_users",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_service_status_history"),
    )
    op.create_index(
        "ix_service_status_history_request_id",
        "service_status_history",
        ["request_id"],
    )
    op.create_index(
        "ix_service_status_history_actor_id",
        "service_status_history",
        ["actor_id"],
    )
    op.create_index(
        "ix_service_status_history_request_created",
        "service_status_history",
        ["request_id", "created_at"],
    )

    op.create_table(
        "outbox_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("event_type", sa.String(length=120), nullable=False),
        sa.Column("aggregate_type", sa.String(length=60), nullable=False),
        sa.Column("aggregate_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "attempt_count >= 0",
            name="ck_outbox_events_non_negative_attempt_count",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_outbox_events"),
    )
    op.create_index("ix_outbox_events_aggregate_id", "outbox_events", ["aggregate_id"])
    op.create_index(
        "ix_outbox_events_pending",
        "outbox_events",
        ["processed_at", "available_at"],
    )
    op.create_index(
        "ix_outbox_events_aggregate",
        "outbox_events",
        ["aggregate_type", "aggregate_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_outbox_events_aggregate", table_name="outbox_events")
    op.drop_index("ix_outbox_events_pending", table_name="outbox_events")
    op.drop_index("ix_outbox_events_aggregate_id", table_name="outbox_events")
    op.drop_table("outbox_events")
    op.drop_index(
        "ix_service_status_history_request_created",
        table_name="service_status_history",
    )
    op.drop_index("ix_service_status_history_actor_id", table_name="service_status_history")
    op.drop_index("ix_service_status_history_request_id", table_name="service_status_history")
    op.drop_table("service_status_history")
    op.drop_index("ix_service_media_uploader_id", table_name="service_media")
    op.drop_index("ix_service_media_note_id", table_name="service_media")
    op.drop_index("ix_service_media_request_id", table_name="service_media")
    op.drop_table("service_media")
    op.drop_index("ix_service_notes_author_id", table_name="service_notes")
    op.drop_index("ix_service_notes_request_id", table_name="service_notes")
    op.drop_table("service_notes")
    op.drop_index("uq_service_quotes_one_pending", table_name="service_quotes")
    op.drop_index("ix_service_quotes_admin_author_id", table_name="service_quotes")
    op.drop_index("ix_service_quotes_request_id", table_name="service_quotes")
    op.drop_table("service_quotes")
    op.drop_index("ix_service_requests_state_updated", table_name="service_requests")
    op.drop_index("ix_service_requests_state_created", table_name="service_requests")
    op.drop_index("ix_service_requests_machine_created", table_name="service_requests")
    op.drop_index("ix_service_requests_customer_created", table_name="service_requests")
    op.drop_index("ix_service_requests_assigned_technician_id", table_name="service_requests")
    op.drop_index("ix_service_requests_service_type_id", table_name="service_requests")
    op.drop_index("ix_service_requests_machine_id", table_name="service_requests")
    op.drop_index("ix_service_requests_customer_id", table_name="service_requests")
    op.drop_table("service_requests")
    op.drop_index(
        "ix_service_type_machine_models_machine_model_id",
        table_name="service_type_machine_models",
    )
    op.drop_index(
        "ix_service_type_machine_models_service_type_id",
        table_name="service_type_machine_models",
    )
    op.drop_table("service_type_machine_models")
    op.drop_table("service_types")
