import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

/** Shows `notice` above the app's page, in a React root of its own. */
export function showAbovePage(notice: ReactNode) {
  const container = document.createElement("div");
  document.body.prepend(container);
  createRoot(container).render(notice);
}
