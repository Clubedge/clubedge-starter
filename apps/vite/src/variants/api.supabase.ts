import { createApiClient } from "@clubedge/contract";
import { getAccessToken } from "@/lib/auth";
import { publicOrigin } from "@/lib/public-origin"; // clubedge:only shell!=none

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? "",
  // clubedge:if shell!=none
  // The mobile app's pages load from the device: it calls the API through the website.
  ...(import.meta.env.MODE === "app" && { baseUrl: import.meta.env.VITE_API_URL || publicOrigin }),
  // clubedge:end
  accessToken: getAccessToken,
});
