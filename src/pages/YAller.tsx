import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bus, Compass, Gauge, Plane, Ship, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { EtatErreur, Squelettes } from "@/components/Etats";
import { cn } from "@/lib/utils";

/**
 * Y ALLER — /y-aller
 *
 * ⚠ LE CHIFFRE QUE PERSONNE NE PUBLIE. Le référentiel porte, pour 41
 *   destinations, la distance ET la durée réelle du trajet. Leur rapport donne
 *   la VITESSE EFFECTIVE, et c'est elle qui manque à quiconque prépare un
 *   itinéraire ici : sur le goudron malgache on avance à 46 km/h de moyenne,
 *   pas à 90. Sur piste, 23. En 4×4 de brousse, 14.
 *
 *   Un voyageur qui divise ses kilomètres par 90 se trompe du simple au double,
 *   et c'est comme ça qu'on arrive de nuit sur une piste. Aucun autre site ne
 *   donne cette information parce qu'elle demande un relevé de terrain — c'est
 *   précisément ce que le lot 1 a saisi.
 *
 * ⚠ LA VITESSE EST CALCULÉE EN BASE, jamais saisie : elle dérive de deux
 *   colonnes relevées. La stocker créerait une troisième valeur qui divergerait
 *   des deux autres au premier changement.
 *
 * ⚠ LE PRIX N'EST PAS UNE COLONNE DU TABLEAU. Il n'est renseigné que sur une
 *   ligne sur 42 : quarante-et-une cases vides se liraient « tableau cassé »
 *   plutôt que « donnée manquante ». Il s'affiche là où il existe, et nulle
 *   part ailleurs.
 */

const ICONE: Record<string, typeof Bus> = {
  goudron: Bus,
  piste: Bus,
  "4x4": Bus,
  avion: Plane,
  bateau: Ship,
  pirogue: Ship,
  train: Bus,
};

const LIBELLE_MODE: Record<string, string> = {
  goudron: "Route goudronnée",
  piste: "Piste",
  "4x4": "4×4 obligatoire",
  avion: "Avion",
  bateau: "Bateau",
  pirogue: "Pirogue",
  train: "Train",
};

interface Trajet {
  slug: string;
  nom: string;
  region: string | null;
  depuis: string;
  mode: string;
  km: number | null;
  heures: number | null;
  kmh: number | null;
  etat_route: string | null;
  toute_annee: boolean | null;
  depart: string | null;
  operateurs: string[] | null;
  prix_ar: number | null;
}

interface Donnees {
  trajets: Trajet[];
  par_mode: { mode: string; n: number; kmh_moyen: number }[];
  nb_destinations: number;
  nb_lieux: number;
}

/** Sous 30 km/h, on ne « roule » plus : on avance. Le seuil colore le tableau. */
const LENT = 30;

export default function YAller() {
  useSEO({
    titre: "Y aller — temps de route réels à Madagascar",
    description:
      "Combien de temps met-on vraiment pour rejoindre les destinations malgaches ? Distances, durées relevées, état des routes et vitesse effective — 46 km/h sur goudron, pas 90.",
    url: "https://diako.fonenako.mg/y-aller",
  });

  const [d, setD] = useState<Donnees | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "erreur">("chargement");
  const [mode, setMode] = useState<string | null>(null);
  useReveal(d?.trajets.length);

  const charger = useCallback(async () => {
    setEtat("chargement");
    const { data, error } = await supabase.rpc("y_aller");
    if (error) return setEtat("erreur");
    setD(data as unknown as Donnees);
    setEtat("ok");
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const visibles = useMemo(
    () => (mode ? (d?.trajets ?? []).filter((t) => t.mode === mode) : d?.trajets ?? []),
    [d, mode]
  );

  if (etat === "chargement")
    return (
      <div className="space-y-4 px-4 py-5">
        <div className="dk-skeleton h-8 w-2/3" />
        <Squelettes nombre={3} hauteur="h-16" />
      </div>
    );

  if (etat === "erreur" || !d)
    return (
      <div className="px-4 py-8">
        <EtatErreur onReessayer={() => void charger()} />
      </div>
    );

  const plusLong = [...d.trajets].sort((a, b) => (b.heures ?? 0) - (a.heures ?? 0))[0];

  return (
    <div className="px-4 py-5">
      <p className="dk-etiquette">Temps de route réels</p>
      <h1 className="dk-titre mt-1">Y aller</h1>
      <p className="dk-corps mt-2 max-w-[70ch] text-muted-foreground">
        Combien de temps met-on <strong className="text-foreground">vraiment</strong> ?
        Ces durées sont relevées sur le terrain, pas calculées à partir d'une
        vitesse théorique. C'est toute la différence entre arriver au coucher du
        soleil et arriver de nuit sur une piste.
      </p>

      {/* ── LA VITESSE RÉELLE PAR MODE — le cœur de la page ───────────────── */}
      <section className="dk-reveal mt-6">
        <h2 className="dk-etiquette inline-flex items-center gap-1.5">
          <Gauge className="h-4 w-4" aria-hidden="true" />
          Ce qu'on avance vraiment
        </h2>
        <ul className="mt-2 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 large:grid-cols-5">
          {d.par_mode.map((m) => {
            const Icone = ICONE[m.mode] ?? Bus;
            const lent = m.kmh_moyen < LENT;
            return (
              <li key={m.mode}>
                <button
                  onClick={() => setMode(mode === m.mode ? null : m.mode)}
                  aria-pressed={mode === m.mode}
                  className={cn(
                    "w-full rounded-2xl border p-4 text-left transition",
                    mode === m.mode
                      ? "border-primary bg-primary/[0.07]"
                      : "border-border bg-card hover:border-primary"
                  )}
                >
                  <span className="dk-etiquette inline-flex items-center gap-1.5">
                    <Icone className="h-3.5 w-3.5" aria-hidden="true" />
                    {LIBELLE_MODE[m.mode] ?? m.mode}
                  </span>
                  <span
                    className={cn(
                      "mt-1.5 block text-2xl font-bold leading-none tabular-nums",
                      lent ? "text-accent-strong" : "text-primary"
                    )}
                  >
                    {m.kmh_moyen} km/h
                  </span>
                  <span className="dk-secondaire mt-1 block">
                    moyenne sur {m.n} trajet{m.n > 1 ? "s" : ""} relevé{m.n > 1 ? "s" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="dk-secondaire mt-3 max-w-[70ch] leading-relaxed">
          Ces vitesses sont <strong className="text-foreground">calculées</strong> à
          partir des distances et des durées relevées, jamais saisies à la main.
          Divisez vos kilomètres par ces chiffres-là, pas par 90.
        </p>
      </section>

      {/* ── Le tableau des trajets ───────────────────────────────────────── */}
      <section className="dk-reveal mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {mode ? `${LIBELLE_MODE[mode] ?? mode} · ${visibles.length}` : `${visibles.length} trajets relevés`}
          </h2>
          {mode && (
            <button onClick={() => setMode(null)} className="text-sm font-semibold text-primary">
              Tous les modes
            </button>
          )}
        </div>

        <div className="mt-3 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Distances, durées réelles et état des routes vers les destinations
            </caption>
            <thead>
              <tr className="bg-secondary/60 text-left">
                <th scope="col" className="px-3 py-2 font-semibold">Destination</th>
                <th scope="col" className="px-3 py-2 font-semibold">Depuis</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Distance</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Durée réelle</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Vitesse</th>
                <th scope="col" className="px-3 py-2 font-semibold">État</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibles.map((t, i) => {
                const Icone = ICONE[t.mode] ?? Bus;
                const lent = (t.kmh ?? 99) < LENT;
                return (
                  <tr key={`${t.slug}-${i}`} className="bg-card">
                    <th scope="row" className="px-3 py-2.5 text-left font-medium">
                      <Link to={`/lieu/${t.slug}`} className="inline-flex items-center gap-1.5 hover:text-primary">
                        <Icone className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                        {t.nom}
                      </Link>
                      {t.region && <span className="dk-secondaire block">{t.region}</span>}
                    </th>
                    <td className="px-3 py-2.5 text-muted-foreground">{t.depuis}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {t.km != null ? `${t.km} km` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                      {t.heures != null ? `${t.heures} h` : "—"}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right font-semibold tabular-nums",
                        lent ? "text-accent-strong" : "text-foreground"
                      )}
                    >
                      {t.kmh != null ? `${t.kmh}` : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-muted-foreground">{t.etat_route ?? "—"}</span>
                      {t.toute_annee === false && (
                        <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase text-accent-strong">
                          <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                          pas toute l'année
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Le trajet le plus long, pour donner l'échelle ─────────────────── */}
      {plusLong?.heures != null && (
        <section className="dk-reveal mt-6 rounded-2xl bg-secondary p-5">
          <p className="dk-etiquette">Pour donner l'échelle</p>
          <p className="mt-2 max-w-[70ch] leading-relaxed">
            Le trajet le plus long du référentiel :{" "}
            <Link to={`/lieu/${plusLong.slug}`} className="font-semibold text-primary">
              {plusLong.nom}
            </Link>
            , <strong className="tabular-nums">{plusLong.heures} heures</strong> depuis{" "}
            {plusLong.depuis}
            {plusLong.km != null && (
              <>
                {" "}
                pour <span className="tabular-nums">{plusLong.km} km</span> — soit{" "}
                <span className="tabular-nums">{plusLong.kmh}</span> km/h de moyenne
              </>
            )}
            . Un planificateur qui compte 90 km/h annoncerait{" "}
            {plusLong.km != null ? Math.round(plusLong.km / 90) : "?"} heures.
          </p>
        </section>
      )}

      {/* ── La couverture, dite en clair ─────────────────────────────────── */}
      <section className="dk-reveal mt-6 rounded-2xl border border-dashed border-border p-5">
        <p className="font-semibold">
          {d.nb_destinations} destination{d.nb_destinations > 1 ? "s" : ""} relevée
          {d.nb_destinations > 1 ? "s" : ""} sur {d.nb_lieux}
        </p>
        <p className="dk-secondaire mt-2 max-w-[70ch] leading-relaxed">
          Les autres routes existent, elles ne sont simplement pas encore
          mesurées. Un temps de trajet, c'est un fait vérifiable : si vous avez
          fait la route, vous pouvez la documenter.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/publier"
            className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Relever un trajet
          </Link>
          <Link
            to="/quand-partir"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-input px-5 text-sm font-semibold"
          >
            <Compass className="h-4 w-4" aria-hidden="true" />
            Quand partir où
          </Link>
        </div>
      </section>
    </div>
  );
}
