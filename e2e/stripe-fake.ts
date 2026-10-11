// A stand-in for the few Stripe API endpoints the app calls, so the payment flow can run end to
// end without Stripe. The app talks to it through STRIPE_API_BASE; webhooks are signed the way
// Stripe signs them, with STRIPE_WEBHOOK_SECRET.
import { createHmac } from "node:crypto";
import { createServer } from "node:http";

const appUrl = "http://127.0.0.1:3000";

export interface FakeStripe {
  /** What the app sent when it started checkout. */
  checkout: { userId: string; price: string; customer: string | null } | null;
  stop(): Promise<void>;
}

const json = (body: unknown) => JSON.stringify(body);

export async function startFakeStripe(
  port = Number(new URL(process.env.STRIPE_API_BASE!).port),
): Promise<FakeStripe> {
  const state: FakeStripe = { checkout: null, stop: async () => {} };
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const form = new URLSearchParams(body);
      const path = request.url?.split("?")[0];
      response.setHeader("content-type", "application/json");
      if (request.method === "POST" && path === "/v1/checkout/sessions") {
        state.checkout = {
          userId: form.get("client_reference_id") ?? "",
          price: form.get("line_items[0][price]") ?? "",
          customer: form.get("customer"),
        };
        response.end(
          json({
            id: "cs_e2e",
            object: "checkout.session",
            url: `${appUrl}/dashboard?billing=success`,
          }),
        );
      } else if (request.method === "POST" && path === "/v1/billing_portal/sessions") {
        response.end(
          json({
            id: "bps_e2e",
            object: "billing_portal.session",
            url: `${appUrl}/dashboard?billing=portal`,
          }),
        );
      } else if (request.method === "GET" && path === "/v1/subscriptions/sub_e2e") {
        response.end(
          json({
            id: "sub_e2e",
            object: "subscription",
            customer: "cus_e2e",
            status: "active",
            cancel_at_period_end: false,
            metadata: { userId: state.checkout?.userId ?? "" },
            items: {
              object: "list",
              data: [
                {
                  id: "si_e2e",
                  price: { id: state.checkout?.price },
                  current_period_end: 1_893_456_000,
                },
              ],
            },
          }),
        );
      } else {
        response.statusCode = 404;
        response.end(
          json({ error: { message: `The fake Stripe API has no ${request.method} ${path}.` } }),
        );
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  state.stop = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return state;
}

/** A webhook request body and its Stripe-Signature header. */
export function signedWebhook(event: object, secret = process.env.STRIPE_WEBHOOK_SECRET!) {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return {
    data: body,
    headers: {
      "content-type": "application/json",
      "stripe-signature": `t=${timestamp},v1=${signature}`,
    },
  };
}
