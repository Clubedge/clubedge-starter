import { useState } from "react";
import { ListChecks } from "lucide-react";
import type { JobsStatus } from "@clubedge/contract";

import { Badge } from "@clubedge/ui/components/badge";
import { Button } from "@clubedge/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@clubedge/ui/components/card";
import { api } from "@/lib/api";

const runnerDescriptions = {
  worker: "Work runs outside requests in the API's worker, with retries.",
  scheduler: "The API runs no worker: jobs run when /api/jobs/run is called.",
  service: "A jobs service runs each job by calling the API, with retries.",
};

const timeFormat = new Intl.DateTimeFormat("en", { timeStyle: "medium", timeZone: "UTC" });

/**
 * Starts the sample job and lists the current user's recent runs, as the API reports them. Null
 * when the API could not be reached.
 */
export function JobsCard({ status: initial }: { status: JobsStatus | null }) {
  const [status, setStatus] = useState(initial);
  const [pending, setPending] = useState(false);
  const jobs = status?.jobs ?? null;

  async function runSample() {
    setPending(true);
    try {
      await api.POST("/api/jobs/sample", { body: {} });
      const { data } = await api.GET("/api/jobs");
      if (data) setStatus(data);
    } catch {
      // The card keeps showing the jobs it had; the next page load reads them again.
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="gap-0 py-0" id="jobs">
      <CardHeader className="flex-row items-start justify-between gap-3 border-b px-5 py-5 sm:px-6">
        <div className="grid gap-1">
          <CardTitle className="text-base">Background jobs</CardTitle>
          {status && <CardDescription>{runnerDescriptions[status.runner]}</CardDescription>}
        </div>
        <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
          <ListChecks aria-hidden="true" className="size-4" />
        </span>
      </CardHeader>
      <CardContent className="grid gap-4 px-5 py-5 sm:px-6">
        {jobs === null ? (
          <p className="text-sm text-muted-foreground">
            {status
              ? "Jobs are unavailable: the database could not be reached."
              : "Jobs are unavailable: the API could not be reached."}
          </p>
        ) : (
          <>
            <div>
              <Button disabled={pending} onClick={runSample} type="button" variant="outline">
                Run a sample job
              </Button>
            </div>
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs yet.</p>
            ) : (
              <ul aria-label="Recent jobs" className="grid gap-2">
                {jobs.map((job) => (
                  <li className="flex items-center justify-between gap-3 text-sm" key={job.id}>
                    <span>
                      {job.name}{" "}
                      <span className="text-muted-foreground">
                        {timeFormat.format(new Date(job.createdAt))} UTC
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
