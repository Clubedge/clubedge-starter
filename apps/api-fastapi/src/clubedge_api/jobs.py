"""The API's background jobs. Define a job here, then add it to JOBS."""

import asyncio
from typing import cast  # clubedge:only email!=none

from clubedge_api.email import email  # clubedge:only email!=none
from clubedge_api.email_provider import EmailMessage  # clubedge:only email!=none
from clubedge_api.job_queue import JobContext, JobData, JobDefinition


async def _sample(data: JobData, context: JobContext) -> dict[str, object]:
    await asyncio.sleep(0.5)
    requested_by = data.get("requestedBy")
    return {"message": f"Hello, {requested_by}, from the jobs worker.", "attempt": context.attempt}


# An example job that the dashboard can start; replace it with your own.
sample_job = JobDefinition(name="sample", run=_sample)
# clubedge:if email!=none


async def _send_email(message: JobData, context: JobContext) -> None:
    await email.send(cast(EmailMessage, message))


# Sends an email in the background: enqueue it with the message, so a slow or failing email
# provider never delays a request, and failed sends are retried with backoff.
send_email_job = JobDefinition(
    name="send-email",
    run=_send_email,
    retry_limit=5,
    retry_delay_seconds=30,
    retry_backoff=True,
)
# clubedge:end

# Every job the worker runs.
JOBS: list[JobDefinition] = [
    sample_job,
    send_email_job,  # clubedge:only email!=none
]
