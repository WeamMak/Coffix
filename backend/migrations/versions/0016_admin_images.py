"""Add optional completed business image references without changing legacy keys."""

import sqlalchemy as sa
from alembic import op

revision = "0016_admin_images"
down_revision = "0015_customer_profile"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table, column in (
        ("machine_models", "image_media_id"),
        ("categories", "image_media_id"),
        ("product_media", "media_id"),
    ):
        op.add_column(table, sa.Column(column, sa.Uuid(), nullable=True))
        op.create_foreign_key(
            f"fk_{table}_{column}_media_objects",
            table,
            "media_objects",
            [column],
            ["id"],
            ondelete="RESTRICT",
        )
        op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade() -> None:
    for table, column in (
        ("product_media", "media_id"),
        ("categories", "image_media_id"),
        ("machine_models", "image_media_id"),
    ):
        op.drop_index(f"ix_{table}_{column}", table_name=table)
        op.drop_constraint(f"fk_{table}_{column}_media_objects", table, type_="foreignkey")
        op.drop_column(table, column)
