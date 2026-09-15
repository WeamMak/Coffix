import pytest
from httpx import ASGITransport, AsyncClient
from test_orders import seed_order_api

from coffix.api.app import create_app
from coffix.auth.policies import get_current_actor
from coffix.core.settings import Settings


@pytest.mark.asyncio
async def test_shop_settings_require_bootstrap_and_admin(migrated_database_url: str):
    from sqlalchemy import delete
    from sqlalchemy.ext.asyncio import create_async_engine

    from coffix.shop.models import ShopSettings

    engine = create_async_engine(migrated_database_url)
    async with engine.begin() as connection:
        await connection.execute(delete(ShopSettings))
    await engine.dispose()
    customer, _, admin, _ = await seed_order_api(migrated_database_url)
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get("/api/v1/admin/shop-settings")).status_code == 401
            app.dependency_overrides[get_current_actor] = lambda: customer
            assert (await client.get("/api/v1/admin/shop-settings")).status_code == 403
            app.dependency_overrides[get_current_actor] = lambda: admin
            result = await client.get("/api/v1/admin/shop-settings")
            assert result.status_code == 503
            assert result.json()["code"] == "SHOP_SETTINGS_UNAVAILABLE"


def valid_draft(version=1):
    return dict(
        version=version,
        shipping_fee_agorot=0,
        shop_address=dict(street=" הרצל ", building="12", city="חיפה", country="IL"),
        phone="+97231234567",
        whatsapp="+972501234567",
        email="shop@example.com",
        opening_hours="  א–ה 09:00–17:00\nשישי סגור  ",
    )


@pytest.mark.asyncio
async def test_bootstrap_edit_validation_conflict_audit_and_preservation(migrated_database_url):
    import asyncio

    from sqlalchemy import delete
    from sqlalchemy.ext.asyncio import create_async_engine

    from coffix.seed import seed_database
    from coffix.shop.bootstrap import bootstrap
    from coffix.shop.models import ShopSettings

    engine = create_async_engine(migrated_database_url)
    async with engine.begin() as connection:
        await connection.execute(delete(ShopSettings))
    await engine.dispose()
    customer, _, admin, _ = await seed_order_api(migrated_database_url)
    settings = Settings(app_env="test", database_url=migrated_database_url)
    await asyncio.gather(bootstrap(settings), bootstrap(settings))
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        app.dependency_overrides[get_current_actor] = lambda: admin
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            initial = (await client.get("/api/v1/admin/shop-settings")).json()
            assert initial["shipping_fee_agorot"] == 3000
            assert initial["shop_address"]["street"] is None
            for patch in (
                {"shipping_fee_agorot": -1},
                {"shipping_fee_agorot": True},
                {"shipping_fee_agorot": 2.5},
                {"shipping_fee_agorot": "3000"},
                {"phone": "bad"},
                {"whatsapp": "javascript:evil"},
                {"email": "bad"},
                {"opening_hours": "א" * 1001},
                {"shop_address": {"street": " ", "building": "1", "city": "חיפה"}},
                {"shop_address": {"street": "א", "building": "1", "city": "חיפה", "country": "US"}},
            ):
                response = await client.put(
                    "/api/v1/admin/shop-settings", json=valid_draft() | patch
                )
                assert response.status_code == 422, response.text
            saved = await client.put("/api/v1/admin/shop-settings", json=valid_draft())
            assert saved.status_code == 200, saved.text
            assert saved.json()["version"] == 2
            assert saved.json()["opening_hours"] == "א–ה 09:00–17:00\nשישי סגור"
            conflict = await client.put("/api/v1/admin/shop-settings", json=valid_draft())
            assert conflict.status_code == 409
            assert conflict.json()["code"] == "SHOP_SETTINGS_VERSION_CONFLICT"
            await bootstrap(settings.model_copy(update={"shipping_fee_agorot": 9000}))
            await seed_database(settings)
            await seed_database(settings)
            import os
            import subprocess
            import sys
            from pathlib import Path

            result = await asyncio.to_thread(
                subprocess.run,
                [str(Path(sys.executable).with_name("coffix-shop-settings-init"))],
                env={
                    **os.environ,
                    "APP_ENV": "test",
                    "DATABASE_URL": migrated_database_url,
                    "SHIPPING_FEE_AGOROT": "9000",
                },
                capture_output=True,
                text=True,
                check=True,
            )
            assert isinstance(result.stdout, str)
            assert "existing business values preserved" in result.stdout
            assert (await client.get("/api/v1/admin/shop-settings")).json() == saved.json()
            logs = (
                await client.get("/api/v1/admin/audit-logs?action=shop.settings_updated")
            ).json()
            assert len(logs) == 1
            assert logs[0]["before"]["shipping_fee_agorot"] == 3000
            assert logs[0]["after"]["shipping_fee_agorot"] == 0
            cleared = await client.put(
                "/api/v1/admin/shop-settings",
                json=valid_draft(2) | dict(phone=None, whatsapp=" ", email=None, opening_hours=""),
            )
            assert cleared.status_code == 200
            for key in ("phone", "whatsapp", "email", "opening_hours"):
                assert cleared.json()[key] is None
            app.dependency_overrides[get_current_actor] = lambda: customer
            assert (
                await client.put("/api/v1/admin/shop-settings", json=valid_draft(3))
            ).status_code == 403


@pytest.mark.asyncio
async def test_shipping_change_requires_review_and_preserves_checkout_replay(migrated_database_url):
    from test_orders import checkout_body

    from coffix.shop.bootstrap import bootstrap

    customer, _, admin, sku = await seed_order_api(migrated_database_url)
    settings = Settings(app_env="test", database_url=migrated_database_url)
    await bootstrap(settings)
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            app.dependency_overrides[get_current_actor] = lambda: customer
            cart = await client.post("/api/v1/cart/items", json={"sku_id": str(sku), "quantity": 1})
            assert cart.json()["shipping_agorot"] == 3000
            for invalid in (None, True, -1, 30.5, "3000"):
                invalid_body = checkout_body()
                if invalid is None:
                    invalid_body.pop("expected_shipping_agorot")
                else:
                    invalid_body["expected_shipping_agorot"] = invalid
                response = await client.post(
                    "/api/v1/checkout", json=invalid_body, headers={"Idempotency-Key": "invalid"}
                )
                assert response.status_code == 422
            app.dependency_overrides[get_current_actor] = lambda: admin
            await client.put(
                "/api/v1/admin/shop-settings", json=valid_draft() | {"shipping_fee_agorot": 4000}
            )
            app.dependency_overrides[get_current_actor] = lambda: customer
            stale = await client.post(
                "/api/v1/checkout",
                json=checkout_body() | {"expected_shipping_agorot": 3000},
                headers={"Idempotency-Key": "stale"},
            )
            assert stale.status_code == 409, stale.text
            assert stale.json()["code"] == "SHIPPING_FEE_CHANGED"
            assert (await client.get("/api/v1/orders")).json() == []
            assert (await client.get("/api/v1/cart")).json()["shipping_agorot"] == 4000
            body = checkout_body() | {"expected_shipping_agorot": 4000}
            created = await client.post(
                "/api/v1/checkout", json=body, headers={"Idempotency-Key": "reviewed"}
            )
            assert created.status_code == 201, created.text
            assert created.json()["order"]["total_agorot"] == 6500
            app.dependency_overrides[get_current_actor] = lambda: admin
            await client.put("/api/v1/admin/shop-settings", json=valid_draft(2))
            app.dependency_overrides[get_current_actor] = lambda: customer
            replay = await client.post(
                "/api/v1/checkout", json=body, headers={"Idempotency-Key": "reviewed"}
            )
            assert replay.json() == created.json()
            paid = await client.post(
                "/api/v1/test/payments/webhooks",
                json={
                    "event_id": "shop-settings-paid",
                    "event_type": "payment_intent.succeeded",
                    "provider_object_id": created.json()["payment"]["provider_payment_id"],
                    "state": "confirmed",
                },
            )
            assert paid.status_code == 200
            paid_order = (
                await client.get(f"/api/v1/orders/{created.json()['order']['id']}")
            ).json()
            assert paid_order["state"] == "paid"
            assert paid_order["shipping_agorot"] == 4000
            assert paid_order["total_agorot"] == 6500
            info = (await client.get("/api/v1/app-info")).json()
            assert info["email"] == "shop@example.com"
            assert info["address"]["city"] == "חיפה"
            assert "version" not in info


@pytest.mark.asyncio
async def test_audit_failure_rolls_back_every_setting(migrated_database_url):
    from sqlalchemy import event
    from sqlalchemy.orm import Session

    from coffix.notifications.models import AuditLog

    customer, _, admin, _ = await seed_order_api(migrated_database_url)
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))

    def reject_audit(session, *_):
        if any(
            isinstance(row, AuditLog) and row.action == "shop.settings_updated"
            for row in session.new
        ):
            raise RuntimeError("audit unavailable")

    async with app.router.lifespan_context(app):
        app.dependency_overrides[get_current_actor] = lambda: admin
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            before = (await client.get("/api/v1/admin/shop-settings")).json()
            event.listen(Session, "before_flush", reject_audit)
            try:
                with pytest.raises(RuntimeError, match="audit unavailable"):
                    await client.put("/api/v1/admin/shop-settings", json=valid_draft())
            finally:
                event.remove(Session, "before_flush", reject_audit)
            assert (await client.get("/api/v1/admin/shop-settings")).json() == before
            assert (
                await client.get("/api/v1/admin/audit-logs?action=shop.settings_updated")
            ).json() == []


@pytest.mark.asyncio
async def test_concurrent_edit_cannot_change_an_inflight_checkout_snapshot(
    migrated_database_url, monkeypatch
):
    import asyncio

    from test_orders import checkout_body

    customer, _, admin, sku = await seed_order_api(migrated_database_url)
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    entered, release = asyncio.Event(), asyncio.Event()
    async with app.router.lifespan_context(app):
        original = app.state.payment_provider.create_intent

        async def delayed(self, **kwargs):
            entered.set()
            await release.wait()
            return await original(**kwargs)

        monkeypatch.setattr(type(app.state.payment_provider), "create_intent", delayed)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            app.dependency_overrides[get_current_actor] = lambda: customer
            await client.post("/api/v1/cart/items", json={"sku_id": str(sku), "quantity": 1})
            pending = asyncio.create_task(
                client.post(
                    "/api/v1/checkout",
                    json=checkout_body(),
                    headers={"Idempotency-Key": "concurrent"},
                )
            )
            try:
                await asyncio.wait_for(entered.wait(), 5)
                app.dependency_overrides[get_current_actor] = lambda: admin
                saved = await client.put(
                    "/api/v1/admin/shop-settings",
                    json=valid_draft() | {"shipping_fee_agorot": 4000},
                )
                assert saved.status_code == 200
            finally:
                release.set()
            result = await pending
            assert result.status_code == 201, result.text
            assert result.json()["order"]["shipping_agorot"] == 3000
            assert result.json()["order"]["total_agorot"] == 5500


@pytest.mark.asyncio
async def test_shop_address_snapshots_and_intake_settings_are_independent(migrated_database_url):
    from test_service_requests import seed_service_api

    customer, _, admin, machine, _, model, _, _ = await seed_service_api(migrated_database_url)
    app = create_app(Settings(app_env="test", database_url=migrated_database_url))
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            app.dependency_overrides[get_current_actor] = lambda: admin
            intake = (await client.get("/api/v1/admin/service-intake-settings")).json()
            service_type = (
                await client.post(
                    "/api/v1/admin/service-types",
                    json=dict(
                        label_he="תיקון",
                        label_en="Repair",
                        diagnostic_fee_agorot=1000,
                        machine_model_ids=[str(model)],
                    ),
                )
            ).json()
            await client.put("/api/v1/admin/shop-settings", json=valid_draft())
            app.dependency_overrides[get_current_actor] = lambda: customer
            body = dict(
                service_type_id=service_type["id"],
                description="המכונה אינה עובדת",
                location_mode="bring_in",
            )
            old = await client.post(f"/api/v1/machines/{machine}/service-requests", json=body)
            assert old.status_code == 201, old.text
            app.dependency_overrides[get_current_actor] = lambda: admin
            changed = valid_draft(2)
            changed["shop_address"]["street"] = "הנמל"
            changed["opening_hours"] = "סגור בשישי"
            assert (
                await client.put("/api/v1/admin/shop-settings", json=changed)
            ).status_code == 200
            assert (await client.get("/api/v1/admin/service-intake-settings")).json() == intake
            shop = (await client.get("/api/v1/admin/shop-settings")).json()
            assert (
                await client.put(
                    "/api/v1/admin/service-intake-settings", json=intake | {"response_hours": 7}
                )
            ).status_code == 200
            assert (await client.get("/api/v1/admin/shop-settings")).json() == shop
            configuration = (await client.get("/api/v1/admin/configuration")).json()
            assert configuration["shop_address"]["street"] == "הנמל"
            app.dependency_overrides[get_current_actor] = lambda: customer
            fresh = await client.post(f"/api/v1/machines/{machine}/service-requests", json=body)
            assert fresh.status_code == 201, fresh.text
            assert fresh.json()["address_snapshot"]["street"] == "הנמל"
            assert (await client.get(f"/api/v1/service-requests/{old.json()['id']}")).json()[
                "address_snapshot"
            ]["street"] == "הרצל"
            assert (await client.get(f"/api/v1/machines/{machine}/service-options")).json()[
                "shop_address"
            ]["street"] == "הנמל"
