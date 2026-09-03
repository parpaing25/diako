import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useConnexionRequise } from "@/hooks/useConnexionRequise";
import { PartagerMenu } from "@/components/PartagerMenu";
import { noterLieu } from "@/lib/affinites";
import { useVu } from "@/hooks/useVu";
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
  const [partage, setPartage] = useState(false);
  const racine = useRef<HTMLElement>(null);
  useVu(racine, post.id);
  const interesse = (poids: number) => noterLieu(post.place_slug ?? post.place, poids);

  /* ⚠ Le crochet porte desormais l'ACTION vers l'inscription : le toast seul
     laissait le visiteur devant un bouton muet, a l'instant precis ou il avait
     une raison de creer un compte. */
  const connecte = useConnexionRequise();

  async function reagir() {
    if (!connecte("réagir aux récits")) return;
    const avant = reaction;
    setReaction(avant ? null : "utile"); // ⚠ « jaime » refuse en base depuis 0031
    setNbReactions((n) => n + (avant ? -1 : 1));
    if (!avant) interesse(3);
    try {
      setReaction(await basculerReaction(post.id));
    } catch {
      setReaction(avant);
      setNbReactions((n) => n + (avant ? 1 : -1));
    }
  }

  async function enregistrer() {
    if (!connecte("garder ce récit")) return;
    const avant = favori;
    setFavori(!avant);
    if (!avant) interesse(3);
    try {
      setFavori(await basculerFavori(post.id, avant));
    } catch {
      setFavori(avant);
    }
  }

  function partager() {
    interesse(1);
    setPartage(true);
  }

  const texte = post.body ?? "";
  const long = texte.length > SEUIL;
  const visible = deplie || !long ? texte : texte.slice(0, SEUIL).trimEnd() + "…";
  const nom = post.author.name || "Membre Diako";

  return (
    <article ref={racine} className="relative h-full w-full snap-start snap-always overflow-hidden bg-black">
      {partage && (
        <PartagerMenu
          url={`${window.location.origin}/post/${post.id}`}
          texte={post.body ?? post.place ?? ""}
          onFermer={() => setPartage(false)}
        />
      )}
      {post.media?.length > 0 ? (
        <Carrousel
          images={post.media}
          alt={post.place ? `${post.place}, Madagascar` : nom}
          prioritaire={prioritaire}
          videoAuto
        />
      ) : (
        /* ⚠ SEUL ENDROIT DE CE FICHIER OU LE JETON S'APPLIQUE : ici le fond est
           `bg-primary`, donc `primary-foreground` s'inverse correctement avec le
           theme. Partout ailleurs l'ecran est un plein ecran NOIR avec une photo
           et des voiles sombres : le texte y reste blanc en dur, parce que la
           surface derriere lui ne change pas avec le theme.
           ⚠ Un jeton de couleur suit la surface qui est DERRIERE le texte, pas
             la palette de la page. */
        <div className="grid h-full w-full place-items-center bg-primary px-8">
          <p className="max-w-prose whitespace-pre-line text-center text-lg text-primary-foreground">{texte}</p>
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
          onClick={partager}
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

      {/* ⚠ Le texte deplie DOIT defiler dans son propre cadre.
          Ancre en bas d'un <article> en overflow-hidden, il grandissait vers
          le HAUT : un recit de 1 500 caracteres sortait par le haut de
          l'ecran et devenait illisible — precisement sur le contenu le plus
          interessant du site. D'ou max-h + overflow-y, et overscroll-contain
          pour que le geste ne fasse pas defiler la publication suivante. */}
      {post.media?.length > 0 && texte && (
        <div className="absolute inset-x-0 bottom-0 px-4 pb-20">
          <div
            className={cn(
              "max-w-[85%] overscroll-contain",
              deplie && "max-h-[45dvh] overflow-y-auto pr-1"
            )}
          >
            <p className="whitespace-pre-line text-sm leading-relaxed text-white drop-shadow">
              {visible}
              {long && !deplie && (
                <button
                  onClick={() => setDeplie(true)}
                  className="ml-1 font-semibold text-white/80"
                >
                  plus
                </button>
              )}
            </p>
            {/* ⭐ OUVRIR LE RÉCIT — il n'existait AUCUN chemin vers `/post/<id>`
                   depuis le téléphone : le fil immersif portait l'auteur, les
                   quatre commandes et « plus », mais pas la publication
                   elle-même. On ne pouvait donc lire un récit en entier, avec
                   ses commentaires, que sur un ordinateur.
                ⚠ Un libellé, pas un appui sur la photo : dans un fil qu'on
                  parcourt au pouce, toucher l'image se confond avec le geste
                  de défilement, et l'on ouvrirait un récit en voulant passer
                  au suivant. */}
            <div className="mt-1.5 flex items-center gap-3">
              {deplie && (
                <button
                  onClick={() => setDeplie(false)}
                  className="text-xs font-semibold text-white/70"
                >
                  reduire
                </button>
              )}
              <Link
                to={`/post/${post.id}`}
                className="inline-flex min-h-9 items-center rounded-full bg-white/15 px-3 text-xs font-semibold text-white backdrop-blur-sm"
              >
                Ouvrir le récit
              </Link>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
