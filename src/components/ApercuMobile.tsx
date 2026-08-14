import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Smartphone } from "lucide-react";

/**
 * L'APERÇU TÉLÉPHONE À CÔTÉ DE LA CONSOLE — écran W4 de la maquette.
 *
 * ⚠ POURQUOI UN IFRAME ET PAS UNE DEUXIÈME MISE EN PAGE. On aurait pu
 *   redessiner un aperçu « qui ressemble » à la fiche publique. Il aurait
 *   dérivé au premier changement de la vraie page, et le gérant aurait réglé
 *   son catalogue sur un aperçu qui ment. Ici c'est LA page publique, à
 *   390 px de large : ce qu'il voit est exactement ce que le voyageur verra.
 *
 * ⚠ IL NE SE RECHARGE PAS À CHAQUE FRAPPE. Une fiche complète, c'est des
 *   photos : la recharger à chaque caractère saisi coûterait des mégaoctets
 *   sur une connexion malgache. Il se rafraîchit après un enregistrement, ou
 *   à la demande.
 *
 * ⚠ CE QU'IL MONTRE, C'EST LA PAGE PUBLIÉE. Une fiche encore en brouillon
 *   n'existe pas pour un visiteur : l'aperçu le dit au lieu d'afficher une
 *   page d'erreur qu'on prendrait pour un bug.
 */
export function ApercuMobile({
  slug,
  publiee,
  /** Change de valeur après chaque enregistrement : l'aperçu se recharge. */
  version,
}: {
  slug: string;
  publiee: boolean;
  version?: number;
}) {
  const [charge, setCharge] = useState(false);
  const [cle, setCle] = useState(0);

  const rafraichir = useCallback(() => {
    setCharge(false);
    setCle((n) => n + 1);
  }, []);

  useEffect(() => {
    if (version === undefined) return;
    rafraichir();
  }, [version, rafraichir]);

  return (
    <aside className="sticky top-20 hidden h-fit w-[400px] shrink-0 xl:block">
      <div className="flex items-center gap-2">
        <Smartphone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <p className="flex-1 text-sm font-semibold">Ce que voit le voyageur</p>
        <button
          onClick={rafraichir}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-input px-3 text-xs font-medium"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Rafraîchir
        </button>
      </div>

      {publiee ? (
        <div className="relative mt-2 overflow-hidden rounded-[2rem] border-[10px] border-foreground/85 bg-background shadow-xl">
          {!charge && <div className="dk-skeleton absolute inset-0" />}
          <iframe
            key={cle}
            /* Le compteur dans l'URL force une vraie requête : remonter un
               iframe sur la même adresse peut resservir le cache, et le gérant
               croirait alors que son enregistrement n'a rien changé. */
            src={`/p/${slug}?apercu=${cle}`}
            title="Aperçu de la fiche sur téléphone"
            onLoad={() => setCharge(true)}
            className="h-[600px] w-full border-0 bg-background"
          />
        </div>
      ) : (
        <div className="mt-2 rounded-2xl border border-dashed border-border p-6 text-center">
          <p className="text-sm font-medium">La fiche n'est pas encore publiée</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Tant qu'elle est en brouillon, aucun voyageur ne la voit. Publiez-la
            depuis l'onglet « Ma fiche » pour l'afficher ici telle qu'elle
            apparaîtra.
          </p>
        </div>
      )}

      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Aperçu à 390 px, la largeur d'un téléphone courant. C'est la vraie page,
        pas une imitation.
      </p>
    </aside>
  );
}
