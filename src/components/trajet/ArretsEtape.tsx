import { Link } from "react-router-dom";
import { BedDouble, Compass, MapPinned, Phone, UtensilsCrossed } from "lucide-react";
import { EmptyState } from "@/components/Etats";
import { dureeFr, type Lieu, type Troncon } from "@/lib/trajet";

/**
 * OÙ DORMIR, OÙ MANGER, OÙ PASSER — à une étape du trajet.
 *
 * ⚠ LE CHIFFRE LE PLUS UTILE DE CE BLOC EST ZÉRO. Ambalavao compte 4 adresses,
 *   Fianarantsoa 85, Ihosy 2, Zombitse aucune. Quand le planificateur propose de
 *   couper la journée quelque part, savoir qu'il n'y a RIEN de publié sur place
 *   vaut mieux qu'une liste flatteuse ailleurs. Le vide est donc affiché, jamais
 *   masqué.
 *
 * ⚠ AUCUN PRIX ICI. Ils ne sont renseignés que sur 38 fiches sur 3 254, et la
 *   règle du projet — montant + unité + base + date de dernière confirmation,
 *   déclassement au-delà de six mois — est déjà tenue sur la fiche `/p/<slug>`.
 *   La rejouer ici, c'est deux endroits où elle peut diverger.
 *
 * ⚠ « À VOIR DEPUIS ICI » NE COÛTE AUCUNE DONNÉE NEUVE : ce sont les tronçons
 *   relevés qui partent de cette étape et que l'itinéraire n'emprunte pas. Le
 *   relevé sait déjà qu'on atteint la réserve d'Anja en 0,3 h depuis Ambalavao.
 */

export interface Adresse {
  slug: string;
  nom: string;
  sous_categorie: string | null;
  repere: string | null;
  telephone: string | null;
  whatsapp: string | null;
  verification: string;
}

export interface ArretsDuLieu {
  slug: string;
  nb_hotels: number;
  nb_restaurants: number;
  dormir: Adresse[];
  manger: Adresse[];
}

function Liste({
  titre,
  icone: Icone,
  categorie,
  total,
  adresses,
  nomDuLieu,
  vide,
}: {
  titre: string;
  icone: typeof BedDouble;
  /** Le code de catégorie tel que `/recherche` l'attend dans son paramètre `cat`. */
  categorie: "hotel" | "restaurant";
  total: number;
  adresses: Adresse[];
  nomDuLieu: string;
  vide: string;
}) {
  return (
    <div>
      <h5 className="dk-etiquette inline-flex items-center gap-1.5">
        <Icone className="h-3.5 w-3.5" aria-hidden="true" />
        {titre}
        {total > 0 && <span className="tabular-nums">· {total}</span>}
      </h5>
      {total === 0 ? (
        <p className="dk-secondaire mt-1.5">{vide}</p>
      ) : (
        <>
          <ul className="mt-1.5 space-y-1.5">
            {adresses.map((a) => (
              <li key={a.slug} className="text-sm leading-snug">
                <Link to={`/p/${a.slug}`} className="font-medium hover:text-primary">
                  {a.nom}
                </Link>
                {a.repere && <span className="dk-secondaire block">{a.repere}</span>}
                {a.telephone && (
                  <a
                    href={`tel:${a.telephone.replace(/\s+/g, "")}`}
                    className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-primary"
                  >
                    <Phone className="h-3 w-3" aria-hidden="true" />
                    {a.telephone}
                  </a>
                )}
              </li>
            ))}
          </ul>
          {total > adresses.length && (
            <Link
              to={`/recherche?q=${encodeURIComponent(nomDuLieu)}&cat=${categorie}`}
              className="mt-2 inline-block text-xs font-semibold text-primary"
            >
              Les {total} — voir toutes
            </Link>
          )}
        </>
      )}
    </div>
  );
}

export default function ArretsEtape({
  lieu,
  arrets,
  excursions,
  chargement,
}: {
  lieu: Lieu;
  arrets: ArretsDuLieu | null;
  excursions: Troncon[];
  chargement: boolean;
}) {
  const aVoir = excursions.length > 0 && (
    <div>
      <h5 className="dk-etiquette inline-flex items-center gap-1.5">
        <Compass className="h-3.5 w-3.5" aria-hidden="true" />À voir depuis ici
      </h5>
      <ul className="mt-1.5 space-y-1">
        {excursions.map((t) => (
          <li key={`${t.vers.slug}-${t.mode}`} className="text-sm leading-snug">
            <Link to={`/lieu/${t.vers.slug}`} className="font-medium hover:text-primary">
              {t.vers.nom}
            </Link>{" "}
            <span className="dk-secondaire">
              — {dureeFr(t.heures * 60)}
              {t.km != null && `, ${t.km} km`} · {t.etat ?? t.mode}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  if (chargement)
    return (
      <div className="mt-3 space-y-2">
        <div className="dk-skeleton h-4 w-1/3" />
        <div className="dk-skeleton h-4 w-2/3" />
      </div>
    );

  // ⚠ Rien de publié sur place : c'est un état vide À PART ENTIÈRE, pas une
  //   section escamotée. On dit ce qui manque, on offre d'y remédier, et on
  //   propose du référentiel réel à parcourir — les tronçons relevés d'ici.
  if (arrets && arrets.nb_hotels === 0 && arrets.nb_restaurants === 0)
    return (
      <EmptyState
        className="mt-3"
        icone={MapPinned}
        manque={`Aucune adresse publiée à ${lieu.nom} — ni hébergement, ni table.`}
        action={{ libelle: "Ajouter une adresse", lien: "/publier" }}
        contenuReel={
          aVoir || (
            <p className="dk-secondaire">
              Le relevé donne l'accès à {lieu.nom}, pas ce qu'on y trouve.{" "}
              <Link to={`/lieu/${lieu.slug}`} className="font-semibold text-primary">
                Voir la fiche du lieu
              </Link>
            </p>
          )
        }
      />
    );

  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {arrets ? (
        <>
          <Liste
            titre="Dormir"
            icone={BedDouble}
            categorie="hotel"
            total={arrets.nb_hotels}
            adresses={arrets.dormir}
            nomDuLieu={lieu.nom}
            vide={`Aucun hébergement publié à ${lieu.nom}.`}
          />
          <Liste
            titre="Manger"
            icone={UtensilsCrossed}
            categorie="restaurant"
            total={arrets.nb_restaurants}
            adresses={arrets.manger}
            nomDuLieu={lieu.nom}
            vide={`Aucune table publiée à ${lieu.nom}.`}
          />
        </>
      ) : (
        // Les compteurs du graphe suffisent à ne pas mentir quand la liste
        // détaillée n'a pas pu être chargée.
        <p className="dk-secondaire sm:col-span-2">
          {lieu.nbHotels != null
            ? `${lieu.nbHotels} hébergement(s) et ${lieu.nbRestaurants ?? 0} table(s) publiés ici — liste momentanément indisponible.`
            : "Adresses non chargées."}
        </p>
      )}
      {aVoir}
    </div>
  );
}
