// Over-the-air updates with EAS Update: the app's JavaScript and assets, published with
// `eas update` (the expo-update workflow), reach the installed apps of the same version without a
// store release. The app checks when it starts and when it comes back to the foreground, at most
// every 15 minutes, and downloads a new update, which the dashboard then offers to restart into
// (OtaBanner); otherwise the app starts with it the next time.
import * as Updates from "expo-updates";

const CHECK_INTERVAL = 15 * 60_000;
let checkedAt = Number.NEGATIVE_INFINITY;

/** Checks for an update and downloads it, quietly: offline, the next check tries again. */
export async function checkForOtaUpdate(): Promise<void> {
  // Development builds load the code from the dev server, and a build made before `eas init`
  // has no address to check.
  if (__DEV__ || !Updates.isEnabled) return;
  if (Date.now() - checkedAt < CHECK_INTERVAL) return;
  checkedAt = Date.now();
  try {
    const { isAvailable } = await Updates.checkForUpdateAsync();
    if (isAvailable) await Updates.fetchUpdateAsync();
  } catch {
    // Offline, or EAS Update did not answer.
  }
}

/** Whether a downloaded update waits for the next start, following changes. */
export const useOtaUpdateReady = () => Updates.useUpdates().isUpdatePending;

/** Restarts the app into the downloaded update. */
export const restartIntoUpdate = () => void Updates.reloadAsync();
