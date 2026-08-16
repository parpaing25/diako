import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CircleAlert, Compass, Navigation } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useReveal } from "@/hooks/useReveal";
import { EtatErreur, Squelettes } from "@/components/Etats";
import {
  aujourdhuiMadagascar,
  construireGraphe,
  estEchec,
  lieuxProposables,
  planifier,
  AUTORISER_SENS_INVERSE,
  type Graphe,
  type Lieu,
  type Referentiel,
} from "@/lib/trajet";
import FormulaireTrajet, { type ValeursTrajet } from "./FormulaireTrajet";
import ResultatTrajet from "./ResultatTrajet";
import type { ArretsDuLieu } from "./ArretsEtape";

/**
 * LE PLANIFICATEUR DE TRAJET — bloc autonome de /y-aller.
 *
 * ⚠ IL EST AUTONOME EXPRÈS. Il dépend de deux RPC (`trajet_referentiel`,
 *   `trajet_etapes`) livrées par les migrations 0099 et 0100. Tant qu'elles ne
 *   sont pas appliquées, ce bloc — et lui seul — affiche qu'il n'est pas encore
 *   actif : le reste de la page « Y aller », qui tourne depuis des mois sur la
 *   RPC `y_aller`, continue de fonctionner sans rien savoir de tout ceci.
 *
 * ⚠ LE GRAPHE EST CHARGÉ UNE FOIS, LE CALCUL SE REFAIT À CHAQUE FRAPPE. 43
 *   sommets et 42 arêtes tiennent en ~13 ko ; changer l'heure de départ ne doit
 *   pas coûter un aller-retour réseau, parce que c'est ce qu'on fait trois fois
 *   de suite quand on découvre qu'on arriverait de nuit.
 *
 * ⚠ L'ÉTAT VIT DANS L'URL. Un itinéraire se partage — c'est même la première
 *   chose qu'on fait après l'avoir calculé. Sans ça, le lien envoyé au reste du
 *   groupe rouvre la page vide.
 */

interface ReponseRpc {
  data: unknown;
  error: { message: string } | null;
}

/**
 * ⚠ APPEL NON TYPÉ, ET C'EST VOULU. `src/integrations/supabase/types.ts` est
 *   RÉGÉNÉRÉ après application des migrations : les deux nouvelles fonctions
 *   n'y figurent pas encore. Éditer un fichier généré à la main le ferait
 *   écraser au premier `supabase gen types`. On isole donc l'écart ici, en un
 *   seul endroit, plutôt que de le disséminer.
 */
const client = supabase as unknown as {
  rpc: (nom: string, args?: Record<string, unknown>) => PromiseLike<ReponseRpc>;
};

/** Défauts : l'exemple que tout le monde connaît, la RN7. */
const DEPART_PAR_DEFAUT = "antananarivo-2";
const ARRIVEE_PAR_DEFAUT = "toliara";
const HEURE_PAR_DEFAUT = "06:00";

const enMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 6 * 60;
};

/** On ne fait confiance à rien de ce qui arrive du réseau. */
function lireReferentiel(brut: unknown): Referentiel | null {
  if (typeof brut !== "object" || brut === null) return null;
  const o = brut as Record<string, unknown>;
  if (!Array.isArray(o.lieux) || !Array.isArray(o.acces)) return null;
  const lieux: Lieu[] = [];
  for (const l of o.lieux as Record<string, unknown>[]) {
    if (typeof l?.slug !== "string" || typeof l?.nom !== "string") continue;
    lieux.push({
      slug: l.slug,
      nom: l.nom,
      region: typeof l.region === "string" ? l.region : null,
      kind: typeof l.kind === "string" ? l.kind : null,
      lat: typeof l.lat === "number" ? l.lat : null,
      lng: typeof l.lng === "number" ? l.lng : null,
      nbHotels: typeof l.nb_hotels === "number" ? l.nb_hotels : null,
      nbRestaurants: typeof l.nb_restaurants === "number" ? l.nb_restaurants : null,
    });
  }
  const acces = (o.acces as Record<string, unknown>[])
    .filter((a) => typeof a?.depuis === "string" && typeof a?.vers === "string")
    .map((a) => ({
      depuis: a.depuis as string,
      vers: a.vers as string,
      mode: typeof a.mode === "string" ? a.mode : "goudron",
      km: typeof a.km === "number" ? a.km : null,
      // ⚠ `duration_h` est un numeric : PostgREST peut le rendre en chaîne.
      //   Le laisser filer en `NaN` produirait une heure d'arrivée « --:-- »
      //   sans le moindre message.
      heures: a.heures == null ? null : Number(a.heures),
      etat: typeof a.etat === "string" ? a.etat : null,
      toute_annee: a.toute_annee !== false,
      operateurs: Array.isArray(a.operateurs) ? (a.operateurs as string[]) : null,
      prix_ar: typeof a.prix_ar === "number" ? a.prix_ar : null,
    }))
    .filter((a) => a.heures == null || Number.isFinite(a.heures));
  return lieux.length ? { lieux, acces } : null;
}

function lireArrets(brut: unknown): Map<string, ArretsDuLieu> {
  const m = new Map<string, ArretsDuLieu>();
  if (!Array.isArray(brut)) return m;
  for (const e of brut as Record<string, unknown>[]) {
    if (typeof e?.slug !== "string") continue;
    m.set(e.slug, {
      slug: e.slug,
      nb_hotels: Number(e.nb_hotels ?? 0),
      nb_restaurants: Number(e.nb_restaurants ?? 0),
      dormir: Array.isArray(e.dormir) ? (e.dormir as ArretsDuLieu["dormir"]) : [],
      manger: Array.isArray(e.manger) ? (e.manger as ArretsDuLieu["manger"]) : [],
    });
  }
  return m;
}

export default function Planificateur() {
  const [params, setParams] = useSearchParams();
  const [graphe, setGraphe] = useState<Graphe | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "erreur">("chargement");
  const [arrets, setArrets] = useState<Map<string, ArretsDuLieu>>(new Map());
  const [chargementArrets, setChargementArrets] = useState(false);

  const charger = useCallback(async () => {
    setEtat("chargement");
    const { data, error } = await client.rpc("trajet_referentiel");
    const ref = error ? null : lireReferentiel(data);
    if (!ref) return setEtat("erreur");
    setGraphe(construireGraphe(ref));
    setEtat("ok");
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  /**
   * 🔴 LE PIÈGE DE `.dk-reveal`, EXACTEMENT CELUI DÉCRIT DANS `useReveal.ts`.
   *    La classe part à `opacity: 0`. La page `/y-aller` appelle bien
   *    `useReveal`, mais sur SES données à elle : quand le graphe du
   *    planificateur arrive ensuite — et il arrive toujours ensuite —
   *    l'observateur est déjà passé, et le filet de sécurité de l'application
   *    n'attend que 700 ms. Sur une 3G malgache, la RPC met plus longtemps :
   *    le bloc resterait INVISIBLE, sans la moindre erreur nulle part.
   *    On relance donc le balayage sur notre propre dépendance.
   */
  useReveal(graphe);

  const lieux = useMemo(() => (graphe ? lieuxProposables(graphe) : []), [graphe]);

  /* ── Les valeurs du formulaire, lues dans l'URL ─────────────────────── */
  const valeurs: ValeursTrajet = useMemo(() => {
    const connu = (slug: string | null) => (slug && graphe?.lieux.has(slug) ? slug : null);
    const premier = lieux[0]?.slug ?? "";
    return {
      departSlug: connu(params.get("de")) ?? connu(DEPART_PAR_DEFAUT) ?? premier,
      arriveeSlug:
        connu(params.get("vers")) ?? connu(ARRIVEE_PAR_DEFAUT) ?? lieux[1]?.slug ?? premier,
      dateISO: /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "")
        ? (params.get("date") as string)
        : aujourdhuiMadagascar(),
      heureDepart: /^\d{2}:\d{2}$/.test(params.get("h") ?? "")
        ? (params.get("h") as string)
        : HEURE_PAR_DEFAUT,
      heureMatin: /^\d{2}:\d{2}$/.test(params.get("hm") ?? "")
        ? (params.get("hm") as string)
        : HEURE_PAR_DEFAUT,
    };
  }, [params, graphe, lieux]);

  const modifier = useCallback(
    (v: ValeursTrajet) => {
      const p = new URLSearchParams(params);
      p.set("de", v.departSlug);
      p.set("vers", v.arriveeSlug);
      p.set("date", v.dateISO);
      p.set("h", v.heureDepart);
      p.set("hm", v.heureMatin);
      // `replace` : régler son heure de départ ne doit pas empiler cinq entrées
      // dans l'historique, sinon le bouton « retour » ne ramène plus nulle part.
      setParams(p, { replace: true });
    },
    [params, setParams]
  );

  const resultat = useMemo(() => {
    if (!graphe || !valeurs.departSlug || !valeurs.arriveeSlug) return null;
    return planifier(graphe, {
      departSlug: valeurs.departSlug,
      arriveeSlug: valeurs.arriveeSlug,
      dateISO: valeurs.dateISO,
      departMin: enMinutes(valeurs.heureDepart),
      matinMin: enMinutes(valeurs.heureMatin),
    });
  }, [graphe, valeurs]);

  /* ── Les adresses aux étapes ────────────────────────────────────────── */
  //  ⚠ La clé est l'ENSEMBLE des étapes, pas le plan : changer l'heure de
  //    départ change les horaires, pas forcément les villes traversées. Sans
  //    cette clé, chaque frappe dans le champ « heure » relancerait une requête.
  const cleEtapes = useMemo(() => {
    if (!resultat || estEchec(resultat)) return "";
    return [...new Set(resultat.journees.map((j) => j.arriveeSur.slug))].sort().join(",");
  }, [resultat]);

  useEffect(() => {
    if (!cleEtapes) return setArrets(new Map());
    let vivant = true;
    setChargementArrets(true);
    void (async () => {
      const { data, error } = await client.rpc("trajet_etapes", {
        p_slugs: cleEtapes.split(","),
        p_par_lieu: 4,
      });
      if (!vivant) return;
      setArrets(error ? new Map() : lireArrets(data));
      setChargementArrets(false);
    })();
    return () => {
      vivant = false;
    };
  }, [cleEtapes]);

  /* ── Rendu ──────────────────────────────────────────────────────────── */
  if (etat === "chargement")
    return (
      <section className="mt-6">
        <div className="dk-skeleton h-6 w-1/3" />
        <div className="mt-3">
          <Squelettes nombre={2} hauteur="h-24" />
        </div>
      </section>
    );

  if (etat === "erreur" || !graphe)
    return (
      <section className="mt-6 rounded-2xl border border-dashed border-border p-5">
        <p className="font-semibold">Le planificateur n'est pas encore actif.</p>
        <p className="dk-secondaire mt-2 max-w-[70ch] leading-relaxed">
          Il s'appuie sur deux fonctions serveur qui ne répondent pas. Les temps de
          route relevés, eux, restent affichés plus bas sur cette page.
        </p>
        <div className="mt-4">
          <EtatErreur onReessayer={() => void charger()} />
        </div>
      </section>
    );

  const nbLieux = graphe.lieux.size;

  return (
    <section className="dk-reveal mt-6">
      <h2 className="dk-etiquette inline-flex items-center gap-1.5">
        <Navigation className="h-4 w-4" aria-hidden="true" />
        Préparer sa route
      </h2>
      <p className="dk-corps mt-1 max-w-[70ch] text-muted-foreground">
        Dites d'où vous partez, où vous allez et à quelle heure. Nous mettons bout à
        bout les tronçons <strong className="text-foreground">réellement relevés</strong>{" "}
        et nous comparons votre heure d'arrivée à celle du coucher du soleil, sur place.
      </p>

      <div className="mt-3">
        <FormulaireTrajet lieux={lieux} valeurs={valeurs} onChange={modifier} />
      </div>

      {resultat && estEchec(resultat) && (
        <div className="mt-4 rounded-2xl border border-dashed border-accent/50 bg-accent/[0.05] p-5">
          <p className="inline-flex items-center gap-1.5 font-semibold text-accent-strong">
            <CircleAlert className="h-4 w-4" aria-hidden="true" />
            {resultat.type === "meme-lieu"
              ? "Choisissez deux lieux différents."
              : "Nous ne pouvons pas tracer ce trajet."}
          </p>
          {resultat.type === "composantes-separees" && (
            <p className="mt-2 max-w-[70ch] leading-relaxed">
              {resultat.depart.nom} et {resultat.arrivee.nom} appartiennent à deux
              morceaux du relevé qui ne se touchent pas : il manque au moins un tronçon
              entre les deux, et nous ne l'inventerons pas. Une durée fabriquée, c'est
              quelqu'un qui part trop tard.
            </p>
          )}
          {resultat.type === "sans-chemin" && (
            <p className="mt-2 max-w-[70ch] leading-relaxed">
              Aucune suite de tronçons relevés ne mène de {resultat.depart.nom} à{" "}
              {resultat.arrivee.nom}
              {!AUTORISER_SENS_INVERSE && " dans le sens où ils ont été mesurés"}.
            </p>
          )}
          {resultat.type !== "meme-lieu" && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/publier"
                className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
              >
                Relever ce tronçon
              </Link>
              <Link
                to="/quand-partir"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-input px-5 text-sm font-semibold"
              >
                <Compass className="h-4 w-4" aria-hidden="true" />
                Quand partir où
              </Link>
            </div>
          )}
        </div>
      )}

      {resultat && !estEchec(resultat) && (
        <ResultatTrajet
          plan={resultat}
          graphe={graphe}
          arrets={arrets}
          chargementArrets={chargementArrets}
        />
      )}

      {/* ⚠ LA COUVERTURE EST ANNONCÉE, PAS DEVINÉE. 43 lieux sur 22 707 : le
          visiteur doit savoir que le silence sur le reste n'est pas un bug. */}
      <p className="dk-secondaire mt-4 max-w-[70ch] leading-relaxed">
        Le planificateur ne connaît que les{" "}
        <strong className="text-foreground tabular-nums">{nbLieux} lieux</strong> pour
        lesquels un tronçon a été mesuré sur le terrain. Tout le reste du pays existe —
        il n'est simplement pas encore relevé, et nous préférons le dire plutôt que
        d'estimer.{" "}
        <Link to="/publier" className="font-semibold text-primary">
          Relever un trajet
        </Link>
      </p>
    </section>
  );
}
