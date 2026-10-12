import "@tanstack/react-start/server-only";
import type { AuthEmailSender } from "@clubedge/auth-better-auth";
// clubedge:if email!=none && jobs=none
import { email } from "@/server/email";
// clubedge:end
// clubedge:if email!=none && jobs!=none
import { sendEmailJob } from "@/jobs";
import { getJobs } from "@/server/jobs";
// clubedge:end

/**
 * How Better Auth sends verification and password reset emails: through the email module, or
 * not at all without one, which turns both features off.
 */
export function authEmailSender(): AuthEmailSender | undefined {
  // A list, so the code reads the same with and without the email module's block.
  const senders: AuthEmailSender[] = [];
  // clubedge:if email!=none && jobs=none
  senders.push((message) => email.send(message));
  // clubedge:end
  // clubedge:if email!=none && jobs!=none
  // Queued as a background job: sign-up does not wait for the email provider, and a failed send
  // is retried.
  senders.push(async (message) => {
    await getJobs().enqueue(sendEmailJob, message);
  });
  // clubedge:end
  return senders[0];
}
