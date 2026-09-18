import { Link } from "react-router-dom";
import { MapPin, Star } from "lucide-react";
import { BadgeVerification } from "@/components/Badges";
import { IconeCategorie } from "@/components/IconeCategorie";
import { ImageProgressive } from "@/components/ImageProgressive";
import { Prix } from "@/components/Prix";
import {
  lambaDe,
  libelleCategories,
  unite as libelleUnite,
  type ResultatPage,
} from "@/lib/etablissements";
import { cn } from "@/lib/utils";

/**
 * UN RÉSULTAT DE RECHERCHE EN LIGNE LARGE — écran W2 de la maquette.
 *
 * ⚠ POURQUOI PAS LA MÊME CARTE QU'EN MOBILE. Sur téléphone, une grille de
 *   vignettes est le bon format : on compare en faisant défiler. Sur un écran
 *   large, la même grille étirée fait perdre la seule chose qui compte quand
 *   on compare douze hôtels — l'ALIGNEMENT DES PRIX. Ici la colonne de droite
 *   est fixe : les montants tombent les uns sous les autres et se lisent d'un
 *   coup d'œil, comme dans une facture.
 *
 * ⚠ La description et les équipements ne tiennent que sur cette forme. En
 *   vignette, ils étaient tronqués à deux mots ou absents.
 *
 * ⭐ SANS PHOTO (94 % des fiches), LA COLONNE D'IMAGE DEVIENT UNE BANDE DE
 *   8 px au motif lamba. Elle réservait 150 × 168 px à un aplat beige qui
 *   répétait le nom écrit juste à côté. La ligne rétrécit, le médaillon dit la
 *   famille, et la colonne des prix reste alignée d'une ligne à l'autre.
 */
export function FicheLigne({
  fiche,
  platCherche,
  surligne,
  onSurvol,
}: {
  fiche: ResultatPage;
  platCherche?: boolean;
  /** Le repère correspondant est mis en évidence sur la carte. */
  surligne?: boolean;
  onSurvol?: (slug: string | null) => void;
}) {
  const platTrouve = platCherche && fiche.prix_du_plat != null;
  const montant = platTrouve ? fiche.prix_du_plat! : fiche.price_min_ar;
  const avecPhoto = !!fiche.cover_url;

  return (
    <Link
      to={`/p/${fiche.slug}`}
      onMouseEnter={() => onSurvol?.(fiche.slug)}
      onMouseLeave={() => onSurvol?.(null)}
      className={cn(
        "dk-reveal dk-carte grid overflow-hidden rounded-2xl border bg-card",
        avecPhoto ? "grid-cols-[150px_minmax(0,1fr)]" : "grid-cols-[8px_minmax(0,1fr)]",
        surligne ? "border-primary shadow-md" : "border-border"
      )}
    >
      {avecPhoto ? (
        <div className="dk-zoom relative min-h-[168px] bg-muted">
          <ImageProgressive
            src={fiche.cover_url!}
            alt={fiche.name}
            ajustement="cover"
            largeurAffichee={"(min-width:768px) 180px, 45vw"}
          />
          {fiche.verification_status !== "none" && (
            <BadgeVerification
              niveau={fiche.verification_status}
              className="absolute left-2 top-2"
            />
          )}
        </div>
      ) : (
        <div aria-hidden="true" className={cn("dk-lamba h-full w-full", lambaDe(fiche.categories))} />
      )}

      <div className="flex gap-4 p-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {!avecPhoto && (
            <span
              aria-hidden="true"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-soft text-primary-fort"
            >
              <IconeCategorie categories={fiche.categories} className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1.5">
              <h3 className="min-w-0 flex-1 text-[17px] font-bold leading-tight">{fiche.name}</h3>
              {/* Sans photo, le badge n'a plus d'image où se poser : il suit le nom. */}
              {!avecPhoto && fiche.verification_status !== "none" && (
                <BadgeVerification niveau={fiche.verification_status} className="mt-0.5 shrink-0" />
              )}
            </div>
            <p className="dk-secondaire mt-1">
              {[libelleCategories(fiche.categories, 3), fiche.place_name]
                .filter(Boolean)
                .join(" · ")}
            </p>

            {fiche.short_desc && (
              <p className="dk-corps mt-2.5 line-clamp-2 text-muted-foreground">{fiche.short_desc}</p>
            )}

            {fiche.landmark && (
              <p className="dk-secondaire mt-2 inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {fiche.landmark}
              </p>
            )}
          </div>
        </div>

        {/* ⚠ LA COLONNE DE PRIX, séparée par un filet. C'est elle qui rend la
            comparaison possible : même largeur pour tous, montant toujours à
            la même hauteur. */}
        <div className="flex w-[152px] shrink-0 flex-col items-end border-l border-border pl-4">
          {fiche.rating_count > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1 text-sm font-bold">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
              {fiche.rating_avg.toFixed(1)}
              <span className="font-normal text-muted-foreground">· {fiche.rating_count}</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Pas encore d'avis</span>
          )}

          {/* ⚠ « Tarif non communiqué » en petit : en taille normale il
              s'écrivait aussi gros que le nom de l'établissement, et c'était
              le texte le plus visible de la ligne. Un montant réel, lui,
              garde la taille qui l'aligne sur ses voisins. */}
          <Prix
            montant={montant}
            unite={platTrouve ? "portion" : null}
            base={platTrouve ? null : libelleUnite(fiche.price_min_unit)}
            aPartirDe={!platTrouve && montant != null}
            taille={montant == null ? "compacte" : "normale"}
            className="mt-4 items-end text-right"
          />

          <span className="mt-auto inline-flex min-h-10 w-full items-center justify-center rounded-full bg-accent-strong px-4 text-sm font-semibold text-accent-foreground">
            {montant == null ? "Demander un prix" : "Demander"}
          </span>
        </div>
      </div>
    </Link>
  );
}
