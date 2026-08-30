from dataclasses import dataclass
from typing import Literal
from uuid import UUID

type UserId = UUID
type CartId = UUID
type OrderId = UUID
type MachineId = UUID
type ServiceRequestId = UUID


@dataclass(frozen=True, slots=True)
class Money:
    amount_agorot: int
    currency: Literal["ILS"] = "ILS"

    def __post_init__(self) -> None:
        if self.amount_agorot < 0:
            raise ValueError("Money must be non-negative")
        if self.currency != "ILS":
            raise ValueError("Coffix supports ILS only")
