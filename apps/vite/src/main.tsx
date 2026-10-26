import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
// clubedge:if observability!=none
import { ErrorReporting } from "@/components/error-reporting";
// clubedge:end
import { api } from "@/lib/api"; // clubedge:only shell!=none
import { router } from "./router";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element.");

createRoot(root).render(
  <StrictMode>
    {/* clubedge:if observability!=none */}
    <ErrorReporting />
    {/* clubedge:end */}
    <RouterProvider router={router} />
  </StrictMode>,
);

// clubedge:if shell!=none
// The mobile app's own notices, which only its build loads, so the website never has them: the
// update checks, whose requests say which version of the app they come from, and the banner of a
// demo build.
if (import.meta.env.MODE === "app") {
  void import("@clubedge/mobile/update-notice").then(({ showUpdateNotice }) => showUpdateNotice(api));
  if (import.meta.env.VITE_DEMO === "true") {
    void import("@clubedge/mobile/demo/banner").then(({ showDemoBanner }) => showDemoBanner());
  }
}
// clubedge:end
