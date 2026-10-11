import "server-only";
import type { AuthEmailSender } from "@clubedge/auth-better-auth";
// clubedge:if email!=none
import { email } from "@/server/email";
// clubedge:end

/**
 * How Better Auth sends verification and password reset emails: through the email module, or
 * not at all without one, which turns both features off.
 */
export function authEmailSender(): AuthEmailSender | undefined {
  // A list, so the code reads the same with and without the email module's block.
  const senders: AuthEmailSender[] = [];
  // clubedge:if email!=none
  senders.push((message) => email.send(message));
  // clubedge:end
  return senders[0];
}
