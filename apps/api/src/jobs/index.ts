import type { JobDefinition } from "@clubedge/jobs";
// clubedge:if email!=none
import type { EmailMessage } from "@clubedge/email";
import { defineJob } from "@clubedge/jobs";
import { email } from "@/server/email";
// clubedge:end
import { sampleJob } from "./sample";

export { sampleJob };

// clubedge:if email!=none
/**
 * Sends an email in the background: enqueue it with the message, so a slow or failing email
 * provider never delays a request, and failed sends are retried with backoff.
 */
export const sendEmailJob = defineJob<EmailMessage>({
  name: "send-email",
  retryLimit: 5,
  retryDelaySeconds: 30,
  retryBackoff: true,
  async run(message) {
    await email.send(message);
  },
});

// clubedge:end
/** Every job the worker runs. Define a job in this folder, then add it here. */
export const jobs: JobDefinition[] = [sampleJob];
// clubedge:if email!=none
jobs.push(sendEmailJob);
// clubedge:end
