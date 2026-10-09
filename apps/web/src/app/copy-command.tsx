"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable (insecure context, denied permission).
      // The command stays selectable, so we fail silently.
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border bg-card py-2 pl-4 pr-2 shadow-sm">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap py-1.5 font-mono text-sm text-foreground">
        <span aria-hidden="true" className="select-none text-muted-foreground">
          ${" "}
        </span>
        {command}
      </code>
      <button
        aria-label={copied ? "Command copied" : "Copy command"}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        onClick={handleCopy}
        type="button"
      >
        {copied ? (
          <Check aria-hidden="true" className="size-4 text-primary" />
        ) : (
          <Copy aria-hidden="true" className="size-4" />
        )}
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}