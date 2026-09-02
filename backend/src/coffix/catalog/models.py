from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from coffix.core.database import Base


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        CheckConstraint("sort_order >= 0", name="non_negative_sort_order"),
        Index("ix_categories_active_sort", "is_active", "sort_order"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name_he: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    image_key: Mapped[str | None] = mapped_column(String(512))
    icon_key: Mapped[str | None] = mapped_column(String(50))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        Index("ix_products_customer_listing", "is_active", "category_id", "is_featured"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    category_id: Mapped[UUID] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), index=True
    )
    name_he: Mapped[str] = mapped_column(String(160))
    description_he: Mapped[str] = mapped_column(Text)
    admin_label_en: Mapped[str | None] = mapped_column(String(160))
    product_type: Mapped[str] = mapped_column(String(40), index=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    skus: Mapped[list["ProductSku"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductSku.sku_code",
        lazy="selectin",
    )
    media: Mapped[list["ProductMedia"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        foreign_keys=lambda: ProductMedia.product_id,
        order_by=lambda: (ProductMedia.sort_order, ProductMedia.id),
        lazy="selectin",
    )


class ProductSku(Base):
    __tablename__ = "product_skus"
    __table_args__ = (
        CheckConstraint("price_agorot >= 0", name="non_negative_price"),
        CheckConstraint("currency = 'ILS'", name="currency_is_ils"),
        CheckConstraint(
            "stock_quantity IS NULL OR stock_quantity >= 0",
            name="nullable_non_negative_stock",
        ),
        Index("ix_product_skus_product_active", "product_id", "is_active"),
        UniqueConstraint("id", "product_id", name="uq_product_skus_id_product_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    product_id: Mapped[UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    sku_code: Mapped[str] = mapped_column(String(80), unique=True)
    attributes: Mapped[dict[str, str]] = mapped_column(JSONB, default=dict, server_default="{}")
    price_agorot: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="ILS", server_default="ILS")
    stock_quantity: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    machine_model_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("machine_models.id", ondelete="RESTRICT"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    product: Mapped[Product] = relationship(back_populates="skus")


class ProductMedia(Base):
    __tablename__ = "product_media"
    __table_args__ = (
        CheckConstraint("sort_order >= 0", name="non_negative_sort_order"),
        CheckConstraint("media_type LIKE 'image/%'", name="image_media_type"),
        CheckConstraint("length(trim(alt_text_he)) > 0", name="non_empty_alt_text"),
        ForeignKeyConstraint(
            ["sku_id", "product_id"],
            ["product_skus.id", "product_skus.product_id"],
            name="fk_product_media_sku_owned_by_product",
            ondelete="CASCADE",
        ),
        Index("ix_product_media_product_sort", "product_id", "sort_order", "id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    product_id: Mapped[UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    sku_id: Mapped[UUID | None] = mapped_column(index=True)
    object_key: Mapped[str] = mapped_column(String(512))
    media_type: Mapped[str] = mapped_column(String(40))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    alt_text_he: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    product: Mapped[Product] = relationship(
        back_populates="media", foreign_keys=[product_id]
    )
