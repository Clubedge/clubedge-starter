import { signIn, signUp } from "@/app/actions/auth";
import { hasSupabaseAuthConfig } from "@/env/client";
import Link from "next/link";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; "check-email"?: string }>;
};

const errorMessages: Record<string, string> = {
  "invalid-input": "Enter a valid email and a password with at least 8 characters.",
  "invalid-credentials": "Those credentials could not be verified. Try again.",
  "signup-failed": "We could not create the account. Check your details and try again.",
  "auth-callback": "That sign-in link could not be verified. Request a new one.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params.error ? errorMessages[params.error] : undefined;

  return (
    <main className="auth-page">
      <Link className="brand auth-brand" href="/">
        <span className="brand-mark">c</span>
        <span>
          clubedge<span style={{ color: "#899790", fontWeight: 500 }}> / starter</span>
        </span>
      </Link>
      <section className="auth-card">
        <div className="eyebrow">Your workspace</div>
        <h1 className="auth-title">Welcome back.</h1>
        <p className="auth-description">
          Sign in to your Clubedge application, or create an account to get started.
        </p>

        {!hasSupabaseAuthConfig && (
          <div className="auth-notice" role="status">
            Add your Supabase URL and publishable key to <code>.env.local</code> to enable
            authentication.
          </div>
        )}
        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}
        {params["check-email"] && (
          <div className="auth-notice" role="status">
            Check your email to confirm your new account.
          </div>
        )}

        <form className="auth-form" action={signIn}>
          <label htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={8}
            maxLength={128}
            required
          />
          <button
            className="primary-button auth-submit"
            type="submit"
            disabled={!hasSupabaseAuthConfig}
          >
            Sign in <span className="button-arrow">↗</span>
          </button>
        </form>
        <div className="auth-divider">
          <span>New here?</span>
        </div>
        <form action={signUp} className="auth-form">
          <label htmlFor="signup-email">Email address</label>
          <input id="signup-email" name="email" type="email" autoComplete="email" required />
          <label htmlFor="signup-password">Create a password</label>
          <input
            id="signup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
          />
          <button className="secondary-button" type="submit" disabled={!hasSupabaseAuthConfig}>
            Create account
          </button>
        </form>
        <p className="auth-footnote">
          Your session is verified server side and stored in secure cookies.
        </p>
      </section>
      <Link className="auth-back" href="/">
        ← Back to the starter
      </Link>
    </main>
  );
}
