"""Add catalog category presentation metadata.

Revision ID: 0013_catalog_category_metadata
Revises: 0012_product_media
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013_catalog_category_metadata"
down_revision: str | None = "0012_product_media"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column("icon_key", sa.String(length=50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("categories", "icon_key")
