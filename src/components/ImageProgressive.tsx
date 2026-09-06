import { useState } from "react";
import { getThumbUrl, jeuDeTailles } from "@/lib/imageThumb";
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
  fondSombre = false,
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
  /** Scène noire (fil plein écran) : la case d'attente est noire, pas papier.
   *  Sinon le texte blanc posé sur la photo n'a AUCUN contraste tant qu'elle
   *  n'est pas arrivée (axe : 1,09:1, 06/09/2026). */
  fondSombre?: boolean;
}) {
  const [chargee, setChargee] = useState(false);
  const [casse, setCasse] = useState(false);
  // La vraie image ne remplace pas la vignette d'un coup sec : elle se pose.
  const vignette = getThumbUrl(src);
  const aVignette = vignette !== src;

  return (
    <div className={cn("relative h-full w-full overflow-hidden", fondSombre ? "bg-black" : "bg-muted")}>
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
        /* 06/09/2026 : les trois variantes (480 / 960 / 1600 WebP) au lieu de
           « vignette ou original JPEG » — sur un 390 px à densité 2 le
           navigateur prenait l'original de 80-90 Ko. Après un échec (variante
           absente : o2switch rend index.html en 200), plus de srcSet du tout,
           sinon le navigateur repartait sur la même candidate. */
        srcSet={!casse && aVignette && largeurAffichee ? (jeuDeTailles(src) ?? undefined) : undefined}
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
