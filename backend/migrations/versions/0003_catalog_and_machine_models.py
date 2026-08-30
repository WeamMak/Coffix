"""Add catalog and machine-model configuration.

Revision ID: 0003_catalog_and_machine_models
Revises: 0002_users_and_sessions
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_catalog_and_machine_models"
down_revision: str | None = "0002_users_and_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "machine_models",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()")),
        sa.Column("manufacturer", sa.String(length=120), nullable=False),
        sa.Column("model_name", sa.String(length=120), nullable=False),
        sa.Column("serial_pattern", sa.String(length=255), nullable=True),
        sa.Column(
            "default_warranty_months", sa.Integer(), server_default="12", nullable=False
        ),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "default_warranty_months >= 0",
            name="ck_machine_models_non_negative_default_warranty_months",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_machine_models"),
        sa.UniqueConstraint(
            "manufacturer",
            "model_name",
            name="uq_machine_models_manufacturer_model_name",
        ),
    )

    op.create_table(
        "categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()")),
        sa.Column("name_he", sa.String(length=120), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("image_key", sa.String(length=512), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("sort_order >= 0", name="ck_categories_non_negative_sort_order"),
        sa.PrimaryKeyConstraint("id", name="pk_categories"),
        sa.UniqueConstraint("slug", name="uq_categories_slug"),
    )
    op.create_index("ix_categories_active_sort", "categories", ["is_active", "sort_order"])

    op.create_table(
        "products",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()")),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name_he", sa.String(length=160), nullable=False),
        sa.Column("description_he", sa.Text(), nullable=False),
        sa.Column("admin_label_en", sa.String(length=160), nullable=True),
        sa.Column("product_type", sa.String(length=40), nullable=False),
        sa.Column("is_featured", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name="fk_products_category_id_categories",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_products"),
    )
    op.create_index("ix_products_category_id", "products", ["category_id"])
    op.create_index("ix_products_product_type", "products", ["product_type"])
    op.create_index(
        "ix_products_customer_listing",
        "products",
        ["is_active", "category_id", "is_featured"],
    )

    op.create_table(
        "product_skus",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()")),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sku_code", sa.String(length=80), nullable=False),
        sa.Column(
            "attributes",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("price_agorot", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="ILS", nullable=False),
        sa.Column("stock_quantity", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("machine_model_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("price_agorot >= 0", name="ck_product_skus_non_negative_price"),
        sa.CheckConstraint("currency = 'ILS'", name="ck_product_skus_currency_is_ils"),
        sa.CheckConstraint(
            "stock_quantity IS NULL OR stock_quantity >= 0",
            name="ck_product_skus_nullable_non_negative_stock",
        ),
        sa.ForeignKeyConstraint(
            ["machine_model_id"],
            ["machine_models.id"],
            name="fk_product_skus_machine_model_id_machine_models",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name="fk_product_skus_product_id_products",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_product_skus"),
        sa.UniqueConstraint("sku_code", name="uq_product_skus_sku_code"),
    )
    op.create_index("ix_product_skus_machine_model_id", "product_skus", ["machine_model_id"])
    op.create_index("ix_product_skus_product_id", "product_skus", ["product_id"])
    op.create_index(
        "ix_product_skus_product_active", "product_skus", ["product_id", "is_active"]
    )


def downgrade() -> None:
    op.drop_index("ix_product_skus_product_active", table_name="product_skus")
    op.drop_index("ix_product_skus_product_id", table_name="product_skus")
    op.drop_index("ix_product_skus_machine_model_id", table_name="product_skus")
    op.drop_table("product_skus")
    op.drop_index("ix_products_customer_listing", table_name="products")
    op.drop_index("ix_products_product_type", table_name="products")
    op.drop_index("ix_products_category_id", table_name="products")
    op.drop_table("products")
    op.drop_index("ix_categories_active_sort", table_name="categories")
    op.drop_table("categories")
    op.drop_table("machine_models")
