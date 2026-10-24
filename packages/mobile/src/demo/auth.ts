// The demo's sign-in, in place of the app's authentication provider (@/lib/auth) in a demo build:
// any email and password sign in, and nothing leaves the device.
import { demo } from "./state";

/** An action the demo leaves out; its banner says so too. */
function unavailable(action: string): never {
  throw new Error(`${action} is off in the demo: sign in with any email and password.`);
}

/** The operations the app's pages call (src/lib/auth-client.ts), answered in memory. */
export const authClient = {
  configured: true,
  async getAccessToken(): Promise<string | undefined> {
    return undefined;
  },
  async signIn(email: string) {
    demo.user = { id: "demo-user", email: email.trim(), displayName: null };
  },
  async signUp(): Promise<{ needsConfirmation: boolean }> {
    return unavailable("Sign-up");
  },
  async requestPasswordReset() {
    unavailable("Password reset");
  },
  async resetPassword() {
    unavailable("Password reset");
  },
  // Any password signs in, so there is none to check or keep.
  async changePassword() {},
  async signOut() {
    demo.user = null;
  },
};

export const getAccessToken = () => authClient.getAccessToken();
