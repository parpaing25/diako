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
  const [metier, setMetier] = useState<string>("hotellerie");
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

    // 🔴 `account_type` NE S'ÉCRIT PLUS EN DIRECT. La migration 0069 a fermé
    //    cette porte — n'importe quel compte pouvait se déclarer professionnel
    //    par un simple UPDATE, alors que ce statut ouvre la revendication d'un
    //    des 3 254 établissements. Le déclencheur lève désormais une exception.
    //
    //    ⚠ CET ÉCRAN CONTINUAIT DE L'ÉCRIRE, et l'erreur brute de Postgres
    //      s'affichait dans un toast : plus personne ne pouvait devenir
    //      professionnel, donc plus personne ne pouvait revendiquer. La base
    //      était en avance sur le client, et c'est le client qui cassait.
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: nom.trim(), home_place: ville.trim() || null })
      .eq("id", user.id)
      .select("id");

    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }

    // ⚠ LE MÉTIER PART AVEC LE STATUT. `devenir_pro()` l'exige : un compte
    //   professionnel sans métier ne dit rien de ce qu'il propose, et c'est
    //   sur lui que reposent les écrans réservés aux pros.
    if (type === "pro") {
      const { error: e2 } = await supabase.rpc("devenir_pro", { p_metier: metier });
      if (e2) {
        setBusy(false);
        toast.error(e2.message);
        return;
      }
    }

    setBusy(false);
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

        {/* ⚠ LE MÉTIER N'APPARAÎT QUE POUR UN PRO. Le demander à un voyageur
            serait du bruit ; et `devenir_pro()` le refuse vide. Les sept codes
            sont ceux de la contrainte posée en 0069 — les inventer ici ferait
            échouer l'appel avec « Metier inconnu ». */}
        {type === "pro" && (
          <div>
            <label htmlFor="metier" className="mb-1 block text-sm font-medium">
              Votre métier
            </label>
            <select
              id="metier"
              value={metier}
              onChange={(e) => setMetier(e.target.value)}
              className="h-12 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="hotellerie">Hôtellerie — hôtel, bungalow, chambres</option>
              <option value="restauration">Restauration — restaurant, gargote</option>
              <option value="guide">Guide</option>
              <option value="agence">Agence de voyage — circuits</option>
              <option value="transport">Transport</option>
              <option value="artisanat">Artisanat</option>
              <option value="autre">Autre</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Vous pourrez revendiquer votre établissement ensuite — rien ne
              vous y oblige maintenant.
            </p>
          </div>
        )}

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
