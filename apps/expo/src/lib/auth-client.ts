/** Why an account action failed, as the settings screen words it. */
export type AccountErrorCode = "invalid-password" | "invalid-input" | "rate-limited";

/** An account action the provider refused, for a reason the user can act on. */
export class AccountError extends Error {
  override name = "AccountError";
  constructor(readonly code: AccountErrorCode) {
    super(`The account action failed: ${code}.`);
  }
}

/** Signing in was refused until the user opens the link emailed at sign-up. */
export class EmailNotVerifiedError extends Error {
  override name = "EmailNotVerifiedError";
  constructor() {
    super("Your email is not verified yet: open the link we sent you, then sign in.");
  }
}

/**
 * What the app needs from the sign-in provider. Emailed links (confirming the address, resetting
 * the password) open the website, which handles them; the user then signs in here.
 */
export interface AuthClient {
  /** Whether the provider's settings are in the app's env file. */
  configured: boolean;
  /**
   * Whether this device holds a session: the provider's answer or, when it cannot be reached,
   * whether the device still keeps one, so a phone offline stays signed in.
   */
  hasSession(): Promise<boolean>;
  /** Calls back when the provider renews or ends the session by itself; returns how to stop. */
  onChange?(listener: () => void): () => void;
  /** The headers that carry the session to the API: a bearer token, or the session cookie. */
  sessionHeaders(): Promise<Record<string, string>>;
  signIn(email: string, password: string): Promise<void>;
  /** needsConfirmation: the user opens the emailed link before signing in. */
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  requestPasswordReset(email: string): Promise<void>;
  /**
   * Checks the current password and sets the new one, keeping this device signed in and signing
   * out the user's other sessions. Throws AccountError for a wrong password, a refused new one,
   * or the provider's rate limit.
   */
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  /** Ends the session; the device forgets it even when the server could not be reached. */
  signOut(): Promise<void>;
}
