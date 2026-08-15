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
  largeurAffichee,
}: {
  src: string;
  alt: string;
  w?: number;
  h?: number;
  prioritaire?: boolean;
  ajustement?: "cover" | "contain";
  /**
   * ⚠ LA LARGEUR RÉELLE DU CRÉNEAU, en CSS. C'est ce qui permet au navigateur
   *   de CHOISIR entre la vignette et l'originale au lieu de télécharger les
   *   deux. Sans elle, une carte de 390 px téléchargeait 18 Ko de vignette PUIS
   *   730 Ko d'original — pour afficher 390 px.
   *   Exemples : `"(min-width:1280px) 25vw, (min-width:640px) 50vw, 100vw"`.
   */
  largeurAffichee?: string;
}) {
  const [chargee, setChargee] = useState(false);
  const [casse, setCasse] = useState(false);
  // La vraie image ne remplace pas la vignette d'un coup sec : elle se pose.
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
        src={casse && aVignette ? vignette : src}
        /* 🔴 SANS `srcSet`, LE NAVIGATEUR TÉLÉCHARGEAIT LES DEUX IMAGES.
           La vignette 480 px arrivait, restait floue à l'écran, puis
           l'originale de 730 Ko se posait par-dessus : on payait 750 Ko pour
           afficher une carte de 390 px, et l'utilisateur voyait du flou
           pendant tout le trajet. Avec `srcSet` + `sizes`, le navigateur
           choisit UNE seule source, adaptée au créneau et à la densité de
           l'écran — et sur un petit créneau il prend la vignette, qui n'est
           alors plus floue du tout puisqu'elle est affichée à sa taille. */
        srcSet={aVignette && largeurAffichee ? `${vignette} 480w, ${src} 1600w` : undefined}
        sizes={aVignette && largeurAffichee ? largeurAffichee : undefined}
        alt={alt}
        width={w || 1600}
        height={h || 1200}
        loading={prioritaire ? "eager" : "lazy"}
        fetchPriority={prioritaire ? "high" : "auto"}
        decoding="async"
        onLoad={() => setChargee(true)}
        /* ⚠ ON RETOMBE SUR LA VIGNETTE, on ne se contente pas d'abandonner.
           `onError` se contentait de `setChargee(true)`, ce qui MASQUAIT la
           vignette déjà affichée et laissait un cadre vide avec le texte de
           remplacement — la pire des deux issues. */
        onError={() => {
          if (aVignette && !casse) setCasse(true);
          else setChargee(true);
        }}
        className={cn(
          "relative h-full w-full transition-opacity duration-300",
          ajustement === "cover" ? "object-cover" : "object-contain",
          chargee || !aVignette ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}
