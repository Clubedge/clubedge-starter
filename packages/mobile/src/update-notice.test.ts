import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UpdateScreen } from "./update-notice";

const url = "https://example.com/app";

function render(status: "required" | "available", updateUrl: string | null) {
  const versions = {
    minimumVersion: "1.2.0",
    latestVersion: "1.3.0",
    updateUrl,
    nextMinimumVersion: null,
    nextMinimumFrom: null,
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

  it("says where to update when the API gives no address", () => {
    const html = render("required", null);
    expect(html).toContain("Get the update where you installed the app.");
    expect(html).not.toContain("href=");
  });

  it("offers the update below the latest version, and lets the user carry on", () => {
    const html = render("available", url);
    expect(html).toContain("A new version of the app is available.");
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain("Not now");
    expect(html).not.toContain("aria-modal");
  });
});
