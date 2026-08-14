import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Bus, Compass, MapPin, Plane, Ship, Utensils } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { EtatErreur, Squelettes } from "@/components/Etats";
import { ariary } from "@/lib/etablissements";
import { cn } from "@/lib/utils";

/**
 * LA FICHE D'UNE DESTINATION — /lieu/:slug (écran C1 de la maquette).
 *
 * ⚠ POURQUOI CET ÉCRAN COMPTE PLUS QUE LES AUTRES. Le référentiel des lieux
 *   — leur saisonnalité mois par mois, leurs accès avec des temps de route
 *   RÉELS — est le fossé défensif du produit (TDR §1.5) : personne d'autre ne
 *   l'a et personne ne le copie en une semaine. Il existait en base depuis le
 *   lot 1 et n'était affiché NULLE PART. On construisait l'avantage sans le
 *   montrer.
 *
 * ⚠ CE QUI EST HONNÊTE ICI. Sur 178 destinations, 5 seulement ont leur
 *   saisonnalité saisie et 41 leurs accès. Le calendrier ne s'affiche donc que
 *   là où il est renseigné, et là où il manque l'écran le dit et invite à
 *   compléter — plutôt que de montrer douze cases grises qui ressembleraient à
 *   « déconseillé toute l'année ».
 */

const MOIS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MOIS_LONG = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const NOTE = {
  ideale: { classe: "bg-primary text-primary-foreground", mot: "idéal" },
  correcte: { classe: "bg-primary/20 text-primary", mot: "correct" },
  deconseillee: { classe: "bg-accent/20 text-accent-strong", mot: "déconseillé" },
} as const;

const ICONE_MODE: Record<string, typeof Bus> = {
  goudron: Bus, piste: Bus, "4x4": Bus, avion: Plane, bateau: Ship, pirogue: Ship, train: Bus,
};

interface Fiche {
  lieu: {
    slug: string; name_fr: string; name_mg: string | null; kind: string;
    region: string | null; summary: string | null; why_go: string[] | null;
    lat: number | null; lng: number | null;
  };
  saisons: { mois: number; note: keyof typeof NOTE | null; raison: string | null }[];
  acces: {
    depuis: string; mode: string; km: number | null; heures: number | null;
    etat_route: string | null; toute_annee: boolean | null; depart: string | null;
    operateurs: string[] | null; prix_ar: number | null;
  }[];
  nb_ou_dormir: number;
  nb_ou_manger: number;
  nb_pages: number;
  nb_recits: number;
  prix_des: number | null;
  enfants: { slug: string; nom: string }[];
}

export default function Destination() {
  const { slug } = useParams<{ slug: string }>();
  const [f, setF] = useState<Fiche | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "absente" | "erreur">("chargement");
  useReveal(f);

  const charger = useCallback(async () => {
    if (!slug) return;
    setEtat("chargement");
    const { data, error } = await supabase.rpc("fiche_destination", { p_slug: slug });
    if (error) return setEtat("erreur");
    if (!data) return setEtat("absente");
    setF(data as unknown as Fiche);
    setEtat("ok");
  }, [slug]);

  useEffect(() => {
    void charger();
  }, [charger]);

  useSEO({
    titre: f ? `${f.lieu.name_fr} — où dormir et où manger` : "Destination",
    description: f
      ? f.lieu.summary ??
        `${f.lieu.name_fr}${f.lieu.region ? ` (${f.lieu.region})` : ""} : ${f.nb_ou_dormir} hébergements, ${f.nb_ou_manger} tables${f.prix_des ? `, à partir de ${ariary(f.prix_des)}` : ""}.`
      : undefined,
    url: slug ? `/lieu/${slug}` : undefined,
  });

  if (etat === "chargement")
    return (
      <div className="space-y-4 px-4 py-5">
        <div className="dk-skeleton h-40 rounded-2xl" />
        <div className="dk-skeleton h-8 w-1/2" />
        <Squelettes nombre={2} />
      </div>
    );

  if (etat === "erreur") return <div className="px-4 py-8"><EtatErreur onReessayer={() => void charger()} /></div>;

  if (etat === "absente" || !f)
    return (
      <div className="px-4 py-16 text-center">
        <h1 className="dk-titre">Destination inconnue</h1>
        <p className="mt-2 text-muted-foreground">Cette destination n'existe pas dans le référentiel.</p>
        <Link to="/explorer" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground">
          Explorer Madagascar
        </Link>
      </div>
    );

  const saisonsRenseignees = f.saisons.filter((s) => s.note);
  const moisCourant = f.saisons[new Date().getMonth()];

  return (
    <div className="px-4 py-5">
      {/* ── Identité ─────────────────────────────────────────────────── */}
      <p className="dk-etiquette">
        {f.lieu.region ?? f.lieu.kind}
        {f.acces[0]?.km ? ` · à ${f.acces[0].km} km de ${f.acces[0].depuis}` : ""}
      </p>
      <h1 className="dk-titre mt-1">{f.lieu.name_fr}</h1>
      {f.lieu.name_mg && f.lieu.name_mg !== f.lieu.name_fr && (
        <p className="dk-secondaire mt-0.5">{f.lieu.name_mg}</p>
      )}
      {f.lieu.summary && <p className="dk-corps mt-3 max-w-prose">{f.lieu.summary}</p>}

      {/* ── Les chiffres, calculés, jamais lus dans un compteur dérivé ── */}
      <div className="mt-4 flex flex-wrap gap-2">
        {[
          f.nb_pages > 0 && `${f.nb_pages} adresse${f.nb_pages > 1 ? "s" : ""}`,
          f.nb_recits > 0 && `${f.nb_recits} récit${f.nb_recits > 1 ? "s" : ""}`,
          f.prix_des != null && `dès ${ariary(f.prix_des)}/nuit`,
        ]
          .filter(Boolean)
          .map((t) => (
            <span key={t as string} className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
              {t}
            </span>
          ))}
      </div>

      {/* ── Quand y aller ────────────────────────────────────────────── */}
      <section className="dk-reveal mt-6">
        <h2 className="dk-etiquette">Quand y aller</h2>
        {saisonsRenseignees.length > 0 ? (
          <>
            <ul className="mt-2 flex gap-1" role="list">
              {f.saisons.map((s, i) => (
                <li key={i} className="flex-1">
                  <span
                    title={`${MOIS_LONG[i]}${s.note ? ` — ${NOTE[s.note].mot}` : " — non renseigné"}${s.raison ? ` (${s.raison})` : ""}`}
                    className={cn(
                      "grid h-9 w-full place-items-center rounded-lg text-xs font-bold",
                      s.note ? NOTE[s.note].classe : "bg-muted text-muted-foreground/50"
                    )}
                  >
                    {MOIS[i]}
                  </span>
                </li>
              ))}
            </ul>
            {moisCourant?.note && (
              <p className="mt-2 text-sm">
                <span className="font-semibold">En {MOIS_LONG[new Date().getMonth()]} : </span>
                {NOTE[moisCourant.note].mot}
                {moisCourant.raison && ` — ${moisCourant.raison.toLowerCase()}`}
              </p>
            )}
          </>
        ) : (
          // ⚠ Douze cases grises se liraient « déconseillé toute l'année ».
          //   On dit franchement que ce n'est pas encore renseigné.
          <p className="mt-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            La saisonnalité de cette destination n'est pas encore renseignée.
            Vous la connaissez ?{" "}
            <Link to="/publier" className="font-medium text-primary">
              Racontez-y un voyage
            </Link>{" "}
            — c'est comme ça qu'on la construit.
          </p>
        )}
      </section>

      {/* ── Y aller ──────────────────────────────────────────────────── */}
      {f.acces.length > 0 && (
        <section className="dk-reveal mt-6">
          <h2 className="dk-etiquette">Y aller</h2>
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {f.acces.map((a, i) => {
              const Icone = ICONE_MODE[a.mode] ?? Bus;
              return (
                <li key={i} className="flex items-start gap-3 p-3">
                  <Icone className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      Depuis {a.depuis} · {a.mode}
                    </p>
                    <p className="dk-secondaire">
                      {[
                        a.km && `${a.km} km`,
                        // ⚠ Temps de route RÉEL, pas la distance divisée par
                        //   une vitesse théorique : 250 km font 6 h ici.
                        a.heures && `${a.heures} h réelles`,
                        a.etat_route,
                        a.toute_annee === false && "pas toute l'année",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {(a.depart || a.operateurs?.length) && (
                      <p className="dk-secondaire">
                        {[a.depart, a.operateurs?.join(", ")].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  {a.prix_ar != null && (
                    <span className="shrink-0 text-sm font-bold tabular-nums">{ariary(a.prix_ar)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Les deux actions qui comptent ────────────────────────────── */}
      <div className="mt-6 grid grid-cols-2 gap-2">
        <Link
          to={`/recherche?lieu=${f.lieu.slug}&cat=hotel`}
          className={cn(
            "inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full px-4 font-semibold",
            f.nb_ou_dormir > 0
              ? "bg-primary text-primary-foreground"
              : "border border-input text-muted-foreground"
          )}
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Où dormir ({f.nb_ou_dormir})
        </Link>
        <Link
          to={`/recherche?lieu=${f.lieu.slug}&cat=restaurant`}
          className={cn(
            "inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full px-4 font-semibold",
            f.nb_ou_manger > 0 ? "border border-primary text-primary" : "border border-input text-muted-foreground"
          )}
        >
          <Utensils className="h-4 w-4" aria-hidden="true" />
          Où manger ({f.nb_ou_manger})
        </Link>
      </div>

      {f.enfants.length > 0 && (
        <section className="dk-reveal mt-6">
          <h2 className="dk-etiquette">Aux alentours</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {f.enfants.map((e) => (
              <li key={e.slug}>
                <Link
                  to={`/lieu/${e.slug}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm hover:border-primary hover:text-primary"
                >
                  <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                  {e.nom}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {f.lieu.lat != null && (
        <Link
          to={`/carte?lieu=${f.lieu.slug}`}
          className="mt-6 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-medium"
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Voir sur la carte
        </Link>
      )}
    </div>
  );
}
