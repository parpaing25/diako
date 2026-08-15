import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { getThumbUrl } from "@/lib/imageThumb";
import { chargerCommentaires, commenter, type Commentaire } from "@/lib/api";

function ilYA(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

/** Bloc de commentaires — partagé par la carte desktop et le panneau mobile. */
export function Commentaires({ postId }: { postId: string }) {
  const { user } = useAuth();
  const [liste, setListe] = useState<Commentaire[]>([]);
  const [saisie, setSaisie] = useState("");
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const c = await chargerCommentaires(postId);
        if (!annule) setListe(c);
      } catch {
        if (!annule) toast.error("Les commentaires n'ont pas pu être chargés.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [postId]);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !saisie.trim() || envoi) return;
    setEnvoi(true);
    try {
      await commenter(postId, saisie);
      setSaisie("");
      setListe(await chargerCommentaires(postId));
    } catch {
      toast.error("Le commentaire n'a pas pu être publié.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div>
      {chargement ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="dk-skeleton h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : liste.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Aucun commentaire. Soyez le premier à répondre.
        </p>
      ) : (
        <ul className="space-y-3">
          {liste.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              {/* ⚠ LA PHOTO ET LE NOM MENENT AU PROFIL. C'etait le seul endroit
                  du produit ou un auteur s'affichait sans etre cliquable : on
                  lisait un commentaire utile sans pouvoir savoir qui parle. */}
              <Link
                to={`/user/${c.author_id}`}
                className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-xs font-semibold"
              >
                {c.auteur.avatar ? (
                  <img src={getThumbUrl(c.auteur.avatar)} alt="" width={32} height={32} className="h-8 w-8 object-cover" />
                ) : (
                  (c.auteur.name || "?").slice(0, 1).toUpperCase()
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <Link to={`/user/${c.author_id}`} className="font-semibold hover:underline">
                    {c.auteur.name || "Membre"}
                  </Link>{" "}
                  {c.body}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{ilYA(c.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {user ? (
        <form onSubmit={envoyer} className="mt-3 flex items-center gap-2">
          <label htmlFor={`cm-${postId}`} className="sr-only">
            Écrire un commentaire
          </label>
          <input
            id={`cm-${postId}`}
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="Ajouter un commentaire…"
            maxLength={2000}
            className="h-10 min-w-0 flex-1 rounded-full bg-muted px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            disabled={!saisie.trim() || envoi}
            className="shrink-0 text-sm font-semibold text-primary disabled:opacity-40"
          >
            Publier
          </button>
        </form>
      ) : (
        <p className="mt-3 text-center text-sm text-muted-foreground">
          <Link to="/auth" className="font-medium text-primary underline underline-offset-4">
            Connectez-vous
          </Link>{" "}
          pour commenter.
        </p>
      )}
    </div>
  );
}
