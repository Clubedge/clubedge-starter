import { createTransport } from "@sentry/node";
import { describe, expect, it } from "vitest";
import { createSentryObservability } from "./index";

// Sentry keeps one client per process, so a single provider serves every test here. Envelopes go
// to an in-memory transport instead of Sentry.
const envelopes: string[] = [];
const provider = createSentryObservability({
  dsn: "https://public@sentry.example.com/1",
  environment: "test",
  tracesSampleRate: 1,
  transport: (options) =>
    createTransport(options, async (request) => {
      envelopes.push(
        typeof request.body === "string" ? request.body : new TextDecoder().decode(request.body),
      );
      return { statusCode: 200 };
    }),
});

async function sent() {
  await provider.flush();
  const items = envelopes.splice(0).flatMap((envelope) =>
    envelope
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>),
  );
  return items;
}

describe("createSentryObservability", () => {
  it("captures reported errors with the message and attributes", async () => {
    provider.reportError(new TypeError("bad input"), {
      message: "Payment webhook failed",
      attributes: { provider: "stripe", skipped: undefined },
    });

    const event = (await sent()).find((item) => "exception" in item) as {
      exception: { values: Array<{ type: string; value: string }> };
      tags: Record<string, string>;
      extra: Record<string, string>;
      environment: string;
    };
    expect(event.exception.values[0]).toMatchObject({ type: "TypeError", value: "bad input" });
    expect(event.tags).toMatchObject({ provider: "stripe" });
    expect(event.tags).not.toHaveProperty("skipped");
    expect(event.extra).toMatchObject({ message: "Payment webhook failed" });
    expect(event.environment).toBe("test");
  });

  it("sends traced work as spans and rethrows failures", async () => {
    await expect(provider.traced("email.send", async () => "sent", { to: "a" })).resolves.toBe(
      "sent",
    );
    await expect(
      provider.traced("jobs.enqueue", async () => {
        throw new Error("queue down");
      }),
    ).rejects.toThrow("queue down");

    // Sentry streams spans as "span" envelope items, in batches of { items: [...] }.
    const spans = (await sent()).flatMap(
      (item) => (item.items as Array<{ name: string; status: string }> | undefined) ?? [],
    );
    expect(spans.map((span) => span.name).sort()).toEqual(["email.send", "jobs.enqueue"]);
    expect(spans.find((span) => span.name === "email.send")?.status).toBe("ok");
    expect(spans.find((span) => span.name === "jobs.enqueue")?.status).toBe("error");
  });
});
