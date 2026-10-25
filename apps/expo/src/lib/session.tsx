import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth";

type Status = "loading" | "signed-in" | "signed-out";

const SessionContext = createContext<{
  status: Status;
  setSignedIn(signedIn: boolean): void;
} | null>(null);

/**
 * Whether this device is signed in, for the screens that need it and for the routes that only
 * open signed in or signed out. Screens call setSignedIn() once they have signed in or out.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const setSignedIn = useCallback(
    (signedIn: boolean) => setStatus(signedIn ? "signed-in" : "signed-out"),
    [],
  );

  // Asks when the app starts, and again when the provider renews or ends the session by itself.
  // A check that fails keeps the current answer; the first one then counts as signed out.
  useEffect(() => {
    const check = () =>
      authClient
        .hasSession()
        .then(setSignedIn, () =>
          setStatus((current) => (current === "loading" ? "signed-out" : current)),
        );
    void check();
    return authClient.onChange?.(() => void check());
  }, [setSignedIn]);

  return (
    <SessionContext.Provider value={{ status, setSignedIn }}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession needs a SessionProvider above it.");
  return session;
}
