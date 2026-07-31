import { useState } from "react";
import { getThumbUrl } from "@/lib/imageThumb";
import { cn } from "@/lib/utils";

/**
 * Image en deux temps : vignette d'abord, pleine qualité ensuite.
 *
 * Le problème à résoudre : les photos font ~730 Ko en 2000 px pour être nettes
 * en plein écran. Sur une 3G malgache, c'est plusieurs secondes devant un cadre
 * vide — et l'utilisateur croit que ça a planté.
 *
 * La vignette WebP fait 18 Ko : elle arrive presque instantanément, on l'affiche
 * agrandie et légèrement floutée, puis la vraie image se pose par-dessus dès
 * qu'elle est prête. Le cadre n'est jamais vide, et la qualité finale n'est pas
 * sacrifiée.
 */
export function ImageProgressive({
  src,
  alt,
  w,
  h,
  prioritaire = false,
  ajustement = "cover",
}: {
  src: string;
  alt: string;
  w?: number;
  h?: number;
  prioritaire?: boolean;
  ajustement?: "cover" | "contain";
}) {
  const [chargee, setChargee] = useState(false);
  const vignette = getThumbUrl(src);
  const aVignette = vignette !== src;

  return (
    <div className="relative h-full w-full overflow-hidden bg-muted">
      {aVignette && !chargee && (
        <img
          src={vignette}
          alt=""
          aria-hidden="true"
          className={cn(
            "absolute inset-0 h-full w-full scale-105 blur-md",
            ajustement === "cover" ? "object-cover" : "object-contain"
          )}
        />
      )}

      <img
        src={src}
        alt={alt}
        width={w || 1600}
        height={h || 1200}
        loading={prioritaire ? "eager" : "lazy"}
        fetchPriority={prioritaire ? "high" : "auto"}
        decoding="async"
        onLoad={() => setChargee(true)}
        onError={() => setChargee(true)}
        className={cn(
          "relative h-full w-full transition-opacity duration-300",
          ajustement === "cover" ? "object-cover" : "object-contain",
          chargee || !aVignette ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}
