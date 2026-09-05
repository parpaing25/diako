import { Link } from "react-router-dom";
import { MapPin, UtensilsCrossed } from "lucide-react";
import { ImageProgressive } from "@/components/ImageProgressive";
import type { PlatAtlas } from "@/lib/decouverte";
import type { Lieu } from "@/lib/etablissements";

/**
 * LES CARTES DU RÉFÉRENTIEL — un plat, une destination.
 *
 * 🔴 POURQUOI CE FICHIER EXISTE. `CartePlat` vivait au fond de `Plats.tsx`, en
 *    fonction locale non exportée. Les onglets thématiques du fil en ont besoin
 *    aussi : la recopier aurait créé deux cartes de plat divergentes, et c'est
 *    exactement comme ça que la même donnée a fini par s'afficher de deux
 *    façons selon la largeur de l'écran (voir le défaut corrigé dans
 *    `FicheCard`, où un prix disait « 93 000 Ar » ici et « Nous consulter » là).
 *    Une carte, un fichier, tous les écrans.
 *
 * ⚠ LES ÉTABLISSEMENTS ONT DÉJÀ LA LEUR : `FicheCard`. On ne la double pas.
 */

/**
 * Un plat de l'atlas.
 *
 * 🔴 LE DÉFAUT CORRIGÉ EN PASSANT. Cette carte affichait
 *    « aucune adresse encore » EN DUR, sur les 95 plats, avec en commentaire
 *    « c'est vrai pour les 95 ». Recompté le 01/09/2026 : 98 lignes de carte de
 *    restaurant sont saisies, 3 sont rattachées à un plat de l'atlas. La phrase
 *    était donc FAUSSE sur trois cartes — et c'est le genre de fausseté qui ne
 *    se signale jamais toute seule, puisque rien ne plante.
 *
 * ⚠ ON LIT LE COMPTEUR, ON NE LE DEVINE PAS. `nb_restaurants` est maintenu par
 *   déclencheur (0113). Quand il est absent de la réponse (un appelant qui ne
 *   l'a pas demandé), on n'affiche RIEN : un blanc est honnête, « aucune
 *   adresse » ne l'est pas.
 */
export function CartePlat({ plat }: { plat: PlatAtlas }) {
  const regime = [
    plat.is_vegetarian && "végétarien",
    plat.has_pork && "porc",
    plat.has_seafood && "fruits de mer",
    plat.has_peanut && "arachide",
  ].filter(Boolean)[0] as string | undefined;

  const adresses = plat.nb_restaurants ?? plat.nb_adresses;

  return (
    <Link
      to={`/plat/${plat.slug}`}
      className="dk-reveal dk-carte block overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="dk-zoom aspect-[4/3] bg-secondary">
        {plat.photo_url ? (
          <ImageProgressive
            src={plat.photo_url}
            alt={plat.name_fr}
            ajustement="cover"
            largeurAffichee={
              "(min-width:1536px) 22vw, (min-width:1280px) 25vw, (min-width:768px) 33vw, 50vw"
            }
          />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <UtensilsCrossed className="h-7 w-7 text-primary/40" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-semibold leading-tight">{plat.name_fr}</p>
        <p className="dk-secondaire mt-0.5 truncate">
          {[plat.family, plat.typical_place?.region ?? regime].filter(Boolean).join(" · ")}
        </p>
        {adresses != null && (
          <p className="mt-1.5 text-[11px] font-semibold text-accent-strong">
            {adresses === 0
              ? "aucune adresse encore"
              : `${adresses} adresse${adresses > 1 ? "s" : ""}`}
          </p>
        )}
      </div>
    </Link>
  );
}

/**
 * Une destination du référentiel.
 *
 * ⚠ PAS DE CADRE GRIS QUAND IL N'Y A PAS DE PHOTO. 147 destinations sur 508 en
 *   portent une (recompté le 01/09/2026) : l'absence est le cas COURANT, pas le
 *   cas dégradé. On pose alors le nom sur un aplat, comme `FicheCard`.
 *
 * ⚠ AUCUN COMPTEUR AFFICHÉ ICI. `places.nb_pages` et `places.nb_posts` existent,
 *   mais ce sont précisément les deux compteurs que 0092 a dû réparer parce
 *   qu'ils mentaient. Le nom, la région et le résumé suffisent à une vignette.
 */
export function CarteLieu({ lieu }: { lieu: Lieu }) {
  return (
    <Link
      to={`/lieu/${lieu.slug}`}
      className="dk-reveal dk-carte block overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="dk-zoom aspect-[4/3] bg-secondary">
        {lieu.cover_url ? (
          <ImageProgressive
            src={lieu.cover_url}
            alt={lieu.name_fr}
            ajustement="cover"
            largeurAffichee={
              "(min-width:1536px) 22vw, (min-width:1280px) 25vw, (min-width:768px) 33vw, 50vw"
            }
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-secondary to-secondary/40 px-3">
            <span className="text-center text-sm font-medium text-primary">
              {lieu.name_fr}
            </span>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-semibold leading-tight">{lieu.name_fr}</p>
        {lieu.region && (
          <p className="dk-secondaire mt-0.5 flex items-center gap-0.5 truncate">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
            {lieu.region}
          </p>
        )}
        {lieu.summary && (
          <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{lieu.summary}</p>
        )}
      </div>
    </Link>
  );
}
