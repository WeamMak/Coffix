from datetime import UTC, datetime
from uuid import uuid4

import pytest

from coffix.service.models import ServiceQuote, ServiceQuoteDecision
from coffix.service.service import QuoteDecisionError, decide_quote

NOW = datetime(2026, 8, 31, 12, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    "decision",
    [ServiceQuoteDecision.ACCEPTED, ServiceQuoteDecision.DECLINED],
)
def test_pending_quote_can_be_decided_once(decision: ServiceQuoteDecision) -> None:
    quote = ServiceQuote(
        request_id=uuid4(),
        admin_author_id=uuid4(),
        amount_agorot=12_500,
        currency="ILS",
        explanation="Replace the pressure valve.",
        decision=ServiceQuoteDecision.PENDING,
    )

    decide_quote(quote, decision, NOW)

    assert quote.decision is decision
    assert quote.decided_at == NOW

    with pytest.raises(QuoteDecisionError, match="already been decided"):
        decide_quote(quote, decision, NOW)


def test_quote_cannot_be_decided_as_pending() -> None:
    quote = ServiceQuote(
        request_id=uuid4(),
        admin_author_id=uuid4(),
        amount_agorot=12_500,
        currency="ILS",
        explanation="Replace the pressure valve.",
    )

    with pytest.raises(QuoteDecisionError, match="final decision"):
        decide_quote(quote, ServiceQuoteDecision.PENDING, NOW)
