import { describe, expect, it, vi } from "vitest";
import { createConsoleEmail, createMemoryEmail, parseSender } from "./index";

describe("createConsoleEmail", () => {
  it("prints the recipient, subject, and text instead of sending", async () => {
    const log = vi.fn();
    await createConsoleEmail(log).send({
      to: "ada@example.com",
      subject: "Reset your password",
      text: "Open https://app.example/reset?token=abc",
      html: "<p>ignored</p>",
    });
    expect(log).toHaveBeenCalledWith(
      "Email to ada@example.com: Reset your password\n\nOpen https://app.example/reset?token=abc\n",
    );
  });
});

describe("createMemoryEmail", () => {
  it("keeps every message it sends", async () => {
    const email = createMemoryEmail();
    await email.send({ to: "a@example.com", subject: "One", text: "1" });
    await email.send({ to: "b@example.com", subject: "Two", text: "2" });
    expect(email.sent.map((message) => message.subject)).toEqual(["One", "Two"]);
  });
});

describe("parseSender", () => {
  it("reads named and bare senders", () => {
    expect(parseSender("Clubedge <no-reply@example.com>")).toEqual({
      name: "Clubedge",
      address: "no-reply@example.com",
    });
    expect(parseSender(" no-reply@example.com ")).toEqual({ address: "no-reply@example.com" });
    expect(parseSender("<no-reply@example.com>")).toEqual({ address: "no-reply@example.com" });
  });

  it("rejects values that are not an address", () => {
    expect(() => parseSender("Clubedge")).toThrow("EMAIL_FROM must be an address");
    expect(() => parseSender("a b@example.com")).toThrow("EMAIL_FROM must be an address");
  });
});
