import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Media } from "@/lib/api";

/**
 * Carrousel d'images.
 *
 * ⚠ QUALITÉ — on sert l'image ORIGINALE (2000 px), jamais la vignette.
 * La vignette fait 480 px de large : affichée en plein écran sur un téléphone
 * de 1080 px à densité 2x, elle est agrandie 4 à 5 fois et devient une bouillie.
 * C'était la cause de la pixelisation. La vignette reste utile pour les
 * avatars et les listes, pas pour une photo qu'on regarde.
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
}: {
  images: Media[];
  alt?: string;
  prioritaire?: boolean;
  ajustement?: "couvrir" | "contenir";
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
            <img
              src={m.url}
              alt={i === 0 ? alt : ""}
              width={m.w || 1600}
              height={m.h || 1200}
              loading={prioritaire && i === 0 ? "eager" : "lazy"}
              fetchPriority={prioritaire && i === 0 ? "high" : "auto"}
              decoding="async"
              className={cn(
                "h-full w-full",
                ajustement === "couvrir" ? "object-cover" : "object-contain"
              )}
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
