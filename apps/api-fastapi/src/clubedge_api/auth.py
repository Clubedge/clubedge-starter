"""Default auth implementation for an API without an auth provider."""

from fastapi import Request

from clubedge_api.contract import User
from clubedge_api.routes import account  # clubedge:only auth!=none


async def get_current_user(
    request: Request,
    supabase_url: str | None = None,
    supabase_publishable_key: str | None = None,
) -> User | None:
    return None


# clubedge:if auth!=none
# An auth provider's file replaces this one, with these two working; the Starter's API uses
# them as they are here, so its account settings answer without a provider.
def can_delete_account() -> bool:
    return False


async def delete_account(
    deletion: account.ProviderAccountDeletion,
) -> account.AccountDeletionResult:
    return "not-supported"


# clubedge:end
