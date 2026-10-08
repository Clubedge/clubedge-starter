export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    service: "clubedge-starter",
    timestamp: new Date().toISOString(),
  });
}
