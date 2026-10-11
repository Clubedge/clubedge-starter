import { createFileRoute } from "@tanstack/react-router";
import { getBilling, isPaymentsConfigured, WebhookVerificationError } from "@/server/payments";

/**
 * The payment provider's webhook. The body is read as raw text, because the signature covers
 * the exact bytes. Each event is applied once; failures answer 500 so the provider retries.
 */
export const Route = createFileRoute("/api/webhooks/payments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isPaymentsConfigured()) {
          return Response.json({ error: "Payments are not configured." }, { status: 503 });
        }
        try {
          const result = await getBilling().handleWebhook({
            body: await request.text(),
            headers: request.headers,
          });
          return Response.json({ received: true, result });
        } catch (error) {
          if (error instanceof WebhookVerificationError) {
            return Response.json({ error: "Invalid signature." }, { status: 400 });
          }
          console.error("Payment webhook failed", error);
          return Response.json({ error: "Webhook failed." }, { status: 500 });
        }
      },
    },
  },
});
