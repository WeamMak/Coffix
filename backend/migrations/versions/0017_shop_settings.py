"""Persist singleton shop settings; initialization is a separate deployment command."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0017_shop_settings"
down_revision = "0016_admin_images"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "shop_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("shipping_fee_agorot", sa.Integer(), nullable=False),
        sa.Column("shop_address", postgresql.JSONB(), nullable=False),
        sa.Column("phone", sa.String(16)),
        sa.Column("whatsapp", sa.String(16)),
        sa.Column("email", sa.String(254)),
        sa.Column("opening_hours", sa.Text()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("id = 1", name="singleton"),
        sa.CheckConstraint("version > 0", name="positive_version"),
        sa.CheckConstraint("shipping_fee_agorot >= 0", name="nonnegative_shipping"),
    )


def downgrade() -> None:
    op.drop_table("shop_settings")
