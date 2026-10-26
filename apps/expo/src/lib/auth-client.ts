/** Why an account action failed, as the settings screen words it. */
export type AccountErrorCode = "invalid-password" | "invalid-input" | "rate-limited";

/** Why signing out everywhere failed: the user is still signed in on their other devices. */
export const signOutEverywhereFailed =
  "Your other devices could not be signed out. Check your connection, then try again.";

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

// clubedge:if framework!=none
/**
 * What the app needs from the sign-in provider. Emailed links (confirming the address, resetting
 * the password) open the website, which handles them; the user then signs in here.
 */
// clubedge:end
// clubedge:if framework=none
/**
 * What the app needs from the sign-in provider. Emailed links (confirming the address, resetting
 * the password) open this app at the address the screen asks for (`redirectTo`), through its
 * scheme: sign-in, and the reset screen.
 */
// clubedge:end
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
  /**
   * needsConfirmation: the user opens the emailed link before signing in. `redirectTo` is where
   * the link leads once it has confirmed the address; the provider's own setting without it.
   */
  signUp(request: {
    email: string;
    password: string;
    redirectTo?: string;
  }): Promise<{ needsConfirmation: boolean }>;
  /** Emails a reset link, which leads to `redirectTo` once checked; the website's page without it. */
  requestPasswordReset(request: { email: string; redirectTo?: string }): Promise<void>;
  // clubedge:if framework=none
  /**
   * Sets a new password with what the emailed reset link carries, from the address it opened this
   * app at. Resolves whether that also signed this device in.
   */
  resetPassword(link: string, newPassword: string): Promise<{ signedIn: boolean }>;
  // clubedge:end
  /**
   * Checks the current password and sets the new one, keeping this device signed in and signing
   * out the user's other sessions. Throws AccountError for a wrong password, a refused new one,
   * or the provider's rate limit.
   */
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  /**
   * Ends the session; the device forgets it even when the server could not be reached.
   * `everywhere` also ends the user's sessions on their other devices, and throws when the server
   * cannot be reached, so the user knows they are still signed in there.
   */
  signOut(options?: { everywhere?: boolean }): Promise<void>;
}
