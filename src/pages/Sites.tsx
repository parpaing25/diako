import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Compass, Search, Trees } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { EmptyState, EtatErreur } from "@/components/Etats";
import { ImageProgressive } from "@/components/ImageProgressive";
import { ariary } from "@/lib/etablissements";
import { chargerSites, compterSites, GENRES_SITE, type SiteListe } from "@/lib/decouverte";
import { cn } from "@/lib/utils";

/**
 * SITES ET PARCS — /sites (écran N2 du design final, vue liste).
 *
 * ⚠ LA DOUBLE GRILLE RÉSIDENT / NON-RÉSIDENT EST AFFICHÉE DÈS LA VIGNETTE.
 *   Les parcs nationaux malgaches facturent deux tarifs, et l'écart va de un à
 *   cinq ou dix. Montrer un seul prix tromperait la moitié des visiteurs, dans
 *   un sens ou dans l'autre — un Malgache croirait le parc hors de portée, un
 *   étranger arriverait avec la moitié de la somme.
 *
 * ⚠ LES FADY SONT PORTÉS PAR LA FICHE, pas par une note de bas de page. Les
 *   interdits locaux n'existent sur aucun concurrent : c'est une marque de
 *   respect autant qu'une information utile.
 *
 * 🔴 L'ÉCRAN CHARGEAIT 24 SITES SUR 2 474, triés par nom croissant : il
 *    s'arrêtait aux « A », et 2 450 sites n'étaient atteignables par AUCUN
 *    chemin du site. Un annuaire dont on ne peut pas voir le fond n'est pas un
 *    annuaire. D'où le filtre par genre, la recherche par nom, et un
 *    « voir plus » à curseur.
 *
 * ⚠ LE COMPTE VIENT D'UNE RPC, pas d'un `count` côté client : PostgREST
 *   plafonne toute réponse à 1 000 lignes SANS LE DIRE, et l'écran aurait
 *   annoncé « 1 000 sites » avec l'aplomb d'un chiffre exact.
 */

const ETIQUETTE: Record<string, string> = {
  reserve: "Réserves et parcs nationaux",
  parc: "Forêts et parcs",
  sommet: "Sommets et massifs",
  plage: "Côtes, baies et plages",
  patrimoine: "Patrimoine",
  site: "Lacs, îles et rivières",
  point_de_vue: "Points de vue",
  cascade: "Cascades",
  grotte: "Grottes",
  musee: "Musées",
  parc_animalier: "Parcs animaliers",
  oeuvre: "Œuvres",
  aire: "Aires de pique-nique",
  source: "Sources",
  source_chaude: "Sources chaudes",
};

const PAR_PAGE = 24;

/** ⚠ Les 23 régions, écrites comme `places.region` les porte — nom complet, pas
 *  slug. Une seule divergence d'orthographe et le filtre ne rend rien. */
const REGIONS = [
  "Alaotra-Mangoro", "Amoron'i Mania", "Analamanga", "Analanjirofo", "Androy",
  "Anosy", "Atsimo-Andrefana", "Atsimo-Atsinanana", "Atsinanana", "Betsiboka",
  "Boeny", "Bongolava", "Diana", "Fitovinany", "Haute Matsiatra", "Ihorombe",
  "Itasy", "Melaky", "Menabe", "Sava", "Sofia", "Vakinankaratra", "Vatovavy",
];
export default function Sites() {
  useSEO({
    titre: "Sites et parcs de Madagascar — tarifs et fady",
    description:
      "Les parcs nationaux et sites à visiter de Madagascar : entrée résident et non-résident, guide obligatoire ou non, meilleurs mois, et les fady à respecter.",
    url: "https://diako.fonenako.mg/sites",
  });

  const [sites, setSites] = useState<SiteListe[]>([]);
  const [chargement, setChargement] = useState(true);
  const [encore, setEncore] = useState(false);
  const [fini, setFini] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [genre, setGenre] = useState<string>("");
  const [region, setRegion] = useState<string>("");
  const [q, setQ] = useState("");
  const [recherche, setRecherche] = useState("");
  const [compte, setCompte] = useState<{ total: number; parGenre: Record<string, number> } | null>(null);
  useReveal(sites);

  // ⚠ GARDE-FOU DE CONCURRENCE. Changer de genre pendant qu'une page arrive
  //   ferait afficher le résultat de l'ANCIEN filtre par-dessus le nouveau —
  //   des sommets sous l'onglet « Grottes ». On numérote les demandes et on
  //   n'accepte que la dernière.
  const version = useRef(0);

  const charger = useCallback(
    async (apres: string | null = null) => {
      const mien = ++version.current;
      apres ? setEncore(true) : setChargement(true);
      setErreur(false);
      try {
        const page = await chargerSites({
          genre: genre || undefined,
          region: region || undefined,
          q: recherche || undefined,
          apres,
          limite: PAR_PAGE,
        });
        if (mien !== version.current) return;
        setFini(page.length < PAR_PAGE);
        setSites((avant) => {
          if (!apres) return page;
          const vus = new Set(avant.map((x) => x.id));
          return [...avant, ...page.filter((x) => !vus.has(x.id))];
        });
      } catch {
        if (mien === version.current) setErreur(true);
      } finally {
        if (mien === version.current) {
          setChargement(false);
          setEncore(false);
        }
      }
    },
    [genre, region, recherche]
  );

  useEffect(() => {
    void charger();
  }, [charger]);

  useEffect(() => {
    compterSites().then(setCompte).catch(() => setCompte(null));
  }, []);

  // ⚠ On attend que la frappe se calme : une requête par lettre saturerait
  //   l'API et ferait clignoter la grille.
  useEffect(() => {
    const t = setTimeout(() => setRecherche(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="px-4 py-5">
      <p className="dk-etiquette">Nature et patrimoine</p>
      <h1 className="dk-titre mt-1">Sites et parcs</h1>
      <p className="dk-corps mt-2 max-w-[70ch] text-muted-foreground">
        {compte
          ? `${compte.total.toLocaleString("fr-FR")} sites recensés : parcs nationaux, sommets, côtes, cascades et patrimoine.`
          : "Les parcs nationaux et les sites à visiter."}{" "}
        Avec leurs deux tarifs d'entrée, le guide quand il est obligatoire, les
        meilleurs mois — et les fady à respecter sur place.
      </p>

      {/* ── CHERCHER ET FILTRER ──────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Chercher un site par son nom</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tsingy, Isalo, Nosy…"
            className="min-h-11 w-full rounded-full border border-input bg-card pl-9 pr-4 text-sm outline-none focus-visible:border-primary"
          />
        </label>

        {/* ⚠ UNE LISTE DÉROULANTE, PAS 23 PASTILLES. Vingt-trois régions en
            pastilles prendraient quatre lignes au-dessus de la grille et
            repousseraient les sites sous la ligne de flottaison. */}
        <label className="flex items-center gap-2">
          <span className="sr-only">Filtrer par région</span>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="min-h-11 rounded-full border border-input bg-card px-4 text-sm font-medium outline-none focus-visible:border-primary"
          >
            <option value="">Toutes les régions</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ⚠ ON N'AFFICHE QUE LES GENRES QUI RENDENT QUELQUE CHOSE. Un onglet qui
          ouvre sur une page blanche fait croire que le site est cassé, pas que
          la donnée manque. */}
      {compte && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Filtre actif={!genre} onClick={() => setGenre("")}>
            Tous · {compte.total.toLocaleString("fr-FR")}
          </Filtre>
          {GENRES_SITE.filter((g) => (compte.parGenre[g] ?? 0) > 0).map((g) => (
            <Filtre key={g} actif={genre === g} onClick={() => setGenre(g)}>
              {ETIQUETTE[g] ?? g} · {compte.parGenre[g]}
            </Filtre>
          ))}
        </div>
      )}

      {erreur && <EtatErreur className="mt-5" onReessayer={() => void charger()} />}

      {chargement && (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 large:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="dk-skeleton h-56 rounded-2xl" />
          ))}
        </ul>
      )}

      {!chargement && sites.length > 0 && (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 large:grid-cols-4">
          {sites.map((s) => (
            <li key={s.id}>
              <Link
                to={`/site/${s.slug}`}
                className="dk-reveal dk-carte block overflow-hidden rounded-2xl border border-border bg-card"
              >
                <div className="dk-zoom aspect-[4/3] bg-secondary">
                  {s.cover_url ? (
                    <ImageProgressive src={s.cover_url} alt={s.name} ajustement="cover"
              largeurAffichee={"(min-width:1536px) 22vw, (min-width:1280px) 25vw, (min-width:768px) 33vw, 50vw"}
            />
                  ) : (
                    <span className="grid h-full w-full place-items-center">
                      <Trees className="h-8 w-8 text-primary/40" aria-hidden="true" />
                    </span>
                  )}
                </div>
                <div className="p-3.5">
                  <p className="dk-etiquette">{s.kind}</p>
                  <h2 className="mt-1 truncate text-[16px] font-bold leading-tight">{s.name}</h2>
                  {s.place && <p className="dk-secondaire mt-0.5 truncate">{s.place.name_fr}</p>}

                  {/* ⚠ LES DEUX TARIFS, TOUJOURS ENSEMBLE ET TOUJOURS NOMMÉS. */}
                  {(s.fee_resident_ar != null || s.fee_nonresident_ar != null) && (
                    <dl className="mt-3 space-y-1 border-t border-border pt-2.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Entrée · résident</dt>
                        <dd className="font-semibold tabular-nums">
                          {s.fee_resident_ar != null ? ariary(s.fee_resident_ar) : "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Entrée · non-résident</dt>
                        <dd className="font-semibold tabular-nums">
                          {s.fee_nonresident_ar != null ? ariary(s.fee_nonresident_ar) : "—"}
                        </dd>
                      </div>
                      {s.guide_required && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Guide obligatoire</dt>
                          <dd className="text-right font-semibold tabular-nums">
                            {s.guide_fee_group_ar != null
                              ? `${ariary(s.guide_fee_group_ar)} / groupe`
                              : "par groupe"}
                          </dd>
                        </div>
                      )}
                    </dl>
                  )}

                  {s.fady.length > 0 && (
                    <p className="mt-2.5 rounded-lg bg-gold-soft px-2.5 py-1.5 text-[11px] font-semibold text-warn">
                      {s.fady.length} fady à respecter
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* ⚠ « VOIR PLUS » PLUTOT QU'UN DEFILEMENT INFINI : sur une grille de
          fiches, le défilement infini rend le pied de page inatteignable et
          empêche de revenir où on en était. */}
      {!chargement && sites.length > 0 && !fini && (
        <div className="mt-5 flex justify-center">
          <button
            onClick={() => void charger(sites[sites.length - 1].name)}
            disabled={encore}
            className="min-h-11 rounded-full border border-input px-6 text-sm font-semibold hover:border-primary hover:text-primary disabled:opacity-60"
          >
            {encore ? "Chargement…" : "Voir plus de sites"}
          </button>
        </div>
      )}

      {/* Une recherche sans résultat n'est pas un annuaire vide : on ne
          propose pas « raconter une visite » à quelqu'un qui cherchait un nom. */}
      {!chargement && sites.length === 0 && !erreur && (recherche || genre || region) && (
        <div className="mt-8 text-center">
          <p className="font-semibold">Aucun site ne correspond.</p>
          <p className="dk-secondaire mt-1">
            {recherche
              ? `Rien pour « ${recherche} »`
              : region
                ? `Rien de ce genre dans la région ${region}`
                : "Rien dans ce genre"}{" "}
            — essayez un autre mot ou revenez à la liste complète.
          </p>
          <button
            onClick={() => {
              setQ("");
              setGenre("");
              setRegion("");
            }}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
          >
            Voir tous les sites
          </button>
        </div>
      )}

      {!chargement && sites.length === 0 && !erreur && !recherche && !genre && !region && (
        <EmptyState
          className="mt-5"
          icone={Trees}
          manque="Aucun site n'est encore documenté sur Diako."
          action={{ libelle: "Raconter une visite", lien: "/publier" }}
          contenuReel={
            <>
              <p className="dk-secondaire leading-relaxed">
                Les parcs et les sites arrivent avec leurs deux grilles de tarifs
                et leurs fady, saisis un par un. En attendant, les destinations
                du référentiel portent déjà leur saisonnalité et leurs accès.
              </p>
              <Link
                to="/explorer"
                className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-semibold"
              >
                <Compass className="h-4 w-4" aria-hidden="true" />
                Explorer les destinations
              </Link>
            </>
          }
        />
      )}
    </div>
  );
}

function Filtre({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={actif}
      className={cn(
        "min-h-9 rounded-full border px-3.5 text-xs font-semibold transition",
        actif
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:border-primary hover:text-primary"
      )}
    >
      {children}
    </button>
  );
}
