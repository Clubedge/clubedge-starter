import { createApiClient } from "@clubedge/contract";
import { authClient } from "@/lib/auth";
import { apiUrl } from "@/lib/config";

// The API, through the website: its server forwards /api to the API service, with the session. // clubedge:only framework!=none
// The API, which the app calls at its own address, with the session. // clubedge:only framework=none
export const api = createApiClient({ baseUrl: apiUrl });

api.use({
  async onRequest({ request }) {
    // The auth client says how the session travels: a bearer token, or the session cookie it
    // keeps on the device. The app sends no cookies of its own.
    for (const [name, value] of Object.entries(await authClient.sessionHeaders())) {
      request.headers.set(name, value);
    }
    return new Request(request, { credentials: "omit" });
  },
});
