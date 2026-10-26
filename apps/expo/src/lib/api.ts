import { createApiClient } from "@clubedge/contract";
import { apiUrl } from "@/lib/config";

// The API, through the website: its server forwards /api to the API service. // clubedge:only framework!=none
// The API, which the app calls at its own address. // clubedge:only framework=none
export const api = createApiClient({ baseUrl: apiUrl });
