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
  signOut(): Promise<void>;
}
