import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UpdateScreen } from "./update-notice";

const url = "https://example.com/app";
const deadline = "2026-11-01T12:00:00.000Z";

function render(status: "required" | "upcoming" | "available", updateUrl: string | null) {
  const versions = {
    minimumVersion: "1.2.0",
    latestVersion: "1.4.0",
    updateUrl,
    nextMinimumVersion: status === "upcoming" ? "1.3.0" : null,
    nextMinimumFrom: status === "upcoming" ? deadline : null,
  };
  const update = { status, versions };
  return renderToStaticMarkup(createElement(UpdateScreen, { update, onDismiss: () => {} }));
}

describe("UpdateScreen", () => {
  it("keeps the app closed below the minimum version, with the update a tap away", () => {
    const html = render("required", url);
    expect(html).toContain("Update required");
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain(`href="${url}"`);
    expect(html).not.toContain("Not now");
  });

  it("keeps the app closed on a block remembered offline, before the API answers", () => {
    const update = { status: "required" as const, versions: null };
    const html = renderToStaticMarkup(createElement(UpdateScreen, { update, onDismiss: () => {} }));
    expect(html).toContain("Update required");
    expect(html).toContain("Get the update where you installed the app.");
  });

  it("says where to update when the API gives no address", () => {
    const html = render("required", null);
    expect(html).toContain("Get the update where you installed the app.");
    expect(html).not.toContain("href=");
  });

  it("says the date an announced minimum stops the app, and lets the user carry on", () => {
    const html = render("upcoming", url);
    const day = new Date(deadline).toLocaleDateString(undefined, { dateStyle: "long" });
    expect(html).toContain(`This version of the app stops working on ${day}.`);
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain("Not now");
    expect(html).not.toContain("aria-modal");
  });

  it("offers the update below the latest version, and lets the user carry on", () => {
    const html = render("available", url);
    expect(html).toContain("A new version of the app is available.");
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain("Not now");
    expect(html).not.toContain("aria-modal");
  });
});
