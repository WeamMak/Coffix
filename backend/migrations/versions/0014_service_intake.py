"""Configurable intake choices and diagnostic quoting after review."""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0014_service_intake"
down_revision: str | None = "0013_catalog_category_metadata"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_STATES = (
    "'awaiting_diagnostic_payment', 'awaiting_admin_review', 'scheduled', 'received', "
    "'diagnosing', 'awaiting_additional_decision', 'awaiting_additional_payment', "
    "'repair_in_progress', 'ready_for_return', 'completed', 'cancelled'"
)


def upgrade() -> None:
    op.add_column(
        "service_types", sa.Column("icon_key", sa.String(40), nullable=False, server_default="tool")
    )
    op.add_column(
        "service_types",
        sa.Column("tags_he", postgresql.JSONB(), nullable=False, server_default="[]"),
    )
    op.create_table(
        "service_intake_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("settings", postgresql.JSONB(), nullable=False),
        sa.CheckConstraint("id = 1", name="singleton"),
    )
    defaults = {
        "urgencies": [
            {
                "id": "normal",
                "name_he": "רגיל",
                "description_he": "תוך 3–5 ימי עסקים",
                "surcharge_percent": 0,
            },
            {
                "id": "urgent",
                "name_he": "דחוף",
                "description_he": "תוך 24 שעות",
                "surcharge_percent": 30,
            },
        ],
        "weekdays": [0, 1, 2, 3, 6],
        "slots": [{"start": "08:00", "end": "12:00"}, {"start": "12:00", "end": "17:00"}],
        "horizon_days": 14,
        "response_hours": 4,
    }
    op.execute(
        sa.text(
            "INSERT INTO service_intake_settings VALUES (1, 1, CAST(:settings AS jsonb))"
        ).bindparams(settings=json.dumps(defaults))
    )
    op.alter_column("service_requests", "state", server_default="awaiting_intake_review")
    op.alter_column("service_requests", "diagnostic_fee_agorot", nullable=True)
    for column in [
        sa.Column("diagnostic_base_fee_agorot", sa.Integer(), nullable=True),
        sa.Column("urgency_id", sa.String(40), nullable=False, server_default="normal"),
        sa.Column("urgency_name_he", sa.String(80), nullable=False, server_default="רגיל"),
        sa.Column("urgency_description_he", sa.String(160), nullable=False, server_default=""),
        sa.Column("urgency_surcharge_percent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("response_hours", sa.Integer(), nullable=False, server_default="4"),
    ]:
        op.add_column("service_requests", column)
    op.execute("UPDATE service_requests SET diagnostic_base_fee_agorot = diagnostic_fee_agorot")
    op.drop_constraint("ck_service_requests_valid_state", "service_requests", type_="check")
    op.create_check_constraint(
        "valid_state", "service_requests", f"state IN ('awaiting_intake_review', {OLD_STATES})"
    )
    op.create_check_constraint(
        "review_fee",
        "service_requests",
        "diagnostic_fee_agorot IS NOT NULL OR state IN ('awaiting_intake_review', 'cancelled')",
    )


def downgrade() -> None:
    # A downgrade cannot represent unquoted requests; fail without destroying them.
    op.alter_column("service_requests", "state", server_default="awaiting_diagnostic_payment")
    op.alter_column("service_requests", "diagnostic_fee_agorot", nullable=False)
    op.drop_constraint(op.f("ck_service_requests_review_fee"), "service_requests", type_="check")
    op.drop_constraint(op.f("ck_service_requests_valid_state"), "service_requests", type_="check")
    op.create_check_constraint(
        "ck_service_requests_valid_state", "service_requests", f"state IN ({OLD_STATES})"
    )
    for name in [
        "diagnostic_base_fee_agorot",
        "urgency_id",
        "urgency_name_he",
        "urgency_description_he",
        "urgency_surcharge_percent",
        "response_hours",
    ]:
        op.drop_column("service_requests", name)
    op.drop_table("service_intake_settings")
    op.drop_column("service_types", "tags_he")
    op.drop_column("service_types", "icon_key")
