import { createApiClient } from "@clubedge/contract";
import { getAccessToken } from "@/lib/auth"; // clubedge:only shell!=none
import { publicOrigin } from "@/lib/public-origin"; // clubedge:only shell!=none

// Better Auth relies on its same-origin HttpOnly cookie. Keep API calls on the frontend origin
// so the Node/Vite proxy can forward that cookie to the separately hosted API service.
export const api = createApiClient({
  baseUrl: "",
  // clubedge:if shell!=none
  // The mobile app's pages load from the device, where that cookie never reaches: it calls the
  // API through the website, with its session token.
  ...(import.meta.env.MODE === "app" && {
    baseUrl: import.meta.env.VITE_API_URL || publicOrigin,
    accessToken: getAccessToken,
  }),
  // clubedge:end
});
