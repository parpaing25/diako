import { Link } from "react-router-dom";
import { MapPin, Star } from "lucide-react";
import { BadgeVerification } from "@/components/Badges";
import { IconeCategorie } from "@/components/IconeCategorie";
import { ImageProgressive } from "@/components/ImageProgressive";
import {
  categoriesOrdonnees,
  lambaDe,
  LIBELLE_CATEGORIE,
  unite,
  type ResultatPage,
} from "@/lib/etablissements";
import { Prix } from "@/components/Prix";
import { cn } from "@/lib/utils";

/**
 * Carte d'un établissement RÉEL.
 *
 * Remplace PlaceCard, qui affichait des notes et des nombres d'avis inventés
 * (« 4.6 (18) ») indiscernables de vraies données. Ici, ce qui n'existe pas
 * n'est pas affiché : pas de note tant que personne n'a noté, pas de prix tant
 * qu'aucune offre n'est saisie. Un blanc est plus honnête qu'un chiffre faux.
 *
 * ⭐ SANS PHOTO, LA CARTE EST COMPACTE — et c'est le cas de 94 % des fiches.
 *   Elle ouvrait sur un bloc 4:3 beige d'environ 270 px portant le nom, répété
 *   juste dessous : une liste de douze hôtels faisait douze écrans de beige.
 *   Un liseré de lamba (la teinte dit la famille) et un médaillon d'icône à
 *   côté du nom suffisent : la carte passe d'environ 330 à 150 px, et on
 *   compare les adresses au lieu de faire défiler des aplats.
 */
export function FicheCard({ fiche, platCherche }: { fiche: ResultatPage; platCherche?: boolean }) {
  const prix = platCherche && fiche.prix_du_plat != null ? fiche.prix_du_plat : fiche.price_min_ar;
  const uniteAffichee = platCherche && fiche.prix_du_plat != null ? "le plat" : unite(fiche.price_min_unit);
  const avecPhoto = !!fiche.cover_url;

  return (
    <Link
      to={`/p/${fiche.slug}`}
      className="dk-reveal dk-carte group flex flex-col overflow-hidden rounded-2xl border border-border bg-card"
    >
      {avecPhoto ? (
        <div className="dk-zoom aspect-[4/3] w-full overflow-hidden bg-muted">
          <ImageProgressive
            src={fiche.cover_url!}
            alt={fiche.name}
            ajustement="cover"
            largeurAffichee={"(min-width:1280px) 30vw, (min-width:640px) 45vw, 92vw"}
          />
        </div>
      ) : (
        /* Un motif, pas une image : il ne prétend rien montrer de l'endroit,
           et ne porte jamais de texte. */
        <div aria-hidden="true" className={cn("dk-lamba h-2.5 w-full shrink-0", lambaDe(fiche.categories))} />
      )}

      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <div className="flex items-start gap-2.5">
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
              <h3 className="min-w-0 flex-1 font-semibold leading-tight">{fiche.name}</h3>
              {/* ⚠ La coche seule laissait croire « bon établissement ». Le badge
                  nomme desormais CE QUI est verifie — un NIF n'est pas une chambre
                  propre, et le confondre engagerait Diako sur une prestation qu'il
                  ne fournit pas. */}
              {fiche.verification_status !== "none" && (
                <BadgeVerification niveau={fiche.verification_status} className="mt-0.5 shrink-0" />
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {fiche.place_name && (
                <span className="inline-flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {fiche.place_name}
                </span>
              )}
              {categoriesOrdonnees(fiche.categories)
                .slice(0, 2)
                .map((c) => (
                  <span key={c} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-primary-fort">
                    {LIBELLE_CATEGORIE[c] ?? c}
                  </span>
                ))}
            </div>
          </div>
        </div>

        {fiche.short_desc && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{fiche.short_desc}</p>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
          {/* 🔴 DÉFAUT CORRIGÉ : cette carte formatait le montant elle-même avec
              `ariary()`, court-circuitant <Prix>. Résultat mesuré sur le site :
              la même fiche affichait « 93 000 Ar la nuit » ici (sous 1024 px)
              et « Nous consulter » dans <FicheLigne> au-dessus — même donnée,
              même seconde, deux réponses selon la largeur de l'écran.
              ⚠ RÈGLE DU PROJET : aucun prix ne s'affiche hors de <Prix>. C'est
                lui, et lui seul, qui sait ce qu'un prix a le droit de dire. */}
          <Prix
            montant={prix}
            unite={platCherche ? "portion" : null}
            base={platCherche ? null : uniteAffichee}
            confirmeLe={null}
            taille="compacte"
          />

          {fiche.rating_count > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
              {fiche.rating_avg.toFixed(1)}
              <span className="text-muted-foreground/70">({fiche.rating_count})</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
