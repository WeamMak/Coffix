import pytest

from coffix.users.service import normalize_israeli_phone


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("050-123-4567", "+972501234567"),
        ("+972 50 123 4567", "+972501234567"),
        ("00972-50-123-4567", "+972501234567"),
    ],
)
def test_normalize_israeli_phone_returns_e164(raw: str, expected: str) -> None:
    assert normalize_israeli_phone(raw) == expected


@pytest.mark.parametrize("raw", ["", "12345", "+1 202 555 0100", "050-123-ABCD"])
def test_normalize_israeli_phone_rejects_invalid_numbers(raw: str) -> None:
    with pytest.raises(ValueError, match="Israeli mobile"):
        normalize_israeli_phone(raw)
