import { Link } from "react-router-dom";
import { MapPin, Star } from "lucide-react";
import { BadgeVerification } from "@/components/Badges";
import { ImageProgressive } from "@/components/ImageProgressive";
import { unite, type ResultatPage } from "@/lib/etablissements";
import { Prix } from "@/components/Prix";
import { cn } from "@/lib/utils";

const LIBELLE: Record<string, string> = {
  hotel: "Hôtel",
  restaurant: "Restaurant",
  agence_voyage: "Agence",
  guide: "Guide",
  transporteur: "Transport",
  location_vehicule: "Location",
  site_attraction: "Site",
  organisateur_evenement: "Événementiel",
};

/**
 * Carte d'un établissement RÉEL.
 *
 * Remplace PlaceCard, qui affichait des notes et des nombres d'avis inventés
 * (« 4.6 (18) ») indiscernables de vraies données. Ici, ce qui n'existe pas
 * n'est pas affiché : pas de note tant que personne n'a noté, pas de prix tant
 * qu'aucune offre n'est saisie. Un blanc est plus honnête qu'un chiffre faux.
 */
export function FicheCard({ fiche, platCherche }: { fiche: ResultatPage; platCherche?: boolean }) {
  const prix = platCherche && fiche.prix_du_plat != null ? fiche.prix_du_plat : fiche.price_min_ar;
  const uniteAffichee = platCherche && fiche.prix_du_plat != null ? "le plat" : unite(fiche.price_min_unit);

  return (
    <Link
      to={`/p/${fiche.slug}`}
      className="dk-reveal dk-carte group flex flex-col overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="dk-zoom aspect-[4/3] w-full overflow-hidden bg-muted">
        {fiche.cover_url ? (
          <ImageProgressive src={fiche.cover_url} alt={fiche.name} ajustement="cover"
              largeurAffichee={"(min-width:1280px) 30vw, (min-width:640px) 45vw, 92vw"}
            />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-secondary to-secondary/40">
            <span className="px-4 text-center text-sm font-medium text-primary">{fiche.name}</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
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

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {fiche.place_name && (
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {fiche.place_name}
            </span>
          )}
          {fiche.categories.slice(0, 2).map((c) => (
            <span key={c} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-primary">
              {LIBELLE[c] ?? c}
            </span>
          ))}
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
