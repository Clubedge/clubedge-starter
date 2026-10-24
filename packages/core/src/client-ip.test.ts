import { describe, expect, it } from "vitest";
import { getClientIp, parseClientIpSettings } from "./client-ip";

const socketAddress = "192.0.2.10";
const forwarded = (value: string) => new Headers({ "x-forwarded-for": value });

describe("getClientIp", () => {
  it("uses the connection's address while no proxy is trusted", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.66",
      "x-real-ip": "198.51.100.67",
    });
    expect(getClientIp(headers, { socketAddress })).toBe(socketAddress);
  });

  it("counts trusted proxies from the end of x-forwarded-for, past what the client sent", () => {
    // The client sent 198.51.100.66 itself; the proxy in front appended the address it saw.
    const oneProxy = forwarded("198.51.100.66, 203.0.113.1");
    expect(getClientIp(oneProxy, { trustedHops: 1, socketAddress })).toBe("203.0.113.1");
    // Two proxies: the outer one appended the client's address, the inner one the outer proxy's.
    const twoProxies = forwarded("198.51.100.66, 203.0.113.1, 10.0.0.2");
    expect(getClientIp(twoProxies, { trustedHops: 2, socketAddress })).toBe("203.0.113.1");
  });

  it("falls back to the connection's address when fewer proxies added an entry", () => {
    expect(getClientIp(forwarded("203.0.113.1"), { trustedHops: 2, socketAddress })).toBe(
      socketAddress,
    );
    expect(getClientIp(new Headers(), { trustedHops: 1, socketAddress })).toBe(socketAddress);
  });

  it("trusts the nearest proxy where the runtime gives no connection address", () => {
    // Next.js runs behind a host's edge or a proxy, which appends the address it saw.
    expect(getClientIp(forwarded("198.51.100.66, 203.0.113.1"))).toBe("203.0.113.1");
    expect(getClientIp(forwarded("203.0.113.1, 10.0.0.2"), { trustedHops: 2 })).toBe("203.0.113.1");
  });

  it("answers unknown when nothing gives an address", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
    expect(getClientIp(forwarded("203.0.113.1"), { trustedHops: 2 })).toBe("unknown");
  });

  it("reads the host's own header first, and the connection's address without it", () => {
    const options = { header: "fly-client-ip", trustedHops: 1, socketAddress };
    const headers = new Headers({
      "fly-client-ip": " 203.0.113.7 ",
      "x-forwarded-for": "198.51.100.66, 10.0.0.2",
    });
    expect(getClientIp(headers, options)).toBe("203.0.113.7");
    expect(getClientIp(forwarded("198.51.100.66, 10.0.0.2"), options)).toBe(socketAddress);
  });

  it("bounds the identifier length", () => {
    expect(getClientIp(forwarded("a".repeat(500)), { trustedHops: 1 })).toHaveLength(64);
  });
});

describe("parseClientIpSettings", () => {
  it("reads CLIENT_IP_HEADER and TRUSTED_PROXY_HOPS, unset or empty meaning neither", () => {
    expect(parseClientIpSettings({})).toEqual({ trustedHops: 0 });
    expect(parseClientIpSettings({ CLIENT_IP_HEADER: "", TRUSTED_PROXY_HOPS: "" })).toEqual({
      trustedHops: 0,
    });
    expect(
      parseClientIpSettings({ CLIENT_IP_HEADER: " Fly-Client-IP ", TRUSTED_PROXY_HOPS: "2" }),
    ).toEqual({ header: "fly-client-ip", trustedHops: 2 });
  });

  it("refuses values that cannot be right", () => {
    expect(() => parseClientIpSettings({ CLIENT_IP_HEADER: "x real ip" })).toThrow(
      'CLIENT_IP_HEADER must be a header name, such as x-real-ip, not "x real ip"',
    );
    for (const hops of ["-1", "1.5", "one", "11"]) {
      expect(() => parseClientIpSettings({ TRUSTED_PROXY_HOPS: hops })).toThrow(
        `TRUSTED_PROXY_HOPS must be a whole number from 0 to 10, not "${hops}"`,
      );
    }
  });
});
