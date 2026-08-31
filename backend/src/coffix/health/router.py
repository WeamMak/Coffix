from fastapi import APIRouter, Request, Response, status

from coffix.health.checks import ReadinessChecks
from coffix.health.schemas import LiveHealthRead, ReadinessRead

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live", response_model=LiveHealthRead)
async def liveness(request: Request) -> LiveHealthRead:
    return LiveHealthRead(version=request.app.state.settings.app_version)


def checks_for(request: Request) -> ReadinessChecks:
    return ReadinessChecks(
        engine=request.app.state.database_engine,
        redis=request.app.state.redis,
        settings=request.app.state.settings,
        clock=request.app.state.clock,
    )


@router.get("/ready", response_model=ReadinessRead)
async def readiness(request: Request, response: Response) -> ReadinessRead:
    result = await checks_for(request).check()
    if result.status == "not_ready":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return result


@router.get("/worker", response_model=ReadinessRead)
async def worker_health(request: Request, response: Response) -> ReadinessRead:
    result = await checks_for(request).worker()
    if result.status == "not_ready":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return result
