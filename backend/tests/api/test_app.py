import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from coffix.api.app import create_app
from coffix.api.errors import ApiError
from coffix.core.settings import Settings


@pytest.mark.asyncio
async def test_response_contains_generated_correlation_id() -> None:
    app = create_app(Settings(app_env="test"))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/missing")

    assert response.headers["X-Correlation-ID"]
    assert response.json()["correlationId"] == response.headers["X-Correlation-ID"]


@pytest.mark.asyncio
async def test_response_preserves_client_correlation_id() -> None:
    app = create_app(Settings(app_env="test"))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/missing", headers={"X-Correlation-ID": "request-123"}
        )

    assert response.headers["X-Correlation-ID"] == "request-123"


@pytest.mark.asyncio
async def test_api_error_uses_problem_json() -> None:
    app: FastAPI = create_app(Settings(app_env="test"))

    @app.get("/failure")
    async def failure() -> None:
        raise ApiError(status=409, code="state_conflict", title="State conflict")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/failure")

    assert response.status_code == 409
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json() == {
        "type": "https://coffix.app/problems/state_conflict",
        "title": "State conflict",
        "status": 409,
        "code": "state_conflict",
        "correlationId": response.headers["X-Correlation-ID"],
    }
