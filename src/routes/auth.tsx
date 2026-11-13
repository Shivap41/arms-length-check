import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const REDIRECT_KEY = "fr-auth-redirect";
const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(72, "Password must be 72 characters or fewer."),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => {
    const target = search["redirect"];
    return { redirect: typeof target === "string" && target.startsWith("/") && !target.startsWith("//") ? target : "/cases" };
  },
  head: () => ({ meta: [
    { title: "Sign in | Faculty Review" },
    { name: "description", content: "Sign in to Faculty Review to work with live cases." },
    { property: "og:title", content: "Sign in | Faculty Review" },
    { property: "og:description", content: "Sign in to Faculty Review to work with live cases." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    window.sessionStorage.setItem(REDIRECT_KEY, redirect);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event !== "SIGNED_IN") return;
      const target = window.sessionStorage.getItem(REDIRECT_KEY) ?? "/cases";
      window.sessionStorage.removeItem(REDIRECT_KEY);
      void navigate({ href: target });
    });
    void supabase.auth.getUser().then(({ data }) => { if (data.user) void navigate({ href: redirect }); });
    return () => subscription.unsubscribe();
  }, [navigate, redirect]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your details."); return; }
    setError(""); setBusy(true);
    const result = mode === "sign-in"
      ? await supabase.auth.signInWithPassword(parsed.data)
      : await supabase.auth.signUp(parsed.data);
    setBusy(false);
    if (result.error) {
      setError(mode === "sign-in" ? "Email or password is incorrect." : "Couldn't create the account. It may already exist; try signing in.");
      return;
    }
    if (mode === "sign-up" && !result.data.session) setError("Account created, but email confirmation is still on in Supabase. Confirm the email, then sign in.");
  }

  return <div className="auth-page">
    <section className="auth-card" aria-labelledby="auth-title">
      <h1 id="auth-title">{mode === "sign-in" ? "Sign in to Faculty Review" : "Create an account"}</h1>
      <p>Live cases are saved to your account. The demo and research sessions work without signing in.</p>
      <form className="auth-actions" onSubmit={submit} noValidate>
        <label className="auth-field">Email
          <input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required />
        </label>
        <label className="auth-field">Password
          <input type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} required minLength={8} />
        </label>
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}</button>
      </form>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="button" className="auth-switch" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setError(""); }}>
        {mode === "sign-in" ? "No account yet? Create one" : "Already have an account? Sign in"}
      </button>
    </section>
  </div>;
}
