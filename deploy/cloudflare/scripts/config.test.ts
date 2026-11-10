import { describe, expect, it } from "vitest";
import { apiAddress, withName, workerName } from "./config.mjs";

describe("the Worker's name", () => {
  it("is the project's package name, as Cloudflare takes names", () => {
    expect(workerName("my-app")).toBe("my-app");
    expect(workerName("@acme/My_App.web")).toBe("my-app-web");
    expect(workerName("--app--")).toBe("app");
    // A workers.dev address takes 63 characters, and no hyphen at either end.
    expect(workerName(`${"a".repeat(62)}-b`)).toBe("a".repeat(62));
  });

  it("falls back to a name when the package's leaves nothing", () => {
    expect(workerName("@acme/___")).toBe("web");
  });

  it("goes first in the configuration, so a name written there is used instead", () => {
    const config = `// A comment about { braces }.\n{\n  "main": "src/index.ts",\n}\n`;
    expect(withName(config, "my-app")).toBe(
      `// A comment about { braces }.\n{\n  "name": "my-app",\n  "main": "src/index.ts",\n}\n`,
    );
    const named = `{\n  "name": "other",\n}\n`;
    expect(withName(named, "my-app")).toBe(`{\n  "name": "my-app",\n  "name": "other",\n}\n`);
  });

  it("refuses a configuration it cannot name", () => {
    expect(() => withName(`{ "main": "src/index.ts" }`, "my-app")).toThrow(/opens it with \{/);
  });
});

describe("the API's address, for the website alone", () => {
  it("is the website's VITE_API_URL when that is a web address", () => {
    expect(apiAddress("https://my-app-api.onrender.com")).toBe("https://my-app-api.onrender.com");
    expect(apiAddress(" http://127.0.0.1:3001 ")).toBe("http://127.0.0.1:3001");
  });

  it("is missing when the variable is unset or not a web address", () => {
    expect(apiAddress(undefined)).toBeUndefined();
    expect(apiAddress("")).toBeUndefined();
    expect(apiAddress("my-app-api.onrender.com")).toBeUndefined();
    expect(apiAddress("ftp://my-app-api.onrender.com")).toBeUndefined();
  });
});
