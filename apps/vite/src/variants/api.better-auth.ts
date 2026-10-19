import { createApiClient } from "@clubedge/contract";

// Better Auth relies on its same-origin HttpOnly cookie. Keep API calls on the frontend origin
// so the Node/Vite proxy can forward that cookie to the separately hosted API service.
export const api = createApiClient({ baseUrl: "" });
