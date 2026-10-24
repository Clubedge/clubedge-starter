/** Why an account action failed, as the settings page words it. */
export type AccountErrorCode =
  "invalid-password" | "invalid-input" | "rate-limited" | "unavailable";

/** An account action the provider refused, for a reason the user can act on. */
export class AccountError extends Error {
  override name = "AccountError";
  constructor(readonly code: AccountErrorCode) {
    super(`The account action failed: ${code}.`);
  }
}

/** The browser-facing authentication operations shared by the provider variants. */
export interface AuthClient {
  configured: boolean;
  getAccessToken(): Promise<string | undefined>;
  signIn(email: string, password: string): Promise<void>;
  signUp(
    email: string,
    password: string,
    returnUrl: string,
  ): Promise<{ needsConfirmation: boolean }>;
  requestPasswordReset(email: string, returnUrl: string): Promise<void>;
  resetPassword(password: string, params: URLSearchParams): Promise<void>;
  completeEmailVerification?(params: URLSearchParams): Promise<void>;
  /**
   * Checks the current password and sets the new one with the provider, keeping this browser
   * signed in and signing out the user's other sessions. Throws AccountError for a wrong
   * password, a refused new one, or the provider's rate limit.
   */
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  signOut(): Promise<void>;
}
