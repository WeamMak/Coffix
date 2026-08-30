"""Add users, addresses, and authentication sessions.

Revision ID: 0002_users_and_sessions
Revises: 0001_baseline
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_users_and_sessions"
down_revision: str | None = "0001_baseline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()")),
        sa.Column("phone_e164", sa.String(length=16), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "role IN ('customer', 'admin', 'technician')", name="ck_users_valid_role"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("phone_e164", name="uq_users_phone_e164"),
    )
    op.create_index("ix_users_phone_e164", "users", ["phone_e164"])

    op.create_table(
        "addresses",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recipient_name", sa.String(length=120), nullable=False),
        sa.Column("phone_e164", sa.String(length=16), nullable=False),
        sa.Column("street", sa.String(length=120), nullable=False),
        sa.Column("building", sa.String(length=30), nullable=False),
        sa.Column("apartment", sa.String(length=30), nullable=True),
        sa.Column("city", sa.String(length=80), nullable=False),
        sa.Column("postal_code", sa.String(length=12), nullable=True),
        sa.Column("country", sa.String(length=2), server_default="IL", nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("country = 'IL'", name="ck_addresses_country_is_il"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_addresses_user_id_users", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_addresses"),
    )
    op.create_index("ix_addresses_user_id", "addresses", ["user_id"])
    op.create_index(
        "uq_addresses_default_per_user",
        "addresses",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_default"),
    )

    op.create_table(
        "auth_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("refresh_token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("device_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_auth_sessions_user_id_users", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_auth_sessions"),
        sa.UniqueConstraint("refresh_token_hash", name="uq_auth_sessions_refresh_token_hash"),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")
    op.drop_index("uq_addresses_default_per_user", table_name="addresses")
    op.drop_index("ix_addresses_user_id", table_name="addresses")
    op.drop_table("addresses")
    op.drop_index("ix_users_phone_e164", table_name="users")
    op.drop_table("users")
