import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import "@lovable.dev/cloud-auth-js/styles.css";

const REDIRECT_KEY = "fr-auth-redirect";

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

function GoogleMark() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>;
}

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
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
  async function signIn(provider: "google" | "lovable") {
    setError(""); setBusy(true);
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
    if (result.error) { setError("Sign-in didn't work. Please try again."); setBusy(false); }
  }
  return <div className="auth-page">
    <section className="auth-card" aria-labelledby="auth-title">
      <h1 id="auth-title">Sign in to Faculty Review</h1>
      <p>Live cases are saved to your account. The demo and research sessions work without signing in.</p>
      <div className="auth-actions">
        <button type="button" className="google-auth-button" disabled={busy} onClick={() => void signIn("google")}><GoogleMark />Sign in with Google</button>
        <button type="button" className="lovable-auth-button" disabled={busy} onClick={() => void signIn("lovable")}>Sign in with Lovable</button>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </section>
  </div>;
}
