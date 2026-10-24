import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
// clubedge:if observability!=none
import { ErrorReporting } from "@/components/error-reporting";
// clubedge:end
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
