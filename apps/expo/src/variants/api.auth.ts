import { createApiClient } from "@clubedge/contract";
import { authClient } from "@/lib/auth";
import { apiUrl } from "@/lib/config";
import { send } from "@/lib/send";

// The API, through the website: its server forwards /api to the API service, with the session. // clubedge:only framework!=none
// The API, which the app calls at its own address, with the session. // clubedge:only framework=none
// The auth client says how the session travels: a bearer token, or the session cookie it keeps
// on the device.
export const api = createApiClient({
  baseUrl: apiUrl,
  fetch: async (input, init) => send(input, init, await authClient.sessionHeaders()),
});
