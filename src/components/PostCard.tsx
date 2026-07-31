import { Bookmark, Heart, MapPin, MessageCircle, MoreHorizontal, Share2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface PostApercu {
  id: string;
  auteur: string;
  role?: string;
  verifie?: boolean;
  quand: string;
  texte: string;
  lieu?: string;
  page?: string;
  plat?: string;
  media?: { emoji: string; couleur: string; ratio: "4/3" | "16/9" };
  reactions: number;
  commentaires: number;
}

const bientot = (quoi: string) =>
  toast("Bientôt disponible", {
    description: `${quoi} arrivera avec le fil, au moment où les premières publications seront ouvertes.`,
  });

/**
 * Carte de publication — PLEINE LARGEUR, un seul flux.
 *
 * C'est la demande explicite d'Andry : « un fil infini comme Facebook, PAS des
 * petites cartes comme Fonenako ». Fonenako affiche une grille de 1 à 4
 * colonnes ; ici, une seule colonne d'environ 600 px, comme un réseau social.
 *
 * ⚠ Le média réserve son ratio (aspect-[4/3] ou [16/9]) AVANT le chargement :
 * sans cela, l'arrivée des images fait sauter tout ce qui est en dessous et le
 * score de stabilité visuelle s'effondre.
 *
 * Les boutons d'action ne sont pas encore branchés, mais ils RÉPONDENT : un
 * bouton muet est ce qui donne l'impression d'un site cassé.
 */
export function PostCard({ post }: { post: PostApercu }) {
  return (
    <article className="border-b border-border bg-card px-4 py-4 md:rounded-2xl md:border md:px-5">
      {/* En-tête */}
      <header className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-soft text-sm font-semibold text-primary-foreground">
          {post.auteur.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
            <span className="truncate">{post.auteur}</span>
            {post.verifie && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                ✓ vérifié
              </span>
            )}
            {post.role && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {post.role}
              </span>
            )}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            {post.quand}
            {post.lieu && (
              <>
                <span aria-hidden="true">·</span>
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {post.lieu}
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => bientot("Le menu de publication")}
          aria-label="Options de la publication"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      {/* Texte */}
      <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed">{post.texte}</p>

      {/* Étiquettes : lieu, établissement, plat — les 3 tags qui feront
          remonter la publication sur les bonnes fiches. */}
      {(post.page || post.plat) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {post.page && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs">
              <MapPin className="h-3 w-3 text-primary" aria-hidden="true" />
              {post.page}
            </span>
          )}
          {post.plat && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs">
              <UtensilsCrossed className="h-3 w-3 text-accent" aria-hidden="true" />
              {post.plat}
            </span>
          )}
        </div>
      )}

      {/* Média — ratio réservé, donc zéro saut de mise en page */}
      {post.media && (
        <div
          className={cn(
            "mt-3 flex items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br",
            post.media.couleur,
            post.media.ratio === "4/3" ? "aspect-[4/3]" : "aspect-video"
          )}
        >
          <span className="text-6xl" aria-hidden="true">
            {post.media.emoji}
          </span>
        </div>
      )}

      {/* Compteurs */}
      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{post.reactions} réactions</span>
        <span>{post.commentaires} commentaires</span>
      </div>

      {/* Barre d'actions */}
      <div className="mt-2 flex items-center justify-between border-t border-border pt-1">
        {[
          { icon: Heart, label: "J'aime", quoi: "Les réactions" },
          { icon: MessageCircle, label: "Commenter", quoi: "Les commentaires" },
          { icon: Share2, label: "Partager", quoi: "Le partage" },
          { icon: Bookmark, label: "Enregistrer", quoi: "Les favoris" },
        ].map(({ icon: Icon, label, quoi }) => (
          <button
            key={label}
            onClick={() => bientot(quoi)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    </article>
  );
}
