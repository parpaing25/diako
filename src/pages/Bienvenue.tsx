import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserData } from "@/contexts/UserDataContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

/**
 * Complétion du profil après confirmation de l'adresse e-mail.
 *
 * ⚠ Ce n'est PAS un verrou de routeur. Le Diako précédent bloquait TOUTES les
 * routes — y compris l'accueil — sur deux booléens gardés en mémoire React,
 * qui repassaient à false à chaque rechargement : l'application était
 * structurellement inatteignable. Ici, on peut toujours passer son chemin.
 */
export default function Bienvenue() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { profile, refresh } = useUserData();
  const [nom, setNom] = useState("");
  const [ville, setVille] = useState("");
  const [type, setType] = useState<"voyageur" | "pro">("voyageur");
  const [busy, setBusy] = useState(false);
  useDocumentTitle("Bienvenue");

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (profile?.display_name) setNom(profile.display_name);
  }, [profile]);

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    if (!user || busy) return;
    if (nom.trim().length < 2) {
      toast.error("Indiquez votre nom.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: nom.trim(),
        home_place: ville.trim() || null,
        account_type: type,
      })
      .eq("id", user.id)
      .select("id");
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
    navigate("/", { replace: true });
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <h1 className="text-2xl font-semibold">Bienvenue sur Diako</h1>
      <p className="mt-2 text-muted-foreground">
        Deux informations et c'est parti. Vous pourrez tout modifier ensuite.
      </p>

      <form onSubmit={valider} className="mt-8 space-y-4">
        <div>
          <label htmlFor="nom" className="mb-1 block text-sm font-medium">
            Votre nom
          </label>
          <input
            id="nom"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            required
            maxLength={60}
            className="h-12 w-full rounded-xl border border-input bg-background px-4 outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="ville" className="mb-1 block text-sm font-medium">
            Votre ville
          </label>
          <input
            id="ville"
            value={ville}
            onChange={(e) => setVille(e.target.value)}
            placeholder="Antananarivo"
            maxLength={80}
            className="h-12 w-full rounded-xl border border-input bg-background px-4 outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Vous êtes…</legend>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { v: "voyageur", t: "Voyageur", d: "Je cherche et je partage" },
                { v: "pro", t: "Professionnel", d: "Hôtel, restaurant, agence" },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setType(o.v)}
                className={`rounded-xl border p-3 text-left ${
                  type === o.v ? "border-primary bg-secondary" : "border-input"
                }`}
              >
                <span className="block font-medium">{o.t}</span>
                <span className="block text-xs text-muted-foreground">{o.d}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={busy}
          className="h-12 w-full rounded-xl bg-primary font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Un instant…" : "Continuer"}
        </button>
      </form>

      <button
        onClick={() => navigate("/")}
        className="mt-6 text-center text-sm text-muted-foreground"
      >
        Plus tard
      </button>
    </div>
  );
}
