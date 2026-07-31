import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getThumbUrl } from "@/lib/imageThumb";
import { cn } from "@/lib/utils";
import type { Media } from "@/lib/api";

/**
 * Carrousel d'images façon Instagram.
 *
 * Défilement natif avec accroche (scroll-snap) plutôt qu'une bibliothèque :
 * c'est le geste que le doigt attend sur mobile, ça pèse zéro kilo-octet, et
 * ça fonctionne même si le JavaScript rame sur un Android d'entrée de gamme.
 *
 * ⚠ Le conteneur impose un ratio FIXE (4:5, le format portrait d'Instagram) :
 * sans cela, chaque image d'une hauteur différente ferait sauter tout le fil
 * en dessous à mesure qu'elles se chargent.
 */
export function Carrousel({ images, alt = "" }: { images: Media[]; alt?: string }) {
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
    <div className="relative -mx-4 md:mx-0 md:overflow-hidden md:rounded-xl">
      <div
        ref={piste}
        onScroll={auDefilement}
        className="flex aspect-[4/5] snap-x snap-mandatory overflow-x-auto overscroll-x-contain bg-muted [scrollbar-width:none] sm:aspect-square [&::-webkit-scrollbar]:hidden"
      >
        {images.map((m, i) => (
          <div key={m.url + i} className="h-full w-full shrink-0 snap-center">
            <img
              src={getThumbUrl(m.url)}
              alt={i === 0 ? alt : ""}
              width={m.w || 1080}
              height={m.h || 1350}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              className="h-full w-full object-cover"
              onError={(e) => {
                const img = e.currentTarget;
                if (img.src !== m.url) img.src = m.url;
              }}
            />
          </div>
        ))}
      </div>

      {!unique && (
        <>
          {/* Compteur, comme sur Instagram */}
          <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            {index + 1}/{images.length}
          </span>

          {/* Flèches — desktop uniquement : sur mobile, on fait glisser */}
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

          {/* Points de position */}
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
