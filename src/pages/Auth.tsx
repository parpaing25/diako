import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { flagActif } from "@/lib/flags";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

type Mode = "connexion" | "inscription";

export default function Auth() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("connexion");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleOuvert, setGoogleOuvert] = useState(false);
  useDocumentTitle(mode === "connexion" ? "Connexion" : "Inscription");

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  // Le bouton Google n'apparaît que si le drapeau est levé EN BASE : tant que
  // les identifiants OAuth ne sont pas configurés, un bouton qui échoue est
  // pire que pas de bouton du tout.
  useEffect(() => {
    void flagActif("google_login").then(setGoogleOuvert);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const mail = email.trim().toLowerCase();
    if (!mail || password.length < 8) {
      toast.error("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "inscription") {
        const { error } = await supabase.auth.signUp({
          email: mail,
          password,
          options: { emailRedirectTo: `${window.location.origin}/bienvenue` },
        });
        if (error) throw error;
        toast.success("Compte créé. Vérifiez votre boîte mail pour confirmer.");
        setMode("connexion");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: mail,
          password,
        });
        if (error) throw error;
        navigate("/", { replace: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error(
        /invalid login/i.test(msg)
          ? "Adresse e-mail ou mot de passe incorrect."
          : /not confirmed/i.test(msg)
            ? "Confirmez d'abord votre adresse e-mail (lien reçu par mail)."
            : msg
      );
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) toast.error(error.message);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <Link to="/" className="mb-8 text-center text-3xl font-bold text-primary">
        Diako
      </Link>
      <p className="mb-8 text-center text-muted-foreground">
        Où dormir, où manger et avec qui partir à Madagascar.
      </p>

      <div className="mb-6 grid grid-cols-2 rounded-full bg-muted p-1">
        {(["connexion", "inscription"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`min-h-10 rounded-full text-sm font-medium capitalize ${
              mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Adresse e-mail
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 w-full rounded-xl border border-input bg-background px-4 outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Mot de passe
          </label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "inscription" ? "new-password" : "current-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 w-full rounded-xl border border-input bg-background px-4 outline-none focus:ring-2 focus:ring-ring"
          />
          {mode === "inscription" && (
            <p className="mt-1 text-xs text-muted-foreground">8 caractères minimum.</p>
          )}
        </div>

        <button
          type="submit"
          disabled={busy}
          className="h-12 w-full rounded-xl bg-primary font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Un instant…" : mode === "connexion" ? "Se connecter" : "Créer mon compte"}
        </button>
      </form>

      {googleOuvert && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
          </div>
          <button
            onClick={() => void google()}
            className="h-12 w-full rounded-xl border border-input font-medium"
          >
            Continuer avec Google
          </button>
        </>
      )}

      <Link to="/" className="mt-8 text-center text-sm text-muted-foreground">
        Continuer sans compte
      </Link>
    </div>
  );
}
