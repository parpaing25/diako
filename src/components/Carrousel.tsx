import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ImageProgressive } from "@/components/ImageProgressive";
import { Visionneuse } from "@/components/Visionneuse";
import { cn } from "@/lib/utils";
import type { Media } from "@/lib/api";

/**
 * Carrousel d'images.
 *
 * ⚠ QUALITÉ — chaque image est servie en pleine résolution (2000 px) via
 * ImageProgressive, qui affiche d'abord la vignette floutée puis la vraie
 * image. Servir directement la vignette de 480 px en plein écran, comme je le
 * faisais, l'agrandissait 4 à 5 fois : c'était la cause de la pixelisation.
 *
 * Défilement natif avec accroche plutôt qu'une bibliothèque : c'est le geste
 * attendu du doigt, ça pèse zéro kilo-octet, et ça reste fluide sur un Android
 * d'entrée de gamme.
 */
export function Carrousel({
  images,
  alt = "",
  prioritaire = false,
  /** `couvrir` remplit le cadre (fil immersif), `contenir` montre toute l'image. */
  ajustement = "couvrir",
  /**
   * 🔴 CE PARAMÈTRE MANQUAIT, ET C'EST CE QUI RENDAIT LE FIL SI LENT.
   *    `ImageProgressive` n'émet un `srcset` QUE si on lui dit la largeur réelle
   *    du créneau — sans elle, le navigateur n'a aucun moyen de choisir et
   *    télécharge l'ORIGINAL. Mesuré : 728 Ko à 1 Mo par photo, 2,99 à 3,61 s
   *    hors 3G, et la vignette EN PLUS. Cinq photos par publication, trois
   *    publications à l'écran : le fil demandait plus de dix mégaoctets.
   *    Avec la largeur, il prend la variante 960 — 78 Ko mesurés.
   * ⚠ Le défaut de « 100vw » est le cas du fil immersif, qui occupe tout
   *   l'écran. Un appelant qui affiche plus petit DOIT le dire.
   */
  largeurAffichee = "100vw",
  /**
   * ⭐ CLIQUER OUVRE LA PHOTO EN GRAND. Vrai par défaut : sur un site de
   *   voyage, toucher une image POUR LA VOIR est le geste le plus attendu, et
   *   il ne faisait rien du tout jusqu'ici.
   * ⚠ Un appelant peut le refuser — une vignette de 96 px dans une liste n'a
   *   rien de plus à montrer en grand, et un clic qui ouvre un plein écran par
   *   surprise se lit comme un bug.
   */
  agrandissable = true,
  /** Le crédit de la photo, affiché en bas de la visionneuse. */
  credit = null,
  /**
   * ⭐ Une vidéo dans le fil plein écran démarre seule, muette, en boucle —
   *   le geste d'Instagram. Dans une carte, elle attend qu'on la lance.
   */
  videoAuto = false,
  /**
   * ⭐ CE QUE FAIT LE CLIC SUR L'IMAGE, quand ce n'est pas « ouvrir en grand ».
   *   Dans un fil, toucher la photo doit mener au RÉCIT : la visionneuse y
   *   montrerait la même image sans le texte, sans le lieu, sans les
   *   commentaires. Sur la page du récit, en revanche, la visionneuse garde
   *   tout son sens — d'où un réglage par appelant, et non une règle globale.
   * ⚠ Prend le pas sur `agrandissable`.
   */
  alClic = null,
}: {
  images: Media[];
  alt?: string;
  prioritaire?: boolean;
  ajustement?: "couvrir" | "contenir";
  largeurAffichee?: string;
  agrandissable?: boolean;
  alClic?: (() => void) | null;
  credit?: string | null;
  videoAuto?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [ouverte, setOuverte] = useState<number | null>(null);
  const piste = useRef<HTMLDivElement>(null);

  if (!images?.length) return null;

  const allerA = (i: number) => {
    const el = piste.current;
    if (!el) return;
    el.scrollTo({ left: el.clientWidth * i, behavior: "smooth" });
    setIndex(i);
  };

  const auDefilement = () => {
    const el = piste.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(i);
  };

  const unique = images.length === 1;

  return (
    <div className="relative h-full w-full">
      <div
        ref={piste}
        onScroll={auDefilement}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((m, i) => (
          /* ⚠ UN VRAI `<button>`, PAS UN `<div onClick>`. Il apporte le focus
             clavier, la touche Entrée et le rôle annoncé par un lecteur
             d'écran — trois choses qu'un div ne donne jamais, et qu'on
             réécrirait mal à la main.
             ⚠ `type="button"` : ce carrousel peut vivre dans un formulaire
             (l'aperçu de /publier), où un bouton sans type SOUMET la page. */
          <div key={m.url + i} className="h-full w-full shrink-0 snap-center">
            {m.type === "video" ? (
              /* ⚠ Pas de bouton autour d'une vidéo : ses commandes ont besoin du
                 clic. `playsInline` : sans lui, iOS ouvre le lecteur plein
                 écran et sort du fil. `preload="metadata"` : on ne télécharge
                 pas une vidéo qu'on n'a pas lancée — c'est le forfait qui paie. */
              <video
                src={m.url}
                poster={m.poster}
                controls={!videoAuto}
                autoPlay={videoAuto}
                muted={videoAuto}
                loop={videoAuto}
                playsInline
                preload={videoAuto ? "auto" : "metadata"}
                width={m.w}
                height={m.h}
                className={cn(
                  "h-full w-full bg-black",
                  ajustement === "couvrir" ? "object-cover" : "object-contain"
                )}
              >
                Votre navigateur ne lit pas cette vidéo.
              </video>
            ) : alClic || agrandissable ? (
              <button
                type="button"
                onClick={() => (alClic ? alClic() : setOuverte(i))}
                aria-label={alClic ? "Ouvrir le récit" : "Voir la photo en grand"}
                className={cn(
                  "block h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  alClic ? "cursor-pointer" : "cursor-zoom-in"
                )}
              >
                <ImageProgressive
                  src={m.url}
                  alt={i === 0 ? alt : ""}
                  w={m.w}
                  h={m.h}
                  prioritaire={prioritaire && i === 0}
                  ajustement={ajustement === "couvrir" ? "cover" : "contain"}
                  largeurAffichee={largeurAffichee}
                />
              </button>
            ) : (
            <ImageProgressive
              src={m.url}
              alt={i === 0 ? alt : ""}
              w={m.w}
              h={m.h}
              prioritaire={prioritaire && i === 0}
              ajustement={ajustement === "couvrir" ? "cover" : "contain"}
              largeurAffichee={largeurAffichee}
            />
            )}
          </div>
        ))}
      </div>

      {ouverte !== null && (
        <Visionneuse
          images={images}
          depart={ouverte}
          alt={alt}
          credit={credit}
          onFermer={() => setOuverte(null)}
        />
      )}

      {!unique && (
        <>
          <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            {index + 1}/{images.length}
          </span>

          {index > 0 && (
            <button
              onClick={() => allerA(index - 1)}
              aria-label="Image précédente"
              className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-foreground shadow md:grid"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          {index < images.length - 1 && (
            <button
              onClick={() => allerA(index + 1)}
              aria-label="Image suivante"
              className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-foreground shadow md:grid"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {images.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-4 bg-white" : "w-1.5 bg-white/55"
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
