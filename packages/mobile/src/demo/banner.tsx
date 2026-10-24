import { showAbovePage } from "../above-page";

/** Says the app is a demo, above every page. */
export function DemoBanner() {
  return (
    <p className="border-b bg-primary px-4 py-2 text-center text-sm text-primary-foreground">
      A demo with sample data, which stays on this device. Sign in with any email and password;
      sign-up and password reset are off.
    </p>
  );
}

export function showDemoBanner() {
  showAbovePage(<DemoBanner />);
}
