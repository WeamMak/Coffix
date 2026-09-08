"""Optional customer email; existing names determine profile completion."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_customer_profile"
down_revision: str | None = "0014_service_intake"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email", sa.String(254), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "email")
