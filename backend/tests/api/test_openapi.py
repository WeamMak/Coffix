import subprocess
from pathlib import Path

from coffix.api.app import create_app
from coffix.core.settings import Settings

REPOSITORY_ROOT = Path(__file__).parents[3]
COMMITTED_CLIENT = REPOSITORY_ROOT / "packages" / "api-client"


def test_v1_operation_ids_are_unique_and_explicitly_frozen() -> None:
    schema = create_app(Settings(app_env="test")).openapi()
    operations = [
        operation
        for path, path_item in schema["paths"].items()
        if path.startswith("/api/v1")
        for method, operation in path_item.items()
        if method in {"get", "post", "put", "patch", "delete"}
    ]
    operation_ids = [operation["operationId"] for operation in operations]

    assert operation_ids
    assert len(operation_ids) == len(set(operation_ids))


def test_generated_api_client_has_no_drift(tmp_path: Path) -> None:
    subprocess.run(
        [str(REPOSITORY_ROOT / "scripts" / "generate-api-client.sh"), str(tmp_path)],
        cwd=REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )

    assert (tmp_path / "openapi.json").read_text() == (
        COMMITTED_CLIENT / "openapi.json"
    ).read_text()
    assert (tmp_path / "src" / "generated.ts").read_text() == (
        COMMITTED_CLIENT / "src" / "generated.ts"
    ).read_text()
