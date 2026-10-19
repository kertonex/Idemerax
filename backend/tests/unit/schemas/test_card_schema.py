import pytest
from pydantic import ValidationError

from app.schemas.card import CardCreateRequest, CardStatusUpdateRequest


def test_card_create_request_accepts_only_account_id() -> None:
    """Accept the account link and reject client-controlled card attributes."""
    assert CardCreateRequest(account_id=5).account_id == 5

    with pytest.raises(ValidationError):
        CardCreateRequest.model_validate(
            {
                "account_id": 5,
                "status": "ACTIVE",
            }
        )


@pytest.mark.parametrize("account_id", [0, -1])
def test_card_create_request_rejects_invalid_account_ids(
    account_id: int,
) -> None:
    with pytest.raises(ValidationError):
        CardCreateRequest(account_id=account_id)


def test_card_status_request_accepts_only_supported_states() -> None:
    """Accept supported statuses and reject an unsupported status."""
    assert CardStatusUpdateRequest(status="ACTIVE").status == "ACTIVE"
    assert CardStatusUpdateRequest(status="INACTIVE").status == "INACTIVE"

    with pytest.raises(ValidationError):
        CardStatusUpdateRequest.model_validate({"status": "BLOCKED"})
