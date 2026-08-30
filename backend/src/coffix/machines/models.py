from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from coffix.core.database import Base


class MachineModel(Base):
    __tablename__ = "machine_models"
    __table_args__ = (
        CheckConstraint(
            "default_warranty_months >= 0",
            name="non_negative_default_warranty_months",
        ),
        UniqueConstraint("manufacturer", "model_name", name="manufacturer_model_name"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    manufacturer: Mapped[str] = mapped_column(String(120))
    model_name: Mapped[str] = mapped_column(String(120))
    serial_pattern: Mapped[str | None] = mapped_column(String(255))
    default_warranty_months: Mapped[int] = mapped_column(default=12, server_default="12")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
