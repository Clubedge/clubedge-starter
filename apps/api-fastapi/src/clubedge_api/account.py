"""The account settings: the display name lives in the app's users row, and deleting an account
removes that row (and what references it) before the auth provider deletes the user."""

from clubedge_api import auth, users
from clubedge_api.contract import User
from clubedge_api.payments import has_active_subscription  # clubedge:only payments=stripe
from clubedge_api.routes.account import AccountDeletionResult, ProviderAccountDeletion


class AccountSettings:
    """The AccountService of the account routes (routes/account.py)."""

    def can_delete_account(self) -> bool:
        return auth.can_delete_account()

    async def get_display_name(self, user: User) -> str | None:
        return await users.get_display_name(await users.ensure_user_id(user))

    async def set_display_name(self, user: User, display_name: str | None) -> None:
        await users.set_display_name(await users.ensure_user_id(user), display_name)

    async def delete_account(self, user: User, password: str) -> AccountDeletionResult:
        # clubedge:if payments=stripe
        # A deleted account cannot manage its billing, so an active subscription is cancelled
        # first. The subscription is read from the database, so this holds without Stripe's keys.
        if await has_active_subscription(await users.ensure_user_id(user)):
            return "active-subscription"
        # clubedge:end
        return await auth.delete_account(
            ProviderAccountDeletion(
                user=user,
                password=password,
                # Runs once the password is confirmed: if the profile cannot be removed, nothing
                # is deleted.
                before_delete=lambda: users.delete_user_profile(user["id"]),
            )
        )
