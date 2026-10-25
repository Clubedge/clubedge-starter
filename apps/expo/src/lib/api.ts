import { createApiClient } from "@clubedge/contract";
import { apiUrl } from "@/lib/config";

// The API, through the website: its server forwards /api to the API service.
export const api = createApiClient({ baseUrl: apiUrl });
