import { siteConfig } from "@/config/site";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    service: siteConfig.serviceId,
    timestamp: new Date().toISOString(),
  });
}
