import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Bookmark, Heart, MapPin, MessageCircle, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getThumbUrl } from "@/lib/imageThumb";
import { Carrousel } from "@/components/Carrousel";
import { cn } from "@/lib/utils";
import { basculerFavori, basculerReaction, type Post } from "@/lib/api";

const SEUIL = 120;

/**
 * Publication en PLEIN ÉCRAN — le fil mobile.
 *
 * Une publication occupe tout l'écran, on glisse vers le haut pour passer à la
 * suivante (accroche verticale sur le conteneur parent). Les images d'une même
 * publication, elles, se parcourent horizontalement.
 *
 * Le texte est posé PAR-DESSUS la photo, sur un dégradé sombre : superposer
 * plutôt que juxtaposer, c'est ce qui laisse la photo occuper la totalité de
 * l'écran — sur du contenu voyage, c'est elle qui doit parler en premier.
 */
export function PostImmersif({
  post,
  prioritaire = false,
  onCommenter,
}: {
  post: Post;
  prioritaire?: boolean;
  onCommenter: (p: Post) => void;
}) {
  const { user } = useAuth();
  const [reaction, setReaction] = useState<string | null>(post.ma_reaction);
  const [nbReactions, setNbReactions] = useState(post.reactions_count);
  const [favori, setFavori] = useState(post.enregistre);
  const [deplie, setDeplie] = useState(false);

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
    setReaction(avant ? null : "jaime");
    setNbReactions((n) => n + (avant ? -1 : 1));
    try {
      setReaction(await basculerReaction(post.id));
    } catch {
      setReaction(avant);
      setNbReactions((n) => n + (avant ? 1 : -1));
    }
  }

  async function enregistrer() {
    if (!connecte()) return;
    const avant = favori;
    setFavori(!avant);
    try {
      setFavori(await basculerFavori(post.id, avant));
    } catch {
      setFavori(avant);
    }
  }

  async function partager() {
    const url = `${window.location.origin}/?post=${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: "Diako", text: post.place ?? "", url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Lien copié");
      }
    } catch {
      /* annulé */
    }
  }

  const texte = post.body ?? "";
  const long = texte.length > SEUIL;
  const visible = deplie || !long ? texte : texte.slice(0, SEUIL).trimEnd() + "…";
  const nom = post.author.name || "Membre Diako";

  return (
    <article className="relative h-full w-full snap-start snap-always overflow-hidden bg-black">
      {post.media?.length > 0 ? (
        <Carrousel
          images={post.media}
          alt={post.place ? `${post.place}, Madagascar` : nom}
          prioritaire={prioritaire}
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-primary to-primary-soft px-8">
          <p className="max-w-prose whitespace-pre-line text-center text-lg text-white">{texte}</p>
        </div>
      )}

      {/* Voile du haut : rend le nom lisible sur une photo claire */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent" />

      <header className="absolute inset-x-0 top-0 flex items-center gap-2.5 px-4 pt-3">
        <Link
          to={`/user/${post.author.id}`}
          className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white/20 text-xs font-semibold text-white ring-1 ring-white/40"
        >
          {post.author.avatar ? (
            <img src={getThumbUrl(post.author.avatar)} alt="" width={36} height={36} className="h-9 w-9 object-cover" />
          ) : (
            nom.slice(0, 1).toUpperCase()
          )}
        </Link>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-white drop-shadow">{nom}</p>
          {post.place && (
            <p className="flex items-center gap-0.5 text-xs text-white/85 drop-shadow">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {post.place}
            </p>
          )}
        </div>
      </header>

      {/* Colonne d'actions à droite, sous le pouce */}
      <div className="absolute bottom-28 right-2 flex flex-col items-center gap-1">
        <button
          onClick={reagir}
          aria-pressed={!!reaction}
          aria-label="J'aime"
          className="grid h-12 w-12 place-items-center rounded-full text-white drop-shadow-lg"
        >
          <Heart
            className={cn("h-7 w-7 transition-transform", reaction && "scale-110 fill-accent text-accent")}
            aria-hidden="true"
          />
        </button>
        <span className="-mt-1 text-xs font-semibold text-white drop-shadow">{nbReactions || ""}</span>

        <button
          onClick={() => onCommenter(post)}
          aria-label="Commenter"
          className="mt-2 grid h-12 w-12 place-items-center rounded-full text-white drop-shadow-lg"
        >
          <MessageCircle className="h-7 w-7" aria-hidden="true" />
        </button>
        <span className="-mt-1 text-xs font-semibold text-white drop-shadow">
          {post.comments_count || ""}
        </span>

        <button
          onClick={() => void partager()}
          aria-label="Partager"
          className="mt-2 grid h-12 w-12 place-items-center rounded-full text-white drop-shadow-lg"
        >
          <Send className="h-7 w-7" aria-hidden="true" />
        </button>

        <button
          onClick={enregistrer}
          aria-pressed={favori}
          aria-label="Enregistrer"
          className="mt-2 grid h-12 w-12 place-items-center rounded-full text-white drop-shadow-lg"
        >
          <Bookmark className={cn("h-7 w-7", favori && "fill-white")} aria-hidden="true" />
        </button>
      </div>

      {/* Voile du bas + texte */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-60 bg-gradient-to-t from-black/80 via-black/45 to-transparent" />

      {post.media?.length > 0 && texte && (
        <div className="absolute inset-x-0 bottom-0 px-4 pb-20">
          <p className="max-w-[80%] whitespace-pre-line text-sm leading-relaxed text-white drop-shadow">
            {visible}
            {long && !deplie && (
              <button onClick={() => setDeplie(true)} className="ml-1 font-semibold text-white/80">
                plus
              </button>
            )}
          </p>
        </div>
      )}
    </article>
  );
}
