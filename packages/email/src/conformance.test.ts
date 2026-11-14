import { describeEmail } from "./conformance";
import { createMemoryEmail, parseSender } from "./index";

// The in-memory reference provider, so the shared suite always runs somewhere without a service.
// It validates senders with parseSender, the same check real providers make at construction.
describeEmail("memory", async () => {
  const email = createMemoryEmail();
  return {
    from: "App <no-reply@example.com>",
    email: (from) => {
      parseSender(from);
      return email;
    },
    delivered: async (to, subject) =>
      email.sent.some((message) => message.to === to && message.subject === subject),
    broken: () => ({
      send: async () => {
        throw new Error("the email service is down");
      },
    }),
  };
});
