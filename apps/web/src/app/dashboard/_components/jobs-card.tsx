import { ListChecks } from "lucide-react";

import { runSampleJob } from "./jobs-actions";
import { sampleJob } from "@/jobs";
import type { AuthUser } from "@/server/auth";
import { getJobs, isWorkerEnabled, type JobRecord } from "@/server/jobs";
import { Badge } from "@clubedge/ui/components/badge";
import { Button } from "@clubedge/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@clubedge/ui/components/card";
import { reportError } from "@clubedge/core";

const timeFormat = new Intl.DateTimeFormat("en", { timeStyle: "medium", timeZone: "UTC" });

async function recentJobs(requestedBy: string): Promise<JobRecord[] | null> {
  try {
    return await getJobs().recent(sampleJob, { data: { requestedBy }, limit: 5 });
  } catch (error) {
    reportError(error, { message: "Background jobs: could not list recent jobs." });
    return null;
  }
}

/** Starts the sample job and lists the current user's recent runs. */
export async function JobsCard({ user }: { user: AuthUser | null }) {
  const jobs = await recentJobs(user?.email ?? "anonymous");

  return (
    <Card className="gap-0 py-0" id="jobs">
      <CardHeader className="flex-row items-start justify-between gap-3 border-b px-5 py-5 sm:px-6">
        <div className="grid gap-1">
          <CardTitle className="text-base">Background jobs</CardTitle>
          <CardDescription>
            {isWorkerEnabled()
              ? "Work runs outside requests in this server's worker, with retries."
              : "This server runs no worker: jobs run when /api/jobs/run is called."}
          </CardDescription>
        </div>
        <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
          <ListChecks aria-hidden="true" className="size-4" />
        </span>
      </CardHeader>
      <CardContent className="grid gap-4 px-5 py-5 sm:px-6">
        {jobs === null ? (
          <p className="text-sm text-muted-foreground">
            Jobs are unavailable: the database could not be reached.
          </p>
        ) : (
          <>
            <form action={runSampleJob}>
              <Button type="submit" variant="outline">
                Run a sample job
              </Button>
            </form>
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs yet.</p>
            ) : (
              <ul aria-label="Recent jobs" className="grid gap-2">
                {jobs.map((job) => (
                  <li className="flex items-center justify-between gap-3 text-sm" key={job.id}>
                    <span>
                      {job.name}{" "}
                      <span className="text-muted-foreground">
                        {timeFormat.format(job.createdAt)} UTC
                      </span>
                    </span>
                    <Badge variant={job.state === "completed" ? "default" : "secondary"}>
                      {job.state}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
