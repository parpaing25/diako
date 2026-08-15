import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, Backpack, Clock, MapPin, Ticket, Trees, Users } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { EtatErreur, Squelettes } from "@/components/Etats";
import { ImageProgressive } from "@/components/ImageProgressive";
import { ariary } from "@/lib/etablissements";
import { chargerSite, type SiteListe } from "@/lib/decouverte";

/**
 * LA FICHE D'UN SITE OU D'UN PARC — /site/:slug (écran N2 du design final).
 *
 * ⚠ LES DEUX TARIFS D'ENTRÉE SONT LA PREMIÈRE CHOSE MONTRÉE, et ils sont
 *   nommés. Les parcs malgaches facturent un tarif résident et un tarif
 *   étranger, avec un écart de un à cinq ou dix. C'est l'information la plus
 *   consultée de la page, et la plus dangereuse à approximer.
 *
 * ⚠ LE GUIDE SE FACTURE PAR GROUPE, ET L'ÉCRAN L'ÉCRIT. Une famille de cinq
 *   paie le même guide qu'un couple. Le lire comme un prix par personne
 *   multiplierait l'estimation par cinq — c'est exactement le genre d'erreur
 *   qui fait renoncer à une visite.
 *
 * ⚠ LES FADY ONT LEUR PROPRE BLOC, en doré, avant « à emporter ». Les interdits
 *   locaux ne figurent sur aucun site concurrent : les reléguer en bas de page
 *   reviendrait à les traiter comme une curiosité, alors que c'est une marque
 *   de respect autant qu'une information pratique.
 */

interface SiteComplet extends SiteListe {
  description?: string | null;
  manager?: string | null;
  circuits?: { nom: string; duree?: string; niveau?: string }[];
  gear_needed?: string[];
  species?: string[];
  opening_hours?: string | null;
  ticket_validity_days?: number | null;
  lat?: number | null;
  lng?: number | null;
}

const MOIS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export default function Site() {
  const { slug } = useParams<{ slug: string }>();
  const [s, setS] = useState<SiteComplet | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "absent" | "erreur">("chargement");
  useReveal(s?.id);

  const charger = useCallback(async () => {
    if (!slug) return;
    setEtat("chargement");
    try {
      const d = (await chargerSite(slug)) as SiteComplet | null;
      if (!d) return setEtat("absent");
      setS(d);
      setEtat("ok");
    } catch {
      setEtat("erreur");
    }
  }, [slug]);

  useEffect(() => {
    void charger();
  }, [charger]);

  useSEO({
    titre: s ? `${s.name} — tarifs, guide et fady` : "Site à visiter",
    description:
      s?.summary ??
      (s ? `${s.name} : entrée résident et non-résident, guide, meilleurs mois et fady.` : undefined),
    image: s?.cover_url ?? undefined,
    url: slug ? `/site/${slug}` : undefined,
  });

  if (etat === "chargement")
    return (
      <div className="space-y-4 px-4 py-5">
        <div className="dk-skeleton h-40 rounded-2xl" />
        <div className="dk-skeleton h-8 w-1/2" />
        <Squelettes nombre={2} />
      </div>
    );

  if (etat === "erreur")
    return (
      <div className="px-4 py-8">
        <EtatErreur onReessayer={() => void charger()} />
      </div>
    );

  if (etat === "absent" || !s)
    return (
      <div className="px-4 py-16 text-center">
        <h1 className="dk-titre">Site introuvable</h1>
        <p className="mt-2 text-muted-foreground">Ce site n'est pas encore documenté sur Diako.</p>
        <Link
          to="/sites"
          className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          Tous les sites
        </Link>
      </div>
    );

  return (
    <div className="px-4 py-5 xl:flex xl:items-start xl:gap-5">
      <div className="min-w-0 flex-1">
        {s.cover_url && (
          <div className="mb-4 aspect-[16/9] overflow-hidden rounded-2xl bg-muted">
            <ImageProgressive src={s.cover_url} alt={s.name} prioritaire ajustement="cover" />
          </div>
        )}

        <p className="dk-etiquette">
          {s.kind}
          {s.manager ? ` · ${s.manager}` : ""}
        </p>
        <h1 className="dk-titre mt-1">{s.name}</h1>
        {s.place && (
          <p className="dk-secondaire mt-0.5">
            <Link to={`/lieu/${s.place.slug}`} className="inline-flex items-center gap-1 text-primary">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {s.place.name_fr}
            </Link>
          </p>
        )}
        {s.summary && <p className="dk-corps mt-3 max-w-[70ch]">{s.summary}</p>}
        {s.description && (
          <p className="dk-corps mt-3 max-w-[70ch] text-muted-foreground">{s.description}</p>
        )}

        {/* ── LES FADY ─────────────────────────────────────────────────── */}
        {s.fady.length > 0 && (
          <section className="dk-reveal mt-6 rounded-2xl border border-gold bg-gold-soft p-4">
            <h2 className="dk-etiquette inline-flex items-center gap-1.5 text-warn">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Fady · à respecter
            </h2>
            <p className="dk-secondaire mt-1.5 leading-relaxed">
              Les interdits locaux, écrits par ceux qui vivent là.
            </p>
            <ul className="mt-3 space-y-1.5">
              {s.fady.map((f) => (
                <li key={f} className="flex gap-2 text-sm">
                  <span aria-hidden="true">·</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Circuits sur place ───────────────────────────────────────── */}
        {(s.circuits?.length ?? 0) > 0 && (
          <section className="dk-reveal mt-6">
            <h2 className="dk-etiquette">Circuits sur place</h2>
            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {s.circuits!.map((c, i) => (
                <li key={i} className="flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0 truncate font-medium">{c.nom}</span>
                  <span className="dk-secondaire shrink-0">
                    {[c.duree, c.niveau].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── À emporter ───────────────────────────────────────────────── */}
        {((s.gear_needed?.length ?? 0) > 0 ||
          s.best_months.length > 0 ||
          (s.species?.length ?? 0) > 0 ||
          s.opening_hours) && (
          <section className="dk-reveal mt-6 rounded-2xl border border-border bg-card p-4">
            <h2 className="dk-etiquette inline-flex items-center gap-1.5">
              <Backpack className="h-4 w-4" aria-hidden="true" />
              À emporter
            </h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              {(s.gear_needed?.length ?? 0) > 0 && (
                <Detail t="Équipement">{s.gear_needed!.join(", ")}</Detail>
              )}
              {s.best_months.length > 0 && (
                <Detail t="Meilleurs mois">
                  <span className="inline-flex gap-1">
                    {MOIS.map((m, i) => (
                      <span
                        key={i}
                        title={`mois ${i + 1}`}
                        className={
                          s.best_months.includes(i + 1)
                            ? "grid h-6 w-6 place-items-center rounded bg-primary text-[11px] font-bold text-primary-foreground"
                            : "grid h-6 w-6 place-items-center rounded bg-muted text-[11px] text-muted-foreground/50"
                        }
                      >
                        {m}
                      </span>
                    ))}
                  </span>
                </Detail>
              )}
              {(s.species?.length ?? 0) > 0 && (
                <Detail t="Espèces observables">{s.species!.join(", ")}</Detail>
              )}
              {s.opening_hours && (
                <Detail t="Horaires">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {s.opening_hours}
                  </span>
                </Detail>
              )}
            </dl>
          </section>
        )}
      </div>

      {/* ── Les repères, colonne de droite (gabarit G3) ─────────────────── */}
      <aside className="mt-6 shrink-0 space-y-3 xl:sticky xl:top-20 xl:mt-0 xl:w-[340px]">
        <div className="rounded-2xl border-2 border-primary/25 bg-card p-5">
          <h2 className="dk-etiquette inline-flex items-center gap-1.5">
            <Ticket className="h-4 w-4" aria-hidden="true" />
            Entrer
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Ligne t="Entrée · résident">
              {s.fee_resident_ar != null ? ariary(s.fee_resident_ar) : "non communiqué"}
            </Ligne>
            <Ligne t="Entrée · non-résident">
              {s.fee_nonresident_ar != null ? ariary(s.fee_nonresident_ar) : "non communiqué"}
            </Ligne>
            {s.guide_required && (
              <Ligne t="Guide obligatoire">
                {s.guide_fee_group_ar != null ? ariary(s.guide_fee_group_ar) : "—"}
                <span className="block text-xs font-normal text-muted-foreground">
                  par groupe et par circuit
                </span>
              </Ligne>
            )}
            {s.ticket_validity_days != null && (
              <Ligne t="Validité du billet">
                {s.ticket_validity_days} jour{s.ticket_validity_days > 1 ? "s" : ""}
              </Ligne>
            )}
          </dl>

          {/* ⚠ Le guide par GROUPE, redit en clair : c'est l'erreur de lecture
              la plus coûteuse de cet écran. */}
          {s.guide_required && (
            <p className="mt-3 flex gap-2 rounded-xl bg-secondary p-3 text-xs leading-relaxed">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              Le guide se paie par groupe, pas par personne : à cinq, vous payez
              le même guide qu'à deux.
            </p>
          )}

          {s.rates_checked_at ? (
            <p className="dk-secondaire mt-3">
              Tarifs relevés le {new Date(s.rates_checked_at).toLocaleDateString("fr-FR")}.
            </p>
          ) : (
            <p className="dk-secondaire mt-3">Date de relevé inconnue — à confirmer sur place.</p>
          )}
        </div>

        {s.lat != null && s.lng != null && (
          <Link
            to="/carte"
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-input text-sm font-semibold"
          >
            <Trees className="h-4 w-4" aria-hidden="true" />
            Voir sur la carte
          </Link>
        )}
      </aside>
    </div>
  );
}

function Ligne({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{t}</dt>
      <dd className="text-right font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

function Detail({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="dk-secondaire">{t}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
