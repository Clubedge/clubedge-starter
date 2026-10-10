import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";

import { Button } from "@clubedge/ui/components/button";
import { Input } from "@clubedge/ui/components/input";
import { Label } from "@clubedge/ui/components/label";

// The form posts natively to a server route, so it works before hydration and without
// JavaScript. Once hydrated, the pending state disables repeat submissions.
const PendingContext = createContext(false);

export function AuthForm({ action, children }: { action: string; children: ReactNode }) {
  const [pending, setPending] = useState(false);

  return (
    <form
      action={action}
      className="grid gap-5"
      method="post"
      onSubmit={(event) => {
        if (pending) event.preventDefault();
        else setPending(true);
      }}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
    </form>
  );
}

export function PasswordField({ isSignUp }: { isSignUp: boolean }) {
  const [visible, setVisible] = useState(false);
  const pending = useContext(PendingContext);

  return (
    <div className="grid gap-2">
      <Label htmlFor="password">Password</Label>
      <div className="relative">
        <Input
          aria-describedby={isSignUp ? "password-hint" : undefined}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          className="h-11 pr-11"
          id="password"
          maxLength={128}
          minLength={8}
          name="password"
          placeholder={isSignUp ? "Create a password" : "Enter your password"}
          // readOnly rather than disabled: disabled fields are left out of the submitted form.
          readOnly={pending}
          required
          type={visible ? "text" : "password"}
        />
        <button
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setVisible((v) => !v)}
          type="button"
        >
          {visible ? (
            <EyeOff aria-hidden="true" className="size-4" />
          ) : (
            <Eye aria-hidden="true" className="size-4" />
          )}
        </button>
      </div>
      {isSignUp && (
        <p className="text-xs text-muted-foreground" id="password-hint">
          Use at least 8 characters.
        </p>
      )}
    </div>
  );
}

export function EmailField() {
  const pending = useContext(PendingContext);

  return (
    <div className="grid gap-2">
      <Label htmlFor="email">Email</Label>
      <Input
        autoComplete="email"
        autoFocus
        className="h-11"
        id="email"
        name="email"
        placeholder="you@example.com"
        readOnly={pending}
        required
        type="email"
      />
    </div>
  );
}

export function SubmitButton({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  const pending = useContext(PendingContext);

  return (
    <Button className="h-11 w-full justify-center" disabled={disabled || pending} type="submit">
      {pending ? (
        <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
      ) : null}
      {children}
      {!pending && <ArrowRight aria-hidden="true" />}
    </Button>
  );
}
