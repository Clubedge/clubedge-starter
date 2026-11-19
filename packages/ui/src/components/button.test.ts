import { describe, expect, it } from "vitest";
import { buttonVariants } from "./button";

describe("buttonVariants", () => {
  it("resolves border color conflicts in outline variant", () => {
    const classes = buttonVariants({ variant: "outline" });
    expect(classes).toContain("border-border");
    expect(classes).not.toContain("border-transparent");
  });

  it("retains border-transparent when no conflicting border color is set", () => {
    const classes = buttonVariants({ variant: "default" });
    expect(classes).toContain("border-transparent");
    expect(classes).toContain("bg-primary");
  });

  it("handles empty arguments using default variants", () => {
    const classes = buttonVariants();
    expect(classes).toContain("border-transparent");
    expect(classes).toContain("bg-primary");
    expect(classes).toContain("h-8");
  });

  it("merges custom className overrides correctly", () => {
    const classes = buttonVariants({
      variant: "outline",
      className: "border-red-500",
    });
    expect(classes).toContain("border-red-500");
    expect(classes).not.toContain("border-border");
    expect(classes).not.toContain("border-transparent");
  });
});
