import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ImageProgressive } from "@/components/ImageProgressive";
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
}: {
  images: Media[];
  alt?: string;
  prioritaire?: boolean;
  ajustement?: "couvrir" | "contenir";
  largeurAffichee?: string;
}) {
  const [index, setIndex] = useState(0);
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
          <div key={m.url + i} className="h-full w-full shrink-0 snap-center">
            <ImageProgressive
              src={m.url}
              alt={i === 0 ? alt : ""}
              w={m.w}
              h={m.h}
              prioritaire={prioritaire && i === 0}
              ajustement={ajustement === "couvrir" ? "cover" : "contain"}
              largeurAffichee={largeurAffichee}
            />
          </div>
        ))}
      </div>

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
