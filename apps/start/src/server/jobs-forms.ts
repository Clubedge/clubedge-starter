import "@tanstack/react-start/server-only";
import { sampleJob } from "@/jobs";
import { getCurrentUser, isAuthConfigured } from "./auth";
import { getJobs } from "./jobs";

/** Who the sample job runs for: the signed-in user's email, or "anonymous". */
export async function sampleJobRequester(): Promise<string> {
  const user = isAuthConfigured() ? await getCurrentUser() : null;
  return user?.email ?? "anonymous";
}

/** The jobs card's form: queues the sample job; repeated clicks within seconds are ignored. */
export async function handleSampleJob(): Promise<Response> {
  const requestedBy = await sampleJobRequester();
  await getJobs().enqueue(sampleJob, { requestedBy }, { key: requestedBy, throttleSeconds: 2 });
  return new Response(null, { status: 303, headers: { Location: "/dashboard" } });
}
