import { Link } from "react-router-dom";
import { FEUILLE_DE_ROUTE } from "@/lib/nav";

const COULEURS: Record<string, string> = {
  ouvert: "bg-primary/10 text-primary",
  "en cours": "bg-accent/10 text-accent",
  "à venir": "bg-muted text-muted-foreground",
};

/**
 * Rail de droite (≥ 1280 px).
 *
 * ⚠ Il ne contient QUE du contenu réel. Sur la version précédente de Diako,
 * cette colonne affichait « Nosy Be 1.2k posts », « Hôtel Sakamanga 4.8
 * (245 avis) » et « Festival Donia 15 Déc 2024 » — entièrement inventés, et
 * périmés de deux ans. On ne rejoue pas ça : tant qu'il n'y a pas de données,
 * on montre l'avancement réel du produit, qui est une information vraie.
 *
 * Monté uniquement en desktop (return null en dessous) et non pas seulement
 * masqué en CSS : un composant masqué fait quand même ses requêtes.
 */
export function RightRail() {
  return (
    <aside
      aria-label="À propos de Diako"
      className="sticky top-14 hidden h-fit w-72 shrink-0 py-4 xl:block"
    >
      <div className="rounded-2xl border border-border p-4">
        <h2 className="text-sm font-semibold">Ce qui arrive sur Diako</h2>
        <ul className="mt-3 space-y-2">
          {FEUILLE_DE_ROUTE.map(({ quoi, etat }) => (
            <li key={quoi} className="flex items-start gap-2 text-sm">
              <span
                className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${COULEURS[etat]}`}
              >
                {etat}
              </span>
              <span className="text-muted-foreground">{quoi}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 rounded-2xl bg-secondary p-4">
        <h2 className="text-sm font-semibold">Vous êtes un professionnel ?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Hôtel, restaurant, agence de voyage ou guide : créez votre compte
          maintenant, votre page sera prête dès l'ouverture.
        </p>
        <Link
          to="/pro"
          className="mt-3 inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Découvrir l'espace pro
        </Link>
      </div>
    </aside>
  );
}
