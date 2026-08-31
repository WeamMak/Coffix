from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from coffix.core.database import Base


class OrderState(StrEnum):
    PENDING_PAYMENT = "pending_payment"
    PAID = "paid"
    PROCESSING = "processing"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    PAYMENT_EXPIRED = "payment_expired"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


order_state_type = SqlEnum(
    OrderState,
    name="order_state",
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda states: [state.value for state in states],
)


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(
            "state IN ('pending_payment', 'paid', 'processing', 'shipped', "
            "'delivered', 'payment_expired', 'cancelled', 'refunded')",
            name="valid_state",
        ),
        CheckConstraint("subtotal_agorot >= 0", name="non_negative_subtotal"),
        CheckConstraint("shipping_agorot >= 0", name="non_negative_shipping"),
        CheckConstraint("total_agorot = subtotal_agorot + shipping_agorot", name="valid_total"),
        CheckConstraint("currency = 'ILS'", name="currency_is_ils"),
        Index("ix_orders_customer_created", "customer_id", "created_at"),
        Index("ix_orders_state_created", "state", "created_at"),
        Index("ix_orders_payment_deadline", "payment_deadline"),
        UniqueConstraint(
            "customer_id",
            "checkout_idempotency_key",
            name="customer_checkout_idempotency",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    customer_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    source_cart_id: Mapped[UUID] = mapped_column(
        ForeignKey("carts.id", ondelete="RESTRICT"), unique=True
    )
    payment_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("payments.id", ondelete="RESTRICT"), unique=True
    )
    order_number: Mapped[str] = mapped_column(String(32), unique=True)
    state: Mapped[OrderState] = mapped_column(
        order_state_type,
        default=OrderState.PENDING_PAYMENT,
        server_default=OrderState.PENDING_PAYMENT.value,
    )
    subtotal_agorot: Mapped[int] = mapped_column(Integer)
    shipping_agorot: Mapped[int] = mapped_column(Integer)
    total_agorot: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="ILS", server_default="ILS")
    address_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB)
    payment_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    checkout_idempotency_key: Mapped[str] = mapped_column(String(255))
    checkout_fingerprint: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by=lambda: (OrderItem.created_at, OrderItem.id),
    )
    history: Mapped[list["OrderStatusHistory"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by=lambda: (OrderStatusHistory.created_at, OrderStatusHistory.id),
    )
    shipment: Mapped["Shipment | None"] = relationship(back_populates="order", uselist=False)


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="positive_quantity"),
        CheckConstraint("unit_price_agorot >= 0", name="non_negative_unit_price"),
        CheckConstraint(
            "line_total_agorot = unit_price_agorot * quantity", name="valid_line_total"
        ),
        CheckConstraint("currency = 'ILS'", name="currency_is_ils"),
        UniqueConstraint("order_id", "sku_id", name="order_sku"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    sku_id: Mapped[UUID] = mapped_column(
        ForeignKey("product_skus.id", ondelete="RESTRICT"), index=True
    )
    product_id: Mapped[UUID] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"))
    product_name_he: Mapped[str] = mapped_column(String(160))
    sku_code: Mapped[str] = mapped_column(String(80))
    attributes: Mapped[dict[str, str]] = mapped_column(JSONB, default=dict, server_default="{}")
    unit_price_agorot: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(Integer)
    line_total_agorot: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="ILS", server_default="ILS")
    machine_model_id: Mapped[UUID | None] = mapped_column()
    machine_manufacturer: Mapped[str | None] = mapped_column(String(120))
    machine_model_name: Mapped[str | None] = mapped_column(String(120))
    machine_warranty_months: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order: Mapped[Order] = relationship(back_populates="items")


class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    from_state: Mapped[OrderState | None] = mapped_column(order_state_type)
    to_state: Mapped[OrderState] = mapped_column(order_state_type)
    actor_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    source: Mapped[str] = mapped_column(String(30))
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order: Mapped[Order] = relationship(back_populates="history")


class Shipment(Base):
    __tablename__ = "shipments"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), unique=True)
    carrier: Mapped[str] = mapped_column(String(120))
    tracking_number: Mapped[str] = mapped_column(String(160))
    tracking_url: Mapped[str | None] = mapped_column(String(2048))
    shipped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    order: Mapped[Order] = relationship(back_populates="shipment")
