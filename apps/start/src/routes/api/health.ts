import { createFileRoute } from "@tanstack/react-router";
import { siteConfig } from "@/config/site";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () =>
        Response.json({
          status: "ok",
          service: siteConfig.serviceId,
          timestamp: new Date().toISOString(),
        }),
    },
  },
});
