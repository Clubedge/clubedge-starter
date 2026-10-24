// The account settings: the display name lives in the app's users row, and deleting an account
// removes that row (and what references it) before the auth provider deletes the user.
import type { User } from "@clubedge/contract";
import { deleteUserProfile, ensureUserId, getDisplayName, setDisplayName } from "@clubedge/db";
import type { AccountService } from "@/routes/account";
import { canDeleteAccount, deleteAccount } from "./auth";
import { getDb } from "./db";
// clubedge:if payments=stripe
import { findSubscription, isEntitled } from "./payments";
// clubedge:end

/** The app-owned users row for the user, created on first use. */
const profileId = (user: User) => ensureUserId(getDb(), { authUserId: user.id, email: user.email });

export const account: AccountService = {
  canDeleteAccount,
  async getDisplayName(user) {
    return getDisplayName(getDb(), await profileId(user));
  },
  async setDisplayName(user, displayName) {
    await setDisplayName(getDb(), await profileId(user), displayName);
  },
  async deleteAccount({ user, password, request }) {
    // clubedge:if payments=stripe
    // A deleted account cannot manage its billing, so an active subscription is cancelled first.
    // The subscription is read from the database, so this holds even without the Stripe keys.
    const subscription = await findSubscription(getDb(), await profileId(user));
    if (isEntitled(subscription)) return "active-subscription";
    // clubedge:end
    return deleteAccount({
      user,
      password,
      request,
      // Runs once the password is confirmed: if the profile cannot be removed, nothing is deleted.
      beforeDelete: () => deleteUserProfile(getDb(), user.id),
    });
  },
};
