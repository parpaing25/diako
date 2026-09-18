import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Backpack, Clock, Compass, Ticket, Trees, Users } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { useRetour } from "@/hooks/useRetour";
import { EtatErreur, Squelettes } from "@/components/Etats";
import { AdressesProches } from "@/components/AdressesProches";
import { BoutonPartager, CouvertureFiche, LigneAccueil } from "@/components/Arrivee";
import { ariary } from "@/lib/etablissements";
import { chargerSite, type SiteListe } from "@/lib/decouverte";
import { libelleTypeCourt, normaliser } from "@/lib/sites";
import { SITE_URL, lienCarte, majuscule, venuDuSite } from "@/lib/arrivee";

/**
 * LA FICHE D'UN SITE OU D'UN PARC — /site/:slug (écran N2 du design final).
 *
 * ⚠ C'EST UNE PAGE D'ARRIVÉE. Depuis le 19/09/2026, des publications Facebook
 *   renvoient vers dix pages /site : on y arrive sans compte, sans historique,
 *   dans le navigateur intégré de Facebook. La page dit donc ce qu'est Diako,
 *   se partage d'un geste, et ne s'arrête plus sur « Voir sur la carte » : elle
 *   mène aux adresses les plus proches et à la fiche du lieu.
 *
 * ⚠ LES DEUX TARIFS D'ENTRÉE SONT NOMMÉS quand ils existent. Les parcs
 *   malgaches facturent un tarif résident et un tarif étranger, avec un écart
 *   de un à cinq ou dix. Quand AUCUN n'est relevé — 2 444 sites sur 2 451 le
 *   18/09/2026 —, une seule ligne le dit, au lieu de deux « non communiqué »
 *   et d'une « date de relevé inconnue » qui faisaient trois fois le même aveu.
 *
 * ⚠ LE GUIDE SE FACTURE PAR GROUPE, ET L'ÉCRAN L'ÉCRIT. Une famille de cinq
 *   paie le même guide qu'un couple.
 *
 * ⚠ LES FADY ONT LEUR PROPRE BLOC, en doré, avant « à emporter » : c'est une
 *   marque de respect autant qu'une information pratique.
 */

interface SiteComplet extends SiteListe {
  description?: string | null;
  source?: string | null;
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

/**
 * L'accroche et le texte qui la suit.
 *
 * 🔴 L'ACCROCHE ÉTAIT LE RÉSUMÉ WIKIDATA — « lac malgache », « Phare ». Une
 *    description Wikidata dit ce QU'EST la chose pour la distinguer d'un
 *    homonyme ; elle ne donne aucune raison d'y aller. Sous 40 caractères, on
 *    prend donc la description, et le même texte n'est jamais écrit deux fois.
 */
function textes(s: SiteComplet): { accroche: string | null; suite: string | null } {
  const resume = s.summary?.trim() || null;
  const description = s.description?.trim() || null;
  const accroche = resume && resume.length >= 40 ? resume : description ?? resume;
  const suite = accroche === resume && description && description !== resume ? description : null;
  return {
    accroche: accroche ? majuscule(accroche) : null,
    suite: suite ? majuscule(suite) : null,
  };
}

/**
 * Le site relève-t-il de Madagascar National Parks ?
 *
 * ⚠ LE TYPE NE SUFFIT PAS. `reserve` couvre aussi des réserves PRIVÉES
 *   (Berenty) et des forêts communautaires : leur annoncer le doublement des
 *   droits des parcs nationaux serait faux. On ne le dit qu'aux sites dont le
 *   gestionnaire ou le nom désigne un parc national, une réserve spéciale ou
 *   MNP — comparés sans accents ni casse.
 */
const AIRE_MNP = /\b(parcs? nationa(l|ux)|reserves? speciales?|madagascar national parks?|mnp)\b/;
function estAireMnp(s: SiteComplet): boolean {
  return AIRE_MNP.test(normaliser(`${s.manager ?? ""} ${s.name}`));
}

/**
 * D'où vient le texte de cette fiche.
 *
 * ⚠ TROIS PROVENANCES, TROIS RÉGIMES. Wikipédia est en CC BY-SA : citer et lier
 *   la licence est OBLIGATOIRE. Wikidata est en CC0 : rien n'est exigé, mais on
 *   cite quand même — un lecteur qui voit une erreur doit savoir où la corriger.
 *   OpenStreetMap est en ODbL : l'attribution est exigée aussi.
 * ⚠ LA CHAÎNE STOCKÉE EST « <Source> · <référence> ». On n'affiche un lien que
 *   si la référence est une URL ou un identifiant qu'on sait résoudre ; sinon
 *   on affiche le texte brut plutôt qu'un lien cassé.
 */
function Attribution({ source }: { source: string }) {
  const [origine, ref] = source.split(" · ");
  let href: string | null = null;
  let licence: { nom: string; url: string } | null = null;

  if (/^https?:\/\//.test(ref ?? "")) {
    href = ref;
    licence = { nom: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/deed.fr" };
  } else if (origine === "Wikidata" && /^Q\d+$/.test(ref ?? "")) {
    href = `https://www.wikidata.org/wiki/${ref}`;
    licence = { nom: "CC0", url: "https://creativecommons.org/publicdomain/zero/1.0/deed.fr" };
  } else if (origine === "OpenStreetMap") {
    href = ref ? `https://www.openstreetmap.org/${ref}` : "https://www.openstreetmap.org/";
    licence = { nom: "ODbL", url: "https://opendatacommons.org/licenses/odbl/" };
  }

  return (
    <p className="dk-secondaire mt-4 max-w-[70ch]">
      Source&nbsp;:{" "}
      {href ? (
        <a href={href} target="_blank" rel="noreferrer noopener" className="text-primary underline">
          {origine}
        </a>
      ) : (
        origine
      )}
      {licence && (
        <>
          {" · "}
          <a href={licence.url} target="_blank" rel="noreferrer noopener" className="underline">
            {licence.nom}
          </a>
        </>
      )}
      . Une erreur dans ce texte&nbsp;? Elle se corrige sur Wikipédia.
    </p>
  );
}

export default function Site() {
  const { slug } = useParams<{ slug: string }>();
  const [s, setS] = useState<SiteComplet | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "absent" | "erreur">("chargement");
  /** Arrivé directement (Facebook, WhatsApp) : on dit en une ligne ce qu'est Diako. */
  const [interne] = useState(venuDuSite);
  /* ⚠ RetourEntete s'efface sur /site/ (la page porte son propre retour) :
     sans ce bouton, une arrivée depuis /sites ou /lieu n'avait plus de retour. */
  const retour = useRetour("/sites");
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
    // Une fiche inexistante rend HTTP 200 (repli SPA) : `noindex` évite le soft 404 (audit 05/09/2026).
    noindex: etat === "absent",
    description: s ? textes(s).accroche ?? `${s.name} — la fiche du site sur Diako.` : undefined,
    image: s?.cover_url ?? undefined,
    type: s ? "article" : "website",
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

  const { accroche, suite } = textes(s);
  const type = libelleTypeCourt(s.kind);
  // ⚠ Le lien vers le lieu répétait le titre quand les deux portent le même
  //   nom (« Isalo » sous « Isalo ») : il n'est écrit ici que s'il apporte
  //   quelque chose. La fiche du lieu reste proposée en bas de page.
  const lieuDifferent = s.place !== null && normaliser(s.place.name_fr) !== normaliser(s.name);
  const etiquette = [s.place?.region, s.manager].filter(Boolean).join(" · ") || "Site à visiter";
  const sansTarif =
    s.fee_resident_ar == null &&
    s.fee_nonresident_ar == null &&
    !s.guide_required &&
    s.ticket_validity_days == null;
  const bandeauMnp = estAireMnp(s) && s.fee_nonresident_ar == null;

  return (
    <div className="px-4 pb-5 pt-2 sm:pt-5 xl:flex xl:items-start xl:gap-5">
      <div className="min-w-0 flex-1 xl:max-w-[620px]">
        {interne ? (
          <button
            onClick={retour}
            className="mb-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Retour
          </button>
        ) : (
          <LigneAccueil className="mb-2" />
        )}

        {/* 🔴 LE CRÉDIT EST SUR LA PHOTO, PAS EN PIED DE SITE. Les images
            viennent en partie de Wikimedia Commons, sous licences dont la
            plupart exigent de nommer l'auteur ET la licence : une fiche
            partagée seule doit emporter son crédit. */}
        <CouvertureFiche
          src={s.cover_url}
          alt={s.name}
          credit={s.cover_credit}
          licence={s.cover_licence}
          source={s.cover_source}
        />

        <p className="dk-etiquette">{etiquette}</p>
        <h1 className="dk-titre mt-1">{s.name}</h1>
        <p className="dk-secondaire mt-0.5">
          {type}
          {lieuDifferent && s.place && (
            <>
              {" · "}
              <Link
                to={`/lieu/${s.place.slug}`}
                className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
              >
                {s.place.name_fr}
              </Link>
            </>
          )}
        </p>

        <div className="mt-3">
          <BoutonPartager url={`${SITE_URL}/site/${s.slug}`} texte={`${s.name} sur Diako`} />
        </div>

        {accroche && <p className="dk-corps mt-4 max-w-[70ch]">{accroche}</p>}
        {suite && <p className="dk-corps mt-3 max-w-[70ch] text-muted-foreground">{suite}</p>}

        {/* 🔴 L'ATTRIBUTION EST UNE OBLIGATION, PAS UNE POLITESSE. Le texte de
            ces fiches vient de Wikipédia (CC BY-SA) ou de Wikidata (CC0). Elle
            est DANS la page : une fiche partagée seule emporte sa source. */}
        {s.source && <Attribution source={s.source} />}

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
                            ? "grid h-6 w-6 place-items-center rounded bg-primary text-xs font-bold text-primary-foreground"
                            : "grid h-6 w-6 place-items-center rounded bg-muted text-xs text-muted-foreground/50"
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

        {/* ── Les adresses les plus proches — la page ne s'arrête plus sur
            « Voir sur la carte » ─────────────────────────────────────────── */}
        {s.lat != null && s.lng != null && <AdressesProches lat={s.lat} lng={s.lng} nom={s.name} />}

        {/* ── La fiche du lieu, quand le site en a un ──────────────────── */}
        {s.place && (
          <Link
            to={`/lieu/${s.place.slug}`}
            className="mt-6 flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary"
          >
            <Compass className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="dk-etiquette block">Le lieu</span>
              <span className="block font-semibold">
                {s.place.name_fr}
                {s.place.region ? ` · ${s.place.region}` : ""}
              </span>
              <span className="dk-secondaire block">Où dormir, où manger, y aller et quand partir.</span>
            </span>
          </Link>
        )}
      </div>

      {/* ── Les repères, colonne de droite (gabarit G3) ─────────────────── */}
      <aside className="mt-6 shrink-0 space-y-3 xl:sticky xl:top-20 xl:mt-0 xl:w-[340px]">
        <div className="rounded-2xl border-2 border-primary/25 bg-card p-5">
          <h2 className="dk-etiquette inline-flex items-center gap-1.5">
            <Ticket className="h-4 w-4" aria-hidden="true" />
            Entrer
          </h2>

          {sansTarif ? (
            /* ⚠ LE BLOC RESTE, et il dit une seule fois ce qui manque. */
            <p className="mt-3 text-sm">
              Tarif d'entrée : pas encore relevé sur Diako, à demander sur place.
            </p>
          ) : (
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
          )}

          {/* 🔴 UN FAIT DATÉ VAUT MIEUX QU'UN PRIX INVENTÉ. Madagascar National
              Parks a annoncé en mai 2026 le DOUBLEMENT des droits d'entrée,
              applicable au 1ᵉʳ novembre 2026. Aucune table officielle par parc
              n'est publiée : on ne remplit donc AUCUN tarif de parc.
              ⚠ Replié par défaut, intitulé par sa nouvelle : sur un téléphone,
                le paragraphe entier poussait tout le reste hors de l'écran.
              ⚠ Seulement pour les aires de MNP (voir `estAireMnp`). */}
          {bandeauMnp && (
            <details className="mt-3 rounded-xl border border-gold bg-gold-soft text-sm leading-relaxed">
              <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
                Droits d'entrée des parcs nationaux doublés au 1ᵉʳ novembre 2026
              </summary>
              <p className="px-3 pb-3">
                Madagascar National Parks a annoncé en mai 2026 le doublement des
                droits d'entrée de ses parcs, applicable au 1ᵉʳ novembre 2026. Nous
                n'avons pas de tarif vérifié pour ce site, et nous préférons ne rien
                afficher plutôt qu'un prix approximatif. Demandez le tarif du jour à
                l'entrée ou à votre guide.{" "}
                <a
                  href="https://www.lexpress.mg/2026/05/aires-protegees-les-tarifs-dentree-dans.html"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline"
                >
                  L'Express de Madagascar, mai 2026
                </a>
              </p>
            </details>
          )}

          {/* ⚠ Le guide par GROUPE, redit en clair : c'est l'erreur de lecture
              la plus coûteuse de cet écran. */}
          {s.guide_required && (
            <p className="mt-3 flex gap-2 rounded-xl bg-secondary p-3 text-xs leading-relaxed">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              Le guide se paie par groupe, pas par personne : à cinq, vous payez
              le même guide qu'à deux.
            </p>
          )}

          {!sansTarif &&
            (s.rates_checked_at ? (
              <p className="dk-secondaire mt-3">
                Tarifs relevés le {new Date(s.rates_checked_at).toLocaleDateString("fr-FR")}.
              </p>
            ) : (
              <p className="dk-secondaire mt-3">Date de relevé inconnue — à confirmer sur place.</p>
            ))}
        </div>

        {s.lat != null && s.lng != null && (
          <Link
            to={lienCarte(s.lat, s.lng)}
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
