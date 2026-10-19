import { createApiClient } from "@clubedge/contract";
import { getAccessToken } from "@/lib/auth";

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? "",
  accessToken: getAccessToken,
});
