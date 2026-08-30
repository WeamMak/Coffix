from typing import Protocol
from uuid import UUID, uuid4


class IdGenerator(Protocol):
    def new(self) -> UUID: ...


class UuidGenerator:
    def new(self) -> UUID:
        return uuid4()
