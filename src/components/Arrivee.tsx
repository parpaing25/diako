import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Share2 } from "lucide-react";
import { ImageProgressive } from "@/components/ImageProgressive";
import { PartagerMenu } from "@/components/PartagerMenu";
import { cn } from "@/lib/utils";

/**
 * LES TROIS PIÈCES COMMUNES DES PAGES D'ARRIVÉE — /lieu/:slug et /site/:slug.
 *
 * ⚠ CE QUI LES JUSTIFIE. Ces deux pages reçoivent les visiteurs des
 *   publications Facebook : sans compte, sans historique, dans le navigateur
 *   intégré de Facebook. Elles doivent donc dire en une ligne ce qu'est Diako,
 *   montrer leur photo bord à bord avec son crédit, et se partager d'un geste.
 *   Écrites une fois ici, elles ne divergent pas d'une page à l'autre.
 */

/**
 * La ligne d'accueil, à la place du bouton « Retour » quand on arrive
 * directement : il n'y a rien derrière à quoi revenir, et le visiteur ne sait
 * pas encore où il est.
 */
export function LigneAccueil({ className }: { className?: string }) {
  return (
    <p className={cn("dk-secondaire", className)}>
      {/* ⚠ LA CIBLE FAIT 44 PX SANS ÉPAISSIR LA LIGNE. Sur un élément EN LIGNE,
          le rembourrage vertical agrandit la zone de toucher mais pas la
          ligne : la phrase tient sur deux lignes de 19 px au lieu de pousser
          la photo de 44 px vers le bas. */}
      <Link
        to="/"
        className="py-3 font-semibold text-primary underline-offset-4 hover:underline"
      >
        Diako
      </Link>{" "}
      — où dormir, où manger et avec qui partir à Madagascar. Gratuit, sans compte pour lire.
    </p>
  );
}

/**
 * Le bouton « Partager », libellé visible, qui ouvre le menu existant
 * (Facebook, WhatsApp, lien, partage natif).
 *
 * ⚠ `onFermer` EST STABLE (useCallback) : `PartagerMenu` s'en sert comme
 *   dépendance de son écouteur clavier, qui se rebrancherait sinon à chaque
 *   rendu.
 */
export function BoutonPartager({
  url,
  texte,
  className,
}: {
  /** URL ABSOLUE et canonique, sans paramètres. */
  url: string;
  texte: string;
  className?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const fermer = useCallback(() => setOuvert(false), []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-full border border-input bg-card px-4 text-sm font-semibold hover:border-primary hover:text-primary",
          className
        )}
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        Partager
      </button>
      {ouvert && <PartagerMenu url={url} texte={texte} onFermer={fermer} />}
    </>
  );
}

/**
 * La couverture d'une fiche : bord à bord sur téléphone, crédit incrusté, frise
 * tissée dessous. Sans photo, un bandeau de lamba — jamais un rectangle vide.
 *
 * 🔴 LE CRÉDIT EST DANS L'IMAGE, PAS EN PIED DE SITE. Une partie des photos
 *    vient de Wikimedia Commons en CC BY ou CC BY-SA, qui EXIGENT de nommer
 *    l'auteur et la licence ; une fiche partagée seule doit emporter son
 *    crédit. Quand la source est une adresse, c'est le nom de l'auteur qui
 *    porte le lien : coupé à deux lignes, le crédit ne perd jamais son lien.
 *
 * ⚠ AUCUN TEXTE SUR LE LAMBA : le corail et l'or ne portent jamais de texte.
 */
export function CouvertureFiche({
  src,
  alt,
  credit,
  licence,
  source,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  credit?: string | null;
  licence?: string | null;
  source?: string | null;
  className?: string;
}) {
  if (!src)
    return (
      <div className={cn("-mx-4 mb-4 sm:mx-0", className)} aria-hidden="true">
        <div className="dk-lamba h-24 sm:rounded-2xl" />
      </div>
    );

  const lien = source && /^https?:\/\//i.test(source.trim()) ? source.trim() : null;
  const auteur = credit?.trim() || null;
  const lic = licence?.trim() || null;

  return (
    <div className={cn("-mx-4 mb-4 sm:mx-0", className)}>
      <figure className="relative h-56 overflow-hidden bg-muted sm:h-72 sm:rounded-t-2xl">
        {/* Premier élément de la page : c'est lui le LCP, il part en priorité. */}
        <ImageProgressive
          src={src}
          alt={alt}
          prioritaire
          ajustement="cover"
          largeurAffichee="(min-width:1280px) 620px, 100vw"
          plafond={960}
        />
        {(auteur || lic || lien) && (
          <figcaption className="absolute bottom-0 right-0 max-w-[88%] rounded-tl-lg bg-black/60 px-2 py-1 text-xs leading-snug text-white">
            <span className="line-clamp-2">
              Photo&nbsp;:{" "}
              {lien ? (
                <a href={lien} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
                  {auteur ?? "source"}
                </a>
              ) : (
                auteur
              )}
              {lic ? `${auteur || lien ? " · " : ""}${lic}` : ""}
            </span>
          </figcaption>
        )}
      </figure>
      <div className="dk-tissage" aria-hidden="true" />
    </div>
  );
}
