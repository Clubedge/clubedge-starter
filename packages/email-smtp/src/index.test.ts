import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { createSmtpEmail, TIMEOUTS } from "./index";

/** A minimal SMTP server that accepts one message and records it. */
function fakeSmtpServer() {
  const received: string[] = [];
  const server = createServer((socket) => {
    let data = false;
    let message = "";
    socket.write("220 fake ESMTP\r\n");
    socket.on("data", (chunk) => {
      for (const line of chunk.toString().split("\r\n").filter(Boolean)) {
        if (data) {
          if (line === ".") {
            data = false;
            received.push(message);
            socket.write("250 queued\r\n");
          } else message += `${line}\n`;
          continue;
        }
        const command = line.slice(0, 4).toUpperCase();
        if (command === "EHLO" || command === "HELO") socket.write("250 fake\r\n");
        else if (command === "DATA") {
          data = true;
          socket.write("354 go on\r\n");
        } else if (command === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
  });
  return new Promise<{ port: number; received: string[]; close: () => void }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        port: typeof address === "object" && address ? address.port : 0,
        received,
        close: () => server.close(),
      });
    });
  });
}

describe("createSmtpEmail", () => {
  it("sends the message with the configured sender", async () => {
    const smtp = await fakeSmtpServer();
    try {
      const email = createSmtpEmail({
        url: `smtp://127.0.0.1:${smtp.port}`,
        from: "Clubedge <no-reply@example.com>",
      });
      await email.verify();
      await email.send({
        to: "ada@example.com",
        subject: "Reset your password",
        text: "Open the link.",
      });

      expect(smtp.received).toHaveLength(1);
      expect(smtp.received[0]).toContain("From: Clubedge <no-reply@example.com>");
      expect(smtp.received[0]).toContain("To: ada@example.com");
      expect(smtp.received[0]).toContain("Subject: Reset your password");
      expect(smtp.received[0]).toContain("Open the link.");
    } finally {
      smtp.close();
    }
  });

  it("gives up on a server that never answers, in seconds rather than minutes", async () => {
    // It takes the connection and says nothing, as a port a host silently drops.
    const silent = createServer(() => {});
    await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
    const address = silent.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      const email = createSmtpEmail({
        url: `smtp://127.0.0.1:${port}`,
        from: "no-reply@example.com",
        timeouts: { greetingMs: 300 },
      });
      const started = Date.now();
      await expect(
        email.send({ to: "ada@example.com", subject: "Hello", text: "Hello." }),
      ).rejects.toThrow(/greeting|timeout/i);
      expect(Date.now() - started).toBeLessThan(5_000);
    } finally {
      silent.close();
    }
  });

  it("lets the URL say its own wait, as a query", async () => {
    const silent = createServer(() => {});
    await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
    const address = silent.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      const email = createSmtpEmail({
        url: `smtp://127.0.0.1:${port}?greetingTimeout=300`,
        from: "no-reply@example.com",
      });
      const started = Date.now();
      await expect(email.verify()).rejects.toThrow(/greeting|timeout/i);
      expect(Date.now() - started).toBeLessThan(5_000);
    } finally {
      silent.close();
    }
  });

  it("waits seconds, not nodemailer's minutes, unless told otherwise", () => {
    expect(TIMEOUTS).toEqual({ connectMs: 10_000, greetingMs: 10_000, idleMs: 20_000 });
  });

  it("fails verification when no server listens", async () => {
    const email = createSmtpEmail({ url: "smtp://127.0.0.1:1", from: "no-reply@example.com" });
    await expect(email.verify()).rejects.toThrow();
  });
});
