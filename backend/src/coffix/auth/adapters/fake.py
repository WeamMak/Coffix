from dataclasses import dataclass, field


@dataclass(slots=True)
class FakeOtpProvider:
    development_code: str
    requested_phones: list[str] = field(default_factory=list)

    async def request_code(self, phone_e164: str) -> str:
        self.requested_phones.append(phone_e164)
        return f"fake-verification-{len(self.requested_phones)}"

    async def verify_code(self, phone_e164: str, code: str) -> bool:
        return phone_e164 in self.requested_phones and code == self.development_code
