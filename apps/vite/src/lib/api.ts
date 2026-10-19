import { createApiClient } from "@clubedge/contract";

export const api = createApiClient({ baseUrl: import.meta.env.VITE_API_URL ?? "" });
