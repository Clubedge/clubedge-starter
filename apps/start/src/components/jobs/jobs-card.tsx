import { ListChecks } from "lucide-react";

import type { JobsStatus } from "@/server/jobs.functions";
import { Badge } from "@clubedge/ui/components/badge";
import { Button } from "@clubedge/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@clubedge/ui/components/card";

const timeFormat = new Intl.DateTimeFormat("en", { timeStyle: "medium", timeZone: "UTC" });

/** Starts the sample job and lists the current user's recent runs. The form posts to /jobs/sample. */
export function JobsCard({ status }: { status: JobsStatus }) {
  const { jobs } = status;

  return (
    <Card className="gap-0 py-0" id="jobs">
      <CardHeader className="flex-row items-start justify-between gap-3 border-b px-5 py-5 sm:px-6">
        <div className="grid gap-1">
          <CardTitle className="text-base">Background jobs</CardTitle>
          <CardDescription>
            {status.worker
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
            <form action="/jobs/sample" method="post">
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
