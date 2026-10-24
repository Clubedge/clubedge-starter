"""Email through Resend's HTTP API (https://resend.com/docs/api-reference), without an SDK."""

import httpx

from clubedge_api.email_provider import EmailMessage, parse_sender

API = "https://api.resend.com"


def _failure(response: httpx.Response, action: str) -> RuntimeError:
    return RuntimeError(
        f"Resend could not {action} ({response.status_code}): {response.text[:300]}"
    )


class ResendEmail:
    def __init__(
        self, api_key: str, sender: str, *, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        """`sender` is EMAIL_FROM, on a domain verified in Resend, as "Name <address>" or an
        address. `transport` is for tests."""
        self._sender = parse_sender(sender)
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._transport = transport

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=API, headers=self._headers, transport=self._transport, timeout=30
        )

    async def send(self, message: EmailMessage) -> None:
        body: dict[str, object] = {
            "from": str(self._sender),
            "to": [message["to"]],
            "subject": message["subject"],
            "text": message["text"],
        }
        html = message.get("html")
        if html:
            body["html"] = html
        async with self._client() as client:
            response = await client.post("/emails", json=body)
        if response.is_error:
            raise _failure(response, "send the email")

    async def verify(self) -> None:
        """Checks the API key without sending anything, for `pnpm check:services`."""
        async with self._client() as client:
            response = await client.get("/domains")
        if response.is_success:
            return
        # A key limited to sending cannot list domains, which still proves it is valid.
        if response.status_code == 401 and "restricted_api_key" in response.text:
            return
        raise _failure(response, "verify the API key")
