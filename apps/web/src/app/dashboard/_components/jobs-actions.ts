"use server";

import { revalidatePath } from "next/cache";
import { sampleJob } from "@/jobs";
import { getCurrentUser } from "@/server/auth";
import { getJobs } from "@/server/jobs";

/** Queues the sample job for the current user; repeated clicks within seconds are ignored. */
export async function runSampleJob() {
  const user = await getCurrentUser();
  const requestedBy = user?.email ?? "anonymous";
  await getJobs().enqueue(sampleJob, { requestedBy }, { key: requestedBy, throttleSeconds: 2 });
  revalidatePath("/dashboard");
}
