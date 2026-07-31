import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Bookmark,
  Flag,
  Heart,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Send,
  Share2,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getThumbUrl } from "@/lib/imageThumb";
import { cn } from "@/lib/utils";
import {
  basculerFavori,
  basculerReaction,
  chargerCommentaires,
  commenter,
  signaler,
  supprimerPost,
  type Commentaire,
  type Post,
} from "@/lib/api";

function ilYA(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 604800) return `il y a ${Math.floor(s / 86400)} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

/**
 * Carte de publication — PLEINE LARGEUR, branchée sur la base.
 *
 * Réactions, commentaires et favoris sont RÉELS. Les compteurs sont mis à jour
 * de façon optimiste puis corrigés si le serveur refuse : sur une connexion 3G,
 * attendre la réponse avant de réagir donne l'impression d'un bouton mort.
 */
export function PostCard({
  post,
  onSupprime,
}: {
  post: Post;
  onSupprime?: (id: string) => void;
}) {
  const { user } = useAuth();
  const [reaction, setReaction] = useState<string | null>(post.ma_reaction);
  const [nbReactions, setNbReactions] = useState(post.reactions_count);
  const [favori, setFavori] = useState(post.enregistre);
  const [nbCommentaires, setNbCommentaires] = useState(post.comments_count);
  const [ouvert, setOuvert] = useState(false);
  const [commentaires, setCommentaires] = useState<Commentaire[]>([]);
  const [saisie, setSaisie] = useState("");
  const [menu, setMenu] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const connecte = () => {
    if (!user) {
      toast("Connexion requise", { description: "Créez un compte pour participer." });
      return false;
    }
    return true;
  };

  async function reagir() {
    if (!connecte()) return;
    const avant = reaction;
    const nouveau = avant ? null : "jaime";
    setReaction(nouveau);
    setNbReactions((n) => n + (nouveau ? 1 : -1));
    try {
      const res = await basculerReaction(post.id);
      setReaction(res);
    } catch {
      setReaction(avant);
      setNbReactions((n) => n + (avant ? 1 : -1));
      toast.error("La réaction n'a pas pu être enregistrée.");
    }
  }

  async function enregistrer() {
    if (!connecte()) return;
    const avant = favori;
    setFavori(!avant);
    try {
      setFavori(await basculerFavori(post.id, avant));
      toast.success(avant ? "Retiré des favoris" : "Enregistré dans vos favoris");
    } catch {
      setFavori(avant);
      toast.error("Impossible d'enregistrer.");
    }
  }

  async function ouvrirCommentaires() {
    const suivant = !ouvert;
    setOuvert(suivant);
    if (suivant && commentaires.length === 0) {
      try {
        setCommentaires(await chargerCommentaires(post.id));
      } catch {
        toast.error("Les commentaires n'ont pas pu être chargés.");
      }
    }
  }

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (!connecte() || !saisie.trim() || envoi) return;
    setEnvoi(true);
    try {
      await commenter(post.id, saisie);
      setSaisie("");
      setCommentaires(await chargerCommentaires(post.id));
      setNbCommentaires((n) => n + 1);
    } catch {
      toast.error("Le commentaire n'a pas pu être publié.");
    } finally {
      setEnvoi(false);
    }
  }

  async function partager() {
    const url = `${window.location.origin}/?post=${post.id}`;
    const texte = `${post.body?.slice(0, 100) ?? "Sur Diako"} — ${url}`;
    try {
      if (navigator.share) await navigator.share({ title: "Diako", text: texte, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Lien copié");
      }
    } catch {
      /* partage annulé par l'utilisateur */
    }
  }

  const media = post.media?.[0];
  const estMien = user?.id === post.author.id;

  return (
    <article className="border-b border-border bg-card px-4 py-4 md:rounded-2xl md:border md:px-5">
      <header className="flex items-start gap-3">
        <Link
          to={`/user/${post.author.id}`}
          className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary-soft text-sm font-semibold text-primary-foreground"
        >
          {post.author.avatar ? (
            <img
              src={getThumbUrl(post.author.avatar)}
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 object-cover"
            />
          ) : (
            (post.author.name || "?").slice(0, 1).toUpperCase()
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
            <Link to={`/user/${post.author.id}`} className="truncate hover:underline">
              {post.author.name || "Membre Diako"}
            </Link>
            {post.author.verification !== "none" && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                ✓ vérifié
              </span>
            )}
            {post.author.account_type === "pro" && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Pro
              </span>
            )}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            {ilYA(post.created_at)}
            {post.place && (
              <>
                <span aria-hidden="true">·</span>
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {post.place}
              </>
            )}
          </p>
        </div>

        <div className="relative shrink-0">
          <button
            onClick={() => setMenu((v) => !v)}
            aria-label="Options de la publication"
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
          {menu && (
            <>
              <button
                className="fixed inset-0 z-10 cursor-default"
                aria-hidden="true"
                onClick={() => setMenu(false)}
              />
              <div className="absolute right-0 top-9 z-20 w-52 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                {estMien ? (
                  <button
                    onClick={async () => {
                      setMenu(false);
                      try {
                        await supprimerPost(post.id);
                        onSupprime?.(post.id);
                        toast.success("Publication supprimée");
                      } catch {
                        toast.error("Suppression impossible.");
                      }
                    }}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-destructive hover:bg-destructive/5"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" /> Supprimer
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      setMenu(false);
                      if (!connecte()) return;
                      try {
                        await signaler("post", post.id, "signalement depuis le fil");
                        toast.success("Signalement envoyé", {
                          description: "Au-delà de trois signalements, la publication est masquée automatiquement.",
                        });
                      } catch {
                        toast.error("Le signalement n'a pas pu être envoyé.");
                      }
                    }}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-muted"
                  >
                    <Flag className="h-4 w-4" aria-hidden="true" /> Signaler
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {post.body && (
        <p className="mt-3 max-w-[68ch] whitespace-pre-line text-[15px] leading-relaxed">
          {post.body}
        </p>
      )}

      {(post.page_name || post.dish) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {post.page_name && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs">
              <MapPin className="h-3 w-3 text-primary" aria-hidden="true" />
              {post.page_name}
            </span>
          )}
          {post.dish && (
            <Link
              to={`/recherche?q=${encodeURIComponent(post.dish)}`}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"
            >
              <UtensilsCrossed className="h-3 w-3 text-accent" aria-hidden="true" />
              {post.dish}
            </Link>
          )}
        </div>
      )}

      {media && (
        <div className="mt-3 overflow-hidden rounded-xl bg-muted">
          {/* Le ratio est réservé AVANT le chargement : sans width/height, la
              page saute quand l'image arrive. */}
          <img
            src={getThumbUrl(media.url)}
            alt=""
            width={media.w || 1200}
            height={media.h || 900}
            loading="lazy"
            decoding="async"
            className="h-auto w-full object-cover"
            onError={(e) => {
              // La vignette n'existe pas encore : on retombe sur l'original.
              const img = e.currentTarget;
              if (img.src !== media.url) img.src = media.url;
            }}
          />
        </div>
      )}

      {(nbReactions > 0 || nbCommentaires > 0) && (
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          {nbReactions > 0 && <span>{nbReactions} réaction{nbReactions > 1 ? "s" : ""}</span>}
          {nbCommentaires > 0 && (
            <button onClick={ouvrirCommentaires} className="hover:underline">
              {nbCommentaires} commentaire{nbCommentaires > 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between border-t border-border pt-1">
        <button
          onClick={reagir}
          aria-pressed={!!reaction}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-medium transition hover:bg-muted",
            reaction ? "text-accent" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Heart className={cn("h-4 w-4", reaction && "fill-current")} aria-hidden="true" />
          <span className="hidden sm:inline">J'aime</span>
        </button>

        <button
          onClick={ouvrirCommentaires}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Commenter</span>
        </button>

        <button
          onClick={partager}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Partager</span>
        </button>

        <button
          onClick={enregistrer}
          aria-pressed={favori}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-medium transition hover:bg-muted",
            favori ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Bookmark className={cn("h-4 w-4", favori && "fill-current")} aria-hidden="true" />
          <span className="hidden sm:inline">Enregistrer</span>
        </button>
      </div>

      {ouvert && (
        <div className="mt-3 border-t border-border pt-3">
          {commentaires.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun commentaire. Soyez le premier à répondre.
            </p>
          ) : (
            <ul className="space-y-3">
              {commentaires.map((c) => (
                <li key={c.id} className="flex gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-xs font-semibold">
                    {c.auteur.avatar ? (
                      <img src={getThumbUrl(c.auteur.avatar)} alt="" width={32} height={32} className="h-8 w-8 object-cover" />
                    ) : (
                      (c.auteur.name || "?").slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <div className="min-w-0 flex-1 rounded-2xl bg-muted px-3 py-2">
                    <p className="text-xs font-semibold">{c.auteur.name || "Membre"}</p>
                    <p className="mt-0.5 whitespace-pre-line text-sm">{c.body}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{ilYA(c.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {user && (
            <form onSubmit={envoyer} className="mt-3 flex items-center gap-2">
              <label htmlFor={`c-${post.id}`} className="sr-only">
                Écrire un commentaire
              </label>
              <input
                id={`c-${post.id}`}
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                placeholder="Écrire un commentaire…"
                maxLength={2000}
                className="h-10 min-w-0 flex-1 rounded-full bg-muted px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="submit"
                disabled={!saisie.trim() || envoi}
                aria-label="Envoyer"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          )}
        </div>
      )}
    </article>
  );
}
