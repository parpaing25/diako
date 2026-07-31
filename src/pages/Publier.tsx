import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Image, MapPin, Sparkles, UtensilsCrossed } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useAuth } from "@/contexts/AuthContext";
import { BandeauApercu } from "@/components/BandeauApercu";
import { DESTINATIONS, PLATS } from "@/data/apercu";

const TYPES = [
  { cle: "recit", label: "Récit de voyage", emoji: "✍️" },
  { cle: "photo", label: "Photo", emoji: "📷" },
  { cle: "bon_plan", label: "Bon plan", emoji: "✨" },
  { cle: "question", label: "Question", emoji: "❓" },
  { cle: "avis", label: "Avis", emoji: "⭐" },
];

/**
 * Publier — l'assistant de publication.
 *
 * Le point important, visible ici : les trois étiquettes lieu / établissement /
 * plat. Ce sont elles qui feront remonter la publication sur la fiche de la
 * destination, sur celle de l'établissement et sur celle du plat. C'est le
 * moteur du produit, pas une décoration.
 */
export default function Publier() {
  useDocumentTitle("Publier");
  const navigate = useNavigate();
  const { user } = useAuth();
  const [type, setType] = useState("recit");
  const [texte, setTexte] = useState("");
  const [lieu, setLieu] = useState("");
  const [plat, setPlat] = useState("");

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
          <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">Connectez-vous pour publier</h1>
        <p className="mt-2 text-muted-foreground">
          Partager un voyage, une adresse ou un bon plan demande un compte — pour
          que les autres sachent qui parle.
        </p>
        <Link
          to="/auth"
          className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          Créer mon compte
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <h1 className="text-2xl font-semibold">Publier</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Racontez, partagez une adresse, signalez un bon plan.
      </p>

      <div className="mt-5">
        <BandeauApercu quoi="Le formulaire est complet mais n'enregistre encore rien : le fil s'ouvrira au moment prévu." />
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Type de publication</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.cle}
              type="button"
              onClick={() => setType(t.cle)}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm transition ${
                type === t.cle ? "border-primary bg-secondary font-medium" : "border-border hover:bg-muted"
              }`}
            >
              <span aria-hidden="true">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-5">
        <label htmlFor="texte" className="mb-1 block text-sm font-medium">
          Votre texte
        </label>
        <textarea
          id="texte"
          rows={6}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Comment s'y rendre, combien ça coûte, ce qu'il faut savoir…"
          className="w-full rounded-xl border border-input bg-background p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="mt-1 text-xs text-muted-foreground">{texte.length} caractères</p>
      </div>

      <button
        type="button"
        onClick={() => toast("Bientôt disponible", { description: "L'envoi de photos utilisera la compression dans le navigateur, déjà en place." })}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-8 text-sm text-muted-foreground hover:bg-muted"
      >
        <Image className="h-5 w-5" aria-hidden="true" />
        Ajouter des photos
      </button>

      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="lieu" className="mb-1 flex items-center gap-1.5 text-sm font-medium">
            <MapPin className="h-4 w-4 text-primary" aria-hidden="true" /> Lieu
          </label>
          <select
            id="lieu"
            value={lieu}
            onChange={(e) => setLieu(e.target.value)}
            className="h-12 w-full rounded-xl border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Choisir une destination…</option>
            {DESTINATIONS.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.nom} — {d.region}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="plat" className="mb-1 flex items-center gap-1.5 text-sm font-medium">
            <UtensilsCrossed className="h-4 w-4 text-accent" aria-hidden="true" /> Plat mentionné
          </label>
          <select
            id="plat"
            value={plat}
            onChange={(e) => setPlat(e.target.value)}
            className="h-12 w-full rounded-xl border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Aucun</option>
            {PLATS.map((p) => (
              <option key={p.nom} value={p.nom}>
                {p.nom}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Taguer un lieu, un établissement ou un plat fait remonter votre
            publication sur leur fiche. C'est ce qui rend les bonnes adresses
            trouvables.
          </p>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() =>
            toast("Publication non enregistrée", {
              description: "Le fil ouvrira ses publications prochainement. Rien n'a été perdu, mais rien n'a été envoyé.",
            })
          }
          className="h-12 flex-1 rounded-xl bg-primary font-medium text-primary-foreground"
        >
          Publier
        </button>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="h-12 rounded-xl border border-input px-5 font-medium"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
