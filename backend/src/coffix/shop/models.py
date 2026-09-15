from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from coffix.core.database import Base


class ShopSettings(Base):
    __tablename__ = "shop_settings"
    __table_args__ = (
        CheckConstraint("id = 1", name="singleton"),
        CheckConstraint("version > 0", name="positive_version"),
        CheckConstraint("shipping_fee_agorot >= 0", name="nonnegative_shipping"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    shipping_fee_agorot: Mapped[int] = mapped_column(Integer, nullable=False)
    shop_address: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(16))
    whatsapp: Mapped[str | None] = mapped_column(String(16))
    email: Mapped[str | None] = mapped_column(String(254))
    opening_hours: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
