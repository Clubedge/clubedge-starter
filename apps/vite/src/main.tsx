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
// update checks, whose requests say which version of the app they come from, push notifications,
// and the banner of a demo build.
if (import.meta.env.MODE === "app") {
  void import("@clubedge/mobile/update-notice").then(({ showUpdateNotice }) =>
    showUpdateNotice(api),
  );
  // Notifications: their token goes to the API again, and a tapped one opens its page. // clubedge:only push=native
  const openPage = (href: string) => void router.navigate({ href }); // clubedge:only push=native
  void import("@clubedge/mobile/push").then(({ startPush }) => startPush(api, openPage)); // clubedge:only push=native
  if (import.meta.env.VITE_DEMO === "true") {
    void import("@clubedge/mobile/demo/banner").then(({ showDemoBanner }) => showDemoBanner());
  }
}
// clubedge:end
