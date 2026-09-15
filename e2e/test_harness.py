"""Startup boundary: test controls must never be enabled outside the isolated runner."""

import pytest
from pydantic import ValidationError

from coffix.core.settings import Settings


@pytest.mark.parametrize("environment", ["local", "dev", "prod"])
def test_control_secret_rejected_outside_test(environment):
    with pytest.raises(ValidationError, match="E2E controls require APP_ENV=test"):
        Settings(_env_file=None, app_env=environment, e2e_control_secret="x" * 32)


def test_test_controls_require_fake_providers():
    with pytest.raises(ValidationError, match="E2E controls require fake providers"):
        Settings(
            _env_file=None,
            app_env="test",
            e2e_control_secret="x" * 32,
            payment_provider="stripe",
            stripe_secret_key="test",
            stripe_webhook_secret="test",
        )


def test_runner_refuses_missing_isolation_marker(monkeypatch):
    monkeypatch.delenv("COFFIX_E2E_RUN_ID", raising=False)
    from e2e.server import create_e2e_app

    with pytest.raises(ValueError, match="isolated"):
        create_e2e_app(Settings(_env_file=None, app_env="test", e2e_control_secret="x" * 32))


def test_ready_check_accepts_current_migration_head():
    from pathlib import Path

    from alembic.config import Config
    from alembic.script import ScriptDirectory

    from coffix.health.checks import EXPECTED_MIGRATION_REVISION

    config = Config()
    config.set_main_option("script_location", str(Path(__file__).parents[1] / "backend/migrations"))
    assert EXPECTED_MIGRATION_REVISION == ScriptDirectory.from_config(config).get_current_head()


def test_runner_refuses_unisolated_redis(monkeypatch):
    from e2e.server import create_e2e_app

    run_id = "a" * 16
    monkeypatch.setenv("COFFIX_E2E_RUN_ID", run_id)
    with pytest.raises(ValueError, match="isolated"):
        create_e2e_app(
            Settings(
                _env_file=None,
                app_env="test",
                e2e_control_secret="x" * 32,
                database_url=f"postgresql+asyncpg://coffix_e2e:password@127.0.0.1:6543/coffix_e2e_{run_id}",
                media_local_root=f"/tmp/coffix-e2e-{run_id}/media",
                redis_url="redis://127.0.0.1:6379/0",
            )
        )
