from datetime import datetime, timedelta
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from coffix.catalog.models import ProductSku
from coffix.core.database import Base


class CartStatus(StrEnum):
    ACTIVE = "active"
    EXPIRED = "expired"
    CHECKED_OUT = "checked_out"


cart_status_type = SqlEnum(
    CartStatus,
    name="cart_status",
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda statuses: [status.value for status in statuses],
)


class Cart(Base):
    __tablename__ = "carts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'expired', 'checked_out')",
            name="valid_status",
        ),
        CheckConstraint("version >= 1", name="positive_version"),
        Index(
            "uq_carts_active_customer",
            "customer_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        Index(
            "ix_carts_active_expiry",
            "expires_at",
            postgresql_where=text("status = 'active'"),
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    customer_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    status: Mapped[CartStatus] = mapped_column(
        cart_status_type,
        default=CartStatus.ACTIVE,
        server_default=CartStatus.ACTIVE.value,
    )
    last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    items: Mapped[list["CartItem"]] = relationship(
        back_populates="cart",
        cascade="all, delete-orphan",
        order_by="CartItem.created_at",
        lazy="selectin",
    )

    def refresh_activity(self, now: datetime, *, ttl_seconds: int) -> None:
        if ttl_seconds <= 0:
            raise ValueError("ttl_seconds must be positive")
        self.last_activity_at = now
        self.expires_at = now + timedelta(seconds=ttl_seconds)
        self.version += 1

    def is_expired(self, now: datetime) -> bool:
        return self.status is CartStatus.ACTIVE and self.expires_at <= now

    def expire(self, now: datetime) -> bool:
        if self.status is not CartStatus.ACTIVE:
            return False
        self.status = CartStatus.EXPIRED
        self.expired_at = now
        self.version += 1
        return True


class CartItem(Base):
    __tablename__ = "cart_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="positive_quantity"),
        CheckConstraint(
            "latest_displayed_price_agorot >= 0",
            name="non_negative_latest_displayed_price",
        ),
        CheckConstraint("currency = 'ILS'", name="currency_is_ils"),
        UniqueConstraint("cart_id", "sku_id", name="cart_sku"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    cart_id: Mapped[UUID] = mapped_column(
        ForeignKey("carts.id", ondelete="CASCADE"), index=True
    )
    sku_id: Mapped[UUID] = mapped_column(
        ForeignKey("product_skus.id", ondelete="RESTRICT"), index=True
    )
    quantity: Mapped[int] = mapped_column(Integer)
    latest_displayed_price_agorot: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="ILS", server_default="ILS")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    cart: Mapped[Cart] = relationship(back_populates="items")
    sku: Mapped[ProductSku] = relationship(lazy="selectin")
