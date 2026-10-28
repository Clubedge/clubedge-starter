import { describeEmail } from "@clubedge/email/conformance";
import { createResendEmail } from "./index";

// Against Resend's real API: RESEND_API_KEY, and EMAIL_FROM on a domain verified in Resend.
// Recipients go to Resend's test inbox address, so nothing is sent to a real person.
const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM || "Clubedge <onboarding@resend.dev>";

describeEmail(
  "resend",
  () => ({
    from,
    email: (from) => createResendEmail({ apiKey: apiKey!, from }),
    recipient: () => "delivered@resend.dev",
    broken: () => createResendEmail({ apiKey: "invalid-key", from }),
  }),
  { skip: !apiKey && "RESEND_API_KEY is not set", timeoutMs: 60_000 },
);
