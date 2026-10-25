import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth";

type Status = "loading" | "signed-in" | "signed-out";

const SessionContext = createContext<{ status: Status; refresh(): Promise<void> } | null>(null);

/**
 * Whether this device is signed in, for the screens that need it and for the routes that only
 * open signed in or signed out. Screens call refresh() after signing in or out.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const refresh = useCallback(async () => {
    const signedIn = await authClient.hasSession().catch(() => false);
    setStatus(signedIn ? "signed-in" : "signed-out");
  }, []);

  useEffect(() => {
    void refresh();
    return authClient.onChange?.(() => void refresh());
  }, [refresh]);

  return <SessionContext.Provider value={{ status, refresh }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession needs a SessionProvider above it.");
  return session;
}
