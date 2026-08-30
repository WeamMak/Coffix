from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, func, text
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.orm import Mapped, mapped_column

from coffix.core.database import Base


class ReservationState(StrEnum):
    ACTIVE = "active"
    RELEASED = "released"
    CONSUMED = "consumed"


reservation_state_type = SqlEnum(
    ReservationState,
    name="reservation_state",
    native_enum=False,
    create_constraint=False,
    validate_strings=True,
    values_callable=lambda states: [state.value for state in states],
)


class StockReservation(Base):
    __tablename__ = "stock_reservations"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="positive_quantity"),
        CheckConstraint(
            "(cart_id IS NOT NULL AND order_id IS NULL) OR "
            "(cart_id IS NULL AND order_id IS NOT NULL)",
            name="exactly_one_owner",
        ),
        CheckConstraint(
            "state IN ('active', 'released', 'consumed')",
            name="valid_state",
        ),
        Index(
            "uq_stock_reservations_active_cart_sku",
            "cart_id",
            "sku_id",
            unique=True,
            postgresql_where=text("state = 'active' AND cart_id IS NOT NULL"),
        ),
        Index(
            "uq_stock_reservations_active_order_sku",
            "order_id",
            "sku_id",
            unique=True,
            postgresql_where=text("state = 'active' AND order_id IS NOT NULL"),
        ),
        Index(
            "ix_stock_reservations_active_sku_expiry",
            "sku_id",
            "expires_at",
            postgresql_where=text("state = 'active'"),
        ),
        Index(
            "ix_stock_reservations_active_cart",
            "cart_id",
            postgresql_where=text("state = 'active' AND cart_id IS NOT NULL"),
        ),
        Index(
            "ix_stock_reservations_active_order",
            "order_id",
            postgresql_where=text("state = 'active' AND order_id IS NOT NULL"),
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    sku_id: Mapped[UUID] = mapped_column(
        ForeignKey("product_skus.id", ondelete="RESTRICT"), index=True
    )
    cart_id: Mapped[UUID | None] = mapped_column()
    order_id: Mapped[UUID | None] = mapped_column()
    quantity: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    state: Mapped[ReservationState] = mapped_column(
        reservation_state_type,
        default=ReservationState.ACTIVE,
        server_default=ReservationState.ACTIVE.value,
    )
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def release(self, now: datetime) -> bool:
        if self.state is not ReservationState.ACTIVE:
            return False
        self.state = ReservationState.RELEASED
        self.released_at = now
        return True

    def consume(self, now: datetime) -> bool:
        if self.state is not ReservationState.ACTIVE:
            return False
        self.state = ReservationState.CONSUMED
        self.consumed_at = now
        return True
