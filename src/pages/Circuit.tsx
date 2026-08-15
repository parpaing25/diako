import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CalendarCheck, MessageCircle, Route, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { EtatErreur, Squelettes } from "@/components/Etats";
import { BadgeVerification } from "@/components/Badges";
import { ariary } from "@/lib/etablissements";
import { cn } from "@/lib/utils";

/**
 * LA FICHE D'UN CIRCUIT — /circuit/:slug (écran N1 du design final).
 *
 * ⚠ LE PRIX BAISSE QUAND LE GROUPE GRANDIT, ET L'ÉCRAN LE MONTRE. C'est la
 *   règle du métier : la voiture, le chauffeur et le guide se partagent. Un
 *   prix unique tromperait le couple comme le groupe de six. Le barème vit dans
 *   `tour_prices`, par palier de `pax_min`.
 *
 * ⚠ « NON INCLUS » A SON PROPRE BLOC, jamais fondu dans le prix. Les droits
 *   d'entrée des parcs peuvent représenter le quart du budget d'un circuit
 *   nature ; les taire jusqu'au départ est la plainte n°1 du secteur.
 *
 * ⚠ AUCUNE RÉSERVATION EN LIGNE. « Demander un devis », jamais « Réserver ».
 */

const DIFFICULTE: Record<string, string> = {
  facile: "Facile",
  moyen: "Moyen",
  sportif: "Sportif",
  difficile: "Difficile",
};

const MOIS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

interface Fiche {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  duration_days: number;
  duration_nights: number | null;
  difficulty: string | null;
  format: string | null;
  axe: string | null;
  months_open: number[] | null;
  transports: string[] | null;
  page: { slug: string; name: string; verification_status: string } | null;
  prices: { pax_min: number; pax_max: number | null; price_ar: number; price_unit: string }[];
  days: { day_no: number; title: string | null; km: number | null; hours: number | null; meals: string | null; lodging: string | null }[];
  inclusions: { label: string; included: boolean }[];
}

export default function Circuit() {
  const { slug } = useParams<{ slug: string }>();
  const [f, setF] = useState<Fiche | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "absent" | "erreur">("chargement");
  useReveal(f?.id);

  const charger = useCallback(async () => {
    if (!slug) return;
    setEtat("chargement");
    try {
      const { data, error } = await supabase
        .from("tours")
        .select(
          "id, slug, title, summary, description, duration_days, duration_nights, difficulty, " +
            "format, axe, months_open, transports, page:pages(slug, name, verification_status), " +
            "prices:tour_prices(pax_min, pax_max, price_ar, price_unit), " +
            "days:tour_days(day_no, title, km, hours, meals, lodging), " +
            "inclusions:tour_inclusions(label, included)"
        )
        .eq("slug", slug)
        .limit(1);
      if (error) throw error;
      if (!data?.length) return setEtat("absent");
      setF(data[0] as unknown as Fiche);
      setEtat("ok");
    } catch {
      setEtat("erreur");
    }
  }, [slug]);

  useEffect(() => {
    void charger();
  }, [charger]);

  useSEO({
    titre: f ? `${f.title} — circuit de ${f.duration_days} jours` : "Circuit",
    description: f?.summary ?? undefined,
    url: slug ? `/circuit/${slug}` : undefined,
  });

  if (etat === "chargement")
    return (
      <div className="space-y-4 px-4 py-5">
        <div className="dk-skeleton h-8 w-2/3" />
        <Squelettes nombre={3} />
      </div>
    );

  if (etat === "erreur")
    return <div className="px-4 py-8"><EtatErreur onReessayer={() => void charger()} /></div>;

  if (etat === "absent" || !f)
    return (
      <div className="px-4 py-16 text-center">
        <h1 className="dk-titre">Circuit introuvable</h1>
        <p className="mt-2 text-muted-foreground">Ce circuit n'est pas publié sur Diako.</p>
        <Link
          to="/circuits"
          className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          Tous les circuits
        </Link>
      </div>
    );

  const inclus = f.inclusions?.filter((i) => i.included) ?? [];
  const nonInclus = f.inclusions?.filter((i) => !i.included) ?? [];
  const paliers = [...(f.prices ?? [])].sort((a, b) => a.pax_min - b.pax_min);
  const jours = [...(f.days ?? [])].sort((a, b) => a.day_no - b.day_no);

  return (
    <div className="px-4 py-5 xl:flex xl:items-start xl:gap-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-1.5">
          {f.axe && <Puce>{f.axe}</Puce>}
          <Puce>
            {f.duration_days} jour{f.duration_days > 1 ? "s" : ""}
            {f.duration_nights ? ` · ${f.duration_nights} nuits` : ""}
          </Puce>
          {f.difficulty && <Puce>{DIFFICULTE[f.difficulty] ?? f.difficulty}</Puce>}
          {f.format && <Puce>{f.format}</Puce>}
        </div>

        <h1 className="dk-titre mt-2">{f.title}</h1>
        {f.page && (
          <p className="dk-secondaire mt-1 inline-flex items-center gap-1.5">
            <Link to={`/p/${f.page.slug}`} className="text-primary">
              {f.page.name}
            </Link>
            {f.page.verification_status !== "none" && (
              <BadgeVerification niveau={f.page.verification_status} />
            )}
          </p>
        )}
        {f.summary && <p className="dk-corps mt-3 max-w-[70ch]">{f.summary}</p>}
        {f.description && (
          <p className="dk-corps mt-3 max-w-[70ch] text-muted-foreground">{f.description}</p>
        )}

        {/* ── Jour par jour ────────────────────────────────────────────── */}
        {jours.length > 0 && (
          <section className="dk-reveal mt-6">
            <h2 className="dk-etiquette">Jour par jour</h2>
            <ol className="mt-3 space-y-3">
              {jours.map((j) => (
                <li key={j.day_no} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {j.day_no}
                  </span>
                  <div className="min-w-0 flex-1 border-b border-border pb-3">
                    {j.title && <p className="font-semibold leading-tight">{j.title}</p>}
                    <p className="dk-secondaire mt-0.5">
                      {[
                        j.km && `${j.km} km`,
                        // ⚠ Heures RÉELLES : 250 km font 6 h ici, pas 2 h 30.
                        j.hours && `${j.hours} h de route réelles`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {(j.meals || j.lodging) && (
                      <p className="dk-secondaire">
                        {[j.meals, j.lodging].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ── Non inclus, à part ───────────────────────────────────────── */}
        {(inclus.length > 0 || nonInclus.length > 0) && (
          <section className="dk-reveal mt-6 grid gap-3 sm:grid-cols-2">
            {inclus.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <h2 className="dk-etiquette">Inclus</h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {inclus.map((i) => (
                    <li key={i.label}>· {i.label}</li>
                  ))}
                </ul>
              </div>
            )}
            {nonInclus.length > 0 && (
              <div className="rounded-2xl border border-accent-strong/30 bg-accent/[0.07] p-4">
                <h2 className="dk-etiquette text-accent-strong">Non inclus</h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {nonInclus.map((i) => (
                    <li key={i.label}>· {i.label}</li>
                  ))}
                </ul>
                <p className="dk-secondaire mt-2 leading-relaxed">
                  Affiché séparément, jamais fondu dans le prix.
                </p>
              </div>
            )}
          </section>
        )}
      </div>

      {/* ── Le barème par taille de groupe ───────────────────────────────── */}
      <aside className="mt-6 shrink-0 space-y-3 xl:sticky xl:top-20 xl:mt-0 xl:w-[340px]">
        <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
          <h2 className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] opacity-85">
            <Users className="h-4 w-4" aria-hidden="true" />
            Prix par personne, selon la taille du groupe
          </h2>
          {paliers.length > 0 ? (
            <>
              <ul className="mt-3 grid grid-cols-3 gap-2">
                {paliers.slice(0, 3).map((p) => (
                  <li key={p.pax_min} className="rounded-xl bg-white/12 p-2.5 text-center">
                    <p className="text-[11px] opacity-85">
                      {p.pax_min}
                      {p.pax_max ? `–${p.pax_max}` : "+"} pers.
                    </p>
                    <p className="mt-1 text-sm font-bold tabular-nums">{ariary(p.price_ar)}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-relaxed opacity-85">
                Le prix par personne baisse avec le groupe — la voiture, le
                chauffeur et le guide se partagent. C'est la règle du métier.
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm leading-relaxed opacity-90">
              L'agence n'a pas encore publié son barème. Demandez un devis : elle
              chiffrera selon votre groupe et vos dates.
            </p>
          )}
        </div>

        <button className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent-strong text-[15px] font-semibold text-accent-foreground">
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Demander un devis
        </button>

        {f.months_open?.length ? (
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="dk-etiquette inline-flex items-center gap-1.5">
              <CalendarCheck className="h-4 w-4" aria-hidden="true" />
              Mois d'ouverture
            </h2>
            <ul className="mt-2 flex gap-1">
              {MOIS.map((m, i) => (
                <li key={i} className="flex-1">
                  <span
                    className={cn(
                      "grid h-8 w-full place-items-center rounded-lg text-xs font-bold",
                      f.months_open!.includes(i + 1)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground/50"
                    )}
                  >
                    {m}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {f.transports?.length ? (
          <p className="dk-secondaire inline-flex items-center gap-1.5">
            <Route className="h-4 w-4" aria-hidden="true" />
            {f.transports.join(" · ")}
          </p>
        ) : null}

        <p className="dk-secondaire leading-relaxed">
          Aucune réservation en ligne : Diako met en relation, l'agence confirme.
        </p>
      </aside>
    </div>
  );
}

function Puce({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">
      {children}
    </span>
  );
}
