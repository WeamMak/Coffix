from uuid import uuid4

import pytest

from coffix.api.errors import ApiError
from coffix.auth.policies import CurrentActor, require_admin, require_customer
from coffix.users.models import Role


def test_role_rejects_multiple_roles() -> None:
    with pytest.raises(ValueError):
        Role("admin,technician")


def test_role_dependency_returns_matching_active_actor() -> None:
    actor = CurrentActor(user_id=uuid4(), role=Role.CUSTOMER)

    assert require_customer(actor) is actor


def test_role_dependency_rejects_wrong_role() -> None:
    actor = CurrentActor(user_id=uuid4(), role=Role.CUSTOMER)

    with pytest.raises(ApiError) as error:
        require_admin(actor)

    assert error.value.status == 403
    assert error.value.code == "forbidden"


def test_role_dependency_rejects_inactive_user() -> None:
    actor = CurrentActor(user_id=uuid4(), role=Role.CUSTOMER, is_active=False)

    with pytest.raises(ApiError) as error:
        require_customer(actor)

    assert error.value.status == 403
    assert error.value.code == "account_inactive"
