import { ArrowDownUp, CalendarDays, Clock, MapPin, Sunrise } from "lucide-react";
import type { Lieu } from "@/lib/trajet";

/**
 * LE FORMULAIRE DU PLANIFICATEUR.
 *
 * ⚠ DEUX LISTES FERMÉES, PAS DEUX CHAMPS DE RECHERCHE. Le référentiel compte
 *   22 707 lieux ; 43 seulement portent un tronçon relevé. Une autocomplétion
 *   sur tout le référentiel laisserait taper « Nosy Iranja » puis répondrait
 *   « non couvert » — on aurait promis pour rien. Une liste fermée ne propose
 *   que ce dont on sait répondre.
 *
 * ⚠ TOUS LES CHAMPS SONT NATIFS. `<select>`, `<input type="date">`,
 *   `<input type="time">` : sur un Android d'entrée de gamme, le sélecteur du
 *   système s'ouvre instantanément là où un composant maison rame. Ils sont
 *   aussi les seuls à être correctement annoncés par les lecteurs d'écran sans
 *   une ligne d'ARIA.
 *
 * ⚠ CHAQUE CHAMP A UN `<label htmlFor>` RÉEL — pas un `placeholder` qui en tient
 *   lieu. C'est un défaut qu'on vient de corriger ailleurs sur le site.
 */

export interface ValeursTrajet {
  departSlug: string;
  arriveeSlug: string;
  dateISO: string;
  /** « HH:MM », tel que le rend un `<input type="time">`. */
  heureDepart: string;
  heureMatin: string;
}

const CHAMP =
  "mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-base text-foreground " +
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export default function FormulaireTrajet({
  lieux,
  valeurs,
  onChange,
}: {
  lieux: Lieu[];
  valeurs: ValeursTrajet;
  onChange: (v: ValeursTrajet) => void;
}) {
  const modifier = (partiel: Partial<ValeursTrajet>) => onChange({ ...valeurs, ...partiel });

  const options = (exclu: string) =>
    lieux.map((l) => (
      <option key={l.slug} value={l.slug} disabled={l.slug === exclu}>
        {l.nom}
        {l.region ? ` — ${l.region}` : ""}
      </option>
    ));

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="trajet-depart" className="dk-etiquette inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Je pars de
          </label>
          <select
            id="trajet-depart"
            className={CHAMP}
            value={valeurs.departSlug}
            onChange={(e) => modifier({ departSlug: e.target.value })}
          >
            {options(valeurs.arriveeSlug)}
          </select>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label
              htmlFor="trajet-arrivee"
              className="dk-etiquette inline-flex items-center gap-1.5"
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              Je vais à
            </label>
            <button
              type="button"
              onClick={() =>
                modifier({ departSlug: valeurs.arriveeSlug, arriveeSlug: valeurs.departSlug })
              }
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
            >
              <ArrowDownUp className="h-3.5 w-3.5" aria-hidden="true" />
              Inverser
            </button>
          </div>
          <select
            id="trajet-arrivee"
            className={CHAMP}
            value={valeurs.arriveeSlug}
            onChange={(e) => modifier({ arriveeSlug: e.target.value })}
          >
            {options(valeurs.departSlug)}
          </select>
        </div>

        <div>
          <label htmlFor="trajet-date" className="dk-etiquette inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            Date de départ
          </label>
          <input
            id="trajet-date"
            type="date"
            className={CHAMP}
            value={valeurs.dateISO}
            onChange={(e) => e.target.value && modifier({ dateISO: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="trajet-heure" className="dk-etiquette inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Heure de départ
            </label>
            <input
              id="trajet-heure"
              type="time"
              className={CHAMP}
              value={valeurs.heureDepart}
              onChange={(e) => e.target.value && modifier({ heureDepart: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="trajet-matin" className="dk-etiquette inline-flex items-center gap-1.5">
              <Sunrise className="h-3.5 w-3.5" aria-hidden="true" />
              Reprise le matin
            </label>
            <input
              id="trajet-matin"
              type="time"
              className={CHAMP}
              value={valeurs.heureMatin}
              onChange={(e) => e.target.value && modifier({ heureMatin: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* ⚠ Cette phrase n'est pas une note de bas de page : c'est la limite de
          l'outil, et elle doit être lue AVANT le résultat. « Reprise le matin »
          est un choix de la personne, pas une donnée relevée. */}
      <p className="dk-secondaire mt-3 leading-relaxed">
        L'heure de reprise sert quand le trajet demande plus d'une journée : c'est
        vous qui la fixez, elle ne vient pas du relevé. Les durées, elles, sont
        celles mesurées sur le terrain — <strong className="text-foreground">sans
        les pauses</strong>.
      </p>
    </div>
  );
}
