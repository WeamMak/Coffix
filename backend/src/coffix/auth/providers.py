from typing import Protocol


class OtpProvider(Protocol):
    async def request_code(self, phone_e164: str) -> str: ...

    async def verify_code(self, phone_e164: str, code: str) -> bool: ...
