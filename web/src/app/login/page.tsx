"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // An already-signed-in visitor has no business on the login screen.
  useEffect(() => {
    // Same destination as the root: the first screen after signing in is the
    // one with work on it.
    if (!loading && user) router.replace("/needs-attention");
  }, [loading, user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <BrandPanel />

      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          {/* The brand panel is hidden below lg, so the mark comes inline there
              instead — otherwise the small-screen page has no branding at all. */}
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <BrandMark />
            <span className="text-lg font-bold tracking-tight">ARKQUEN</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to continue to your workspace.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input py-2.5"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  // Right padding keeps the text clear of the toggle button.
                  className="input py-2.5 pr-11"
                />
                <button
                  // type="button" matters: inside a form, a bare <button>
                  // defaults to submit and would sign you in on every peek.
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-400 transition hover:text-slate-700"
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
              >
                <span aria-hidden="true">⚠</span>
                <span>{error}</span>
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:opacity-50"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {/* There is no public signup: accounts are created by an admin. */}
          <p className="mt-8 text-center text-xs text-slate-500">
            Accounts are created by your administrator.
          </p>
        </div>
      </div>
    </div>
  );
}

/** The left half on wide screens. Hidden below lg, where it would just push the
 *  form off the fold on a phone. */
function BrandPanel() {
  return (
    // The navy is an inline style, not bg-slate-900: globals.css remaps that
    // utility to blue under html.dark (right for buttons), which would turn this
    // whole panel into a bright blue slab. A brand panel reads dark either way.
    <div
      className="relative hidden w-1/2 overflow-hidden lg:flex lg:flex-col lg:justify-between"
      style={{ backgroundColor: "#0f172a" }}
    >
      {/* Two soft radial washes give the flat navy some depth without needing
          an image to download. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 55% at 15% 10%, rgba(59,130,246,0.30), transparent 70%), radial-gradient(50% 50% at 85% 85%, rgba(139,92,246,0.22), transparent 70%)",
        }}
      />

      <div className="relative flex items-center gap-2 p-12">
        <BrandMark inverted />
        <span className="text-lg font-bold tracking-tight text-white">ARKQUEN</span>
      </div>

      <div className="relative px-12 pb-16">
        <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-white">
          Every lead, every follow-up, in one place.
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-300">
          Capture leads from forms and landing pages, move them through your pipeline,
          and let automation handle the follow-up.
        </p>

        <ul className="mt-8 space-y-3">
          {[
            "Visual pipelines your whole team can see",
            "Email and WhatsApp sequences that run themselves",
            "Forms and short links that feed straight into your CRM",
          ].map((line) => (
            <li key={line} className="flex items-start gap-3 text-sm text-slate-300">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] text-white">
                ✓
              </span>
              {line}
            </li>
          ))}
        </ul>
      </div>

      <p className="relative px-12 pb-8 text-xs text-slate-500">
        © {new Date().getFullYear()} Arkquen
      </p>
    </div>
  );
}

/** The same triangle mark the sidebar uses, so the two screens agree. */
function BrandMark({ inverted = false }: { inverted?: boolean }) {
  return (
    // Inverted sits on the always-dark panel, so its colours are inline for the
    // same reason the panel's are. The default variant keeps the utility classes
    // so it tracks the sidebar's mark in both themes.
    <span
      className={`flex h-9 w-9 items-center justify-center rounded-lg ${
        inverted ? "" : "bg-slate-900 text-white"
      }`}
      style={inverted ? { backgroundColor: "#ffffff", color: "#0f172a" } : undefined}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      >
        <path d="M12 3 3 20h18L12 3z" />
        <path d="M12 11 8 20M12 11l4 9" />
      </svg>
    </span>
  );
}

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19M6.61 6.61A18.5 18.5 0 0 0 2 11s3.5 7 10 7a9.1 9.1 0 0 0 4.24-1.02" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="m2 2 20 20" />
    </svg>
  );
}
