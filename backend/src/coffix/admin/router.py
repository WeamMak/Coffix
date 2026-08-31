from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Path, Query, Request, status

from coffix.admin.queries import AdminCommands, AdminQueries, AuditContext
from coffix.admin.schemas import (
    AdminUserRead,
    AuditLogRead,
    ConfigurationRead,
    DashboardRead,
    DeliveryFailureRead,
    InventoryRead,
    OrderQueueRead,
    ServiceQueueRead,
    StockCorrection,
    UserAccessUpdate,
)
from coffix.auth.policies import AdminActorDep, SessionDep
from coffix.catalog.repository import CatalogRepository, MachineModelRepository
from coffix.catalog.schemas import (
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    MachineModelCreate,
    MachineModelRead,
    MachineModelUpdate,
    ProductCreate,
    ProductRead,
    ProductUpdate,
    SkuCreate,
    SkuRead,
    SkuUpdate,
)
from coffix.catalog.service import CatalogAdminService, MachineModelAdminService

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])
EntityId = Annotated[UUID, Path()]
AuditLimit = Annotated[int, Query(ge=1, le=500)]


def queries_for(request: Request, session: SessionDep) -> AdminQueries:
    return AdminQueries(session, clock=request.app.state.clock)


def commands_for(request: Request, session: SessionDep) -> AdminCommands:
    return AdminCommands(session, clock=request.app.state.clock)


def context_for(request: Request, actor_id: UUID) -> AuditContext:
    return AuditContext(
        actor_id=actor_id,
        ip_address=request.client.host if request.client is not None else None,
        correlation_id=getattr(request.state, "correlation_id", None),
    )


def catalog_for(session: SessionDep) -> CatalogAdminService:
    return CatalogAdminService(CatalogRepository(session), MachineModelRepository(session))


@router.get("/dashboard", response_model=DashboardRead)
async def dashboard(actor: AdminActorDep, request: Request, session: SessionDep) -> DashboardRead:
    return await queries_for(request, session).dashboard()


@router.get("/users", response_model=list[AdminUserRead])
async def list_users(
    actor: AdminActorDep, request: Request, session: SessionDep
) -> list[AdminUserRead]:
    return await queries_for(request, session).users()


@router.patch("/users/{user_id}", response_model=AdminUserRead)
async def update_user_access(
    user_id: EntityId,
    data: UserAccessUpdate,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> AdminUserRead:
    return await commands_for(request, session).change_user_access(
        user_id, data, context_for(request, actor.user_id)
    )


@router.get("/inventory", response_model=list[InventoryRead])
async def list_inventory(
    actor: AdminActorDep, request: Request, session: SessionDep
) -> list[InventoryRead]:
    return await queries_for(request, session).inventory()


@router.post("/inventory/{sku_id}/corrections", response_model=InventoryRead)
async def correct_stock(
    sku_id: EntityId,
    data: StockCorrection,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> InventoryRead:
    return await commands_for(request, session).correct_stock(
        sku_id, data, context_for(request, actor.user_id)
    )


@router.get("/orders", response_model=list[OrderQueueRead])
async def list_order_queue(
    actor: AdminActorDep, request: Request, session: SessionDep
) -> list[OrderQueueRead]:
    return await queries_for(request, session).orders()


@router.get("/service-requests", response_model=list[ServiceQueueRead])
async def list_service_queue(
    actor: AdminActorDep, request: Request, session: SessionDep
) -> list[ServiceQueueRead]:
    return await queries_for(request, session).service_requests()


@router.get("/notification-deliveries", response_model=list[DeliveryFailureRead])
async def list_delivery_failures(
    actor: AdminActorDep, request: Request, session: SessionDep
) -> list[DeliveryFailureRead]:
    return await queries_for(request, session).delivery_failures()


@router.get("/audit-logs", response_model=list[AuditLogRead])
async def list_audit_logs(
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
    limit: AuditLimit = 100,
) -> list[AuditLogRead]:
    return await queries_for(request, session).audit_logs(limit=limit)


@router.get("/configuration", response_model=ConfigurationRead)
async def get_configuration(
    actor: AdminActorDep, request: Request, session: SessionDep
) -> ConfigurationRead:
    return await queries_for(request, session).configuration(request.app.state.settings)


async def audit_configuration(
    *,
    request: Request,
    session: SessionDep,
    actor_id: UUID,
    action: str,
    target_type: str,
    target_id: UUID,
    after: dict[str, Any],
) -> None:
    await commands_for(request, session).audit(
        action=action,
        target_type=target_type,
        target_id=target_id,
        before=None,
        after=after,
        context=context_for(request, actor_id),
    )


@router.get("/categories", response_model=list[CategoryRead])
async def list_admin_categories(actor: AdminActorDep, session: SessionDep) -> list[CategoryRead]:
    return [
        CategoryRead.model_validate(item) for item in await catalog_for(session).list_categories()
    ]


@router.post("/categories", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
async def create_category(
    data: CategoryCreate,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> CategoryRead:
    result = CategoryRead.model_validate(await catalog_for(session).create_category(data))
    await audit_configuration(
        request=request,
        session=session,
        actor_id=actor.user_id,
        action="catalog.category_created",
        target_type="category",
        target_id=result.id,
        after=result.model_dump(mode="json"),
    )
    return result


@router.patch("/categories/{category_id}", response_model=CategoryRead)
async def update_category(
    category_id: EntityId,
    data: CategoryUpdate,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> CategoryRead:
    result = CategoryRead.model_validate(
        await catalog_for(session).update_category(category_id, data)
    )
    await audit_configuration(
        request=request,
        session=session,
        actor_id=actor.user_id,
        action="catalog.category_updated",
        target_type="category",
        target_id=result.id,
        after=result.model_dump(mode="json"),
    )
    return result


@router.post("/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
async def create_product(
    data: ProductCreate,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> ProductRead:
    result = ProductRead.model_validate(await catalog_for(session).create_product(data))
    await audit_configuration(
        request=request,
        session=session,
        actor_id=actor.user_id,
        action="catalog.product_created",
        target_type="product",
        target_id=result.id,
        after=result.model_dump(mode="json"),
    )
    return result


@router.patch("/products/{product_id}", response_model=ProductRead)
async def update_product(
    product_id: EntityId,
    data: ProductUpdate,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> ProductRead:
    result = ProductRead.model_validate(await catalog_for(session).update_product(product_id, data))
    await audit_configuration(
        request=request,
        session=session,
        actor_id=actor.user_id,
        action="catalog.product_updated",
        target_type="product",
        target_id=result.id,
        after=result.model_dump(mode="json"),
    )
    return result


@router.post(
    "/products/{product_id}/skus", response_model=SkuRead, status_code=status.HTTP_201_CREATED
)
async def create_sku(
    product_id: EntityId,
    data: SkuCreate,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> SkuRead:
    result = SkuRead.model_validate(await catalog_for(session).create_sku(product_id, data))
    await audit_configuration(
        request=request,
        session=session,
        actor_id=actor.user_id,
        action="catalog.sku_created",
        target_type="product_sku",
        target_id=result.id,
        after=result.model_dump(mode="json"),
    )
    return result


@router.patch("/skus/{sku_id}", response_model=SkuRead)
async def update_sku(
    sku_id: EntityId,
    data: SkuUpdate,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> SkuRead:
    result = SkuRead.model_validate(await catalog_for(session).update_sku(sku_id, data))
    await audit_configuration(
        request=request,
        session=session,
        actor_id=actor.user_id,
        action="catalog.sku_updated",
        target_type="product_sku",
        target_id=result.id,
        after=result.model_dump(mode="json"),
    )
    return result


@router.get("/machine-models", response_model=list[MachineModelRead])
async def list_machine_models(actor: AdminActorDep, session: SessionDep) -> list[MachineModelRead]:
    service = MachineModelAdminService(MachineModelRepository(session))
    return [MachineModelRead.model_validate(item) for item in await service.list_models()]


@router.post(
    "/machine-models",
    response_model=MachineModelRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_machine_model(
    data: MachineModelCreate,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> MachineModelRead:
    service = MachineModelAdminService(MachineModelRepository(session))
    result = MachineModelRead.model_validate(await service.create_model(data))
    await audit_configuration(
        request=request,
        session=session,
        actor_id=actor.user_id,
        action="catalog.machine_model_created",
        target_type="machine_model",
        target_id=result.id,
        after=result.model_dump(mode="json"),
    )
    return result


@router.patch("/machine-models/{model_id}", response_model=MachineModelRead)
async def update_machine_model(
    model_id: EntityId,
    data: MachineModelUpdate,
    actor: AdminActorDep,
    request: Request,
    session: SessionDep,
) -> MachineModelRead:
    service = MachineModelAdminService(MachineModelRepository(session))
    result = MachineModelRead.model_validate(await service.update_model(model_id, data))
    await audit_configuration(
        request=request,
        session=session,
        actor_id=actor.user_id,
        action="catalog.machine_model_updated",
        target_type="machine_model",
        target_id=result.id,
        after=result.model_dump(mode="json"),
    )
    return result
