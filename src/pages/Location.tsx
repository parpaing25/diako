import { useCallback, useEffect, useState } from "react";
import { Car } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { FicheCard } from "@/components/FicheCard";
import { FicheLigne } from "@/components/FicheLigne";
import { EtatVide } from "@/components/Etats";
import {
  chercherPages,
  LIBELLE_VEHICULE,
  vehiculesPour,
  type OffreVehicule,
  type ResultatPage,
} from "@/lib/etablissements";

/**
 * LOUER UNE VOITURE À MADAGASCAR — la page dédiée des loueurs de véhicules.
 *
 * ⚠ POURQUOI UNE PAGE, ET PAS UN LIEN VERS /recherche?cat=location_vehicule.
 *   La recherche liste des fiches ; elle ne sait rien de la grille tarifaire
 *   des loueurs (vehicle_offers, migration 0114) : quels types de véhicules,
 *   avec ou sans chauffeur, à quel prix la journée. C'est pourtant LA question
 *   qu'on se pose avant d'ouvrir une fiche de loueur. Cette page résume la
 *   grille sous chaque carte, et ajoute les transporteurs en seconde section —
 *   celui qui cherche « comment aller à Morondava » compare les deux offres.
 *
 * ⚠ DEUX REQUÊTES DE FICHES + UNE POUR TOUTES LES GRILLES. Une requête de
 *   grille par loueur en aurait fait dix-huit — sur une 3G malgache, les
 *   allers-retours coûtent plus cher que la charge utile. Et les grilles se
 *   chargent APRÈS l'affichage des fiches : l'écran ne les attend pas.
 */

/**
 * Le résumé de la grille d'un loueur, sous sa carte : les TYPES qu'il propose.
 *
 * ⚠ Pas de montant ici. Le prix d'appel est déjà sur la carte (via <Prix>,
 *   seule voie autorisée pour afficher un prix) et le détail par véhicule vit
 *   sur la fiche : répéter des chiffres à un troisième endroit, c'est deux
 *   occasions de plus qu'ils divergent.
 */
function ResumeGrille({ offres }: { offres: OffreVehicule[] | undefined }) {
  if (!offres || offres.length === 0) return null;
  const types = Array.from(new Set(offres.map((o) => o.vehicle_type)));
  return (
    <p className="flex flex-wrap items-center gap-1.5 px-1 text-xs text-muted-foreground">
      <span>Véhicules&nbsp;:</span>
      {types.map((t) => (
        <span
          key={t}
          className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-primary"
        >
          {LIBELLE_VEHICULE[t] ?? t}
        </span>
      ))}
    </p>
  );
}

function SectionFiches({
  titre,
  texte,
  fiches,
  grilles,
}: {
  titre: string;
  texte?: string;
  fiches: ResultatPage[];
  grilles: Map<string, OffreVehicule[]>;
}) {
  return (
    <section className="mt-7">
      <h2 className="text-lg font-semibold">{titre}</h2>
      {texte && <p className="mt-1 text-sm text-muted-foreground">{texte}</p>}
      {/* ⚠ DEUX FORMES, PAS UNE ÉTIRÉE — la même règle que la recherche (W2) :
          vignettes sur téléphone, lignes larges à prix alignés sur grand
          écran. Les composants sont RÉUTILISÉS, pas recopiés : FicheCard et
          FicheLigne savent déjà dire « à partir de X Ar, par jour », puisque
          le prix d'appel des loueurs porte l'unité `jour` depuis 0114. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:hidden">
        {fiches.map((f) => (
          <div key={f.id} className="flex flex-col gap-1.5">
            <FicheCard fiche={f} />
            <ResumeGrille offres={grilles.get(f.id)} />
          </div>
        ))}
      </div>
      <div className="mt-3 hidden flex-col gap-3 lg:flex">
        {fiches.map((f) => (
          <div key={f.id} className="flex flex-col gap-1.5">
            <FicheLigne fiche={f} />
            <ResumeGrille offres={grilles.get(f.id)} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Location() {
  useReveal();
  useSEO({
    titre: "Louer une voiture à Madagascar",
    description:
      "4x4, minibus, citadines et motos à louer, avec ou sans chauffeur : " +
      "les loueurs de véhicules référencés à Madagascar, leurs types de " +
      "véhicules et leurs tarifs par jour en ariary.",
    url: "/location",
  });

  const [loueurs, setLoueurs] = useState<ResultatPage[]>([]);
  const [transporteurs, setTransporteurs] = useState<ResultatPage[]>([]);
  const [grilles, setGrilles] = useState<Map<string, OffreVehicule[]>>(new Map());
  const [etat, setEtat] = useState<"chargement" | "ok" | "erreur">("chargement");

  const charger = useCallback(async () => {
    setEtat("chargement");
    try {
      const [l, t] = await Promise.all([
        chercherPages({ categorie: "location_vehicule", limite: 60 }),
        chercherPages({ categorie: "transporteur", limite: 60 }),
      ]);
      setLoueurs(l);
      setTransporteurs(t);
      setEtat("ok");
      // Les grilles APRÈS les fiches, et leur échec est silencieux : la liste
      // vit très bien sans ses résumés, l'inverse n'est pas vrai.
      const ids = [...l, ...t].map((f) => f.id);
      void vehiculesPour(ids)
        .then(setGrilles)
        .catch(() => undefined);
    } catch {
      setEtat("erreur");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const vide = etat === "ok" && loueurs.length === 0 && transporteurs.length === 0;

  return (
    <div className="px-4 py-5">
      <p className="dk-etiquette">Se déplacer</p>
      <div className="mt-1 flex items-center gap-2">
        <Car className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
        <h1 className="dk-titre">Louer une voiture à Madagascar</h1>
      </div>
      <p className="dk-corps mt-2 max-w-[70ch] text-muted-foreground">
        Les loueurs de véhicules référencés sur Diako, avec leurs types de
        véhicules et leurs tarifs par jour quand ils sont connus. À Madagascar,
        la location se fait le plus souvent avec chauffeur&nbsp;— chaque fiche
        précise ce qu'elle propose.
      </p>

      {etat === "erreur" && (
        <div className="mt-6 rounded-2xl border border-border p-5 text-center">
          <p className="font-medium">Le chargement n'a pas abouti</p>
          <button
            onClick={() => void charger()}
            className="mt-3 min-h-10 rounded-full border border-input px-5 text-sm font-medium"
          >
            Réessayer
          </button>
        </div>
      )}

      {etat === "chargement" && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="dk-skeleton h-64 rounded-2xl" />
          ))}
        </div>
      )}

      {/* L'état vide dit quoi faire MAINTENANT — règle des états système (F2). */}
      {vide && (
        <EtatVide
          icone={Car}
          titre="Aucun loueur référencé pour l'instant"
          texte="Les fiches arrivent au fil de la collecte. En attendant, la recherche couvre les hôtels, les restaurants et les sites à visiter."
          action="Ouvrir la recherche"
          lien="/recherche"
          className="mt-6"
        />
      )}

      {etat === "ok" && loueurs.length > 0 && (
        <SectionFiches titre="Loueurs de véhicules" fiches={loueurs} grilles={grilles} />
      )}

      {etat === "ok" && transporteurs.length > 0 && (
        <SectionFiches
          titre="Transporteurs"
          texte="Navettes, transferts et transport de groupes — un trajet plutôt qu'un véhicule à la journée."
          fiches={transporteurs}
          grilles={grilles}
        />
      )}
    </div>
  );
}
