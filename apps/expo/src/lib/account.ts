import type { Account } from "@clubedge/contract";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/api";
import { AccountError } from "@/lib/auth-client";

/** What an account action says once it is done, or why it failed. */
export type Message = { tone: "error" | "success"; text: string };

/** The words for an account action the provider or the API refused. */
export function failure(error: unknown): Message {
  if (error instanceof AccountError) {
    const text = {
      "invalid-password": "The current password is not correct.",
      "invalid-input": "Choose a password of 8 to 128 characters, different from the current one.",
      "rate-limited": "Too many attempts. Wait a minute, then try again.",
    }[error.code];
    return { tone: "error", text };
  }
  return { tone: "error", text: error instanceof Error ? error.message : "Something went wrong." };
}

/** Runs an account action: busy while it runs, then its message, or the words for its failure. */
export function useAccountAction() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const run = async (action: () => Promise<Message | null>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await action());
    } catch (error) {
      setMessage(failure(error));
    } finally {
      setBusy(false);
    }
  };
  return { busy, message, run };
}

/**
 * The signed-in user's account, from the API: null until it answers. It is asked again each time
 * the screen shows, so a name changed on another screen shows on return.
 */
export function useAccount(): Account | null {
  const [account, setAccount] = useState<Account | null>(null);
  // Only the latest request sets it: an older one that answers late would bring back a name
  // changed since.
  const latest = useRef(0);
  useFocusEffect(
    useCallback(() => {
      const request = ++latest.current;
      void api.GET("/api/account").then(
        ({ data }) => {
          if (data && request === latest.current) setAccount(data);
        },
        () => undefined,
      );
    }, []),
  );
  return account;
}
