import { describe, expect, it, vi } from "vitest";
import { createResendEmail } from "./index";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createResendEmail", () => {
  it("posts the message to Resend with the API key", async () => {
    const request = vi.fn(async () => json(200, { id: "email-1" }));
    const email = createResendEmail({
      apiKey: "re_test",
      from: "Clubedge <hi@example.com>",
      fetch: request,
    });

    await email.send({ to: "ada@example.com", subject: "Hi", text: "Hello", html: "<p>Hello</p>" });

    expect(request).toHaveBeenCalledWith("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: "Bearer re_test", "content-type": "application/json" },
      body: JSON.stringify({
        from: "Clubedge <hi@example.com>",
        to: ["ada@example.com"],
        subject: "Hi",
        text: "Hello",
        html: "<p>Hello</p>",
      }),
    });
  });

  it("reports Resend's error when sending fails", async () => {
    const request = vi.fn(async () => json(422, { message: "The from address is not verified" }));
    const email = createResendEmail({ apiKey: "re_test", from: "hi@example.com", fetch: request });
    await expect(
      email.send({ to: "ada@example.com", subject: "Hi", text: "Hello" }),
    ).rejects.toThrow("Resend could not send the email (422)");
  });

  it("accepts full-access and sending-only keys and rejects invalid ones", async () => {
    const verify = (response: Response) =>
      createResendEmail({
        apiKey: "re_test",
        from: "hi@example.com",
        fetch: async () => response,
      }).verify();
    await expect(verify(json(200, { data: [] }))).resolves.toBeUndefined();
    await expect(verify(json(401, { name: "restricted_api_key" }))).resolves.toBeUndefined();
    await expect(
      verify(json(400, { name: "validation_error", message: "API key is invalid" })),
    ).rejects.toThrow("Resend could not verify the API key (400)");
  });

  it("refuses a sender that is not an address", () => {
    expect(() => createResendEmail({ apiKey: "re_test", from: "Clubedge" })).toThrow("EMAIL_FROM");
  });
});
