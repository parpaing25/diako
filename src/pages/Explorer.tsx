import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Compass,
  MapPin,
  Mountain,
  Sun,
  TentTree,
  TreePalm,
  Trees,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { compteur, useStats } from "@/hooks/useStats";
import { EmptyState, EtatErreur } from "@/components/Etats";
import { FicheCard } from "@/components/FicheCard";
import {
  CATEGORIES,
  chargerLieu,
  chargerSaisons,
  chercherPages,
  type Lieu,
  type ResultatPage,
} from "@/lib/etablissements";
import {
  chargerDestinations,
  grouperParFamille,
  type DestinationEmblematique,
  type Famille,
} from "@/lib/destinations";
import { jeuDeTailles } from "@/lib/imageThumb";
import { cn } from "@/lib/utils";

/**
 * DESTINATIONS — LES LIEUX EMBLÉMATIQUES DE MADAGASCAR, EN PHOTO D'ABORD.
 *
 * 🔴 CE QUE ÇA REMPLACE, ET POURQUOI. Cet écran portait la descente
 *    administrative pays › région › ville. Le propriétaire a nommé le
 *    contresens : « Destination devrait sonner comme lieu — qui entre ici doit
 *    voir des lieux de visite, des photos de plage, des endroits magnifiques. »
 *    Recompté le 01/09/2026 : le référentiel porte 61 lieux de ce calibre
 *    (13 îles, 12 plages, 17 parcs, 13 sites, 6 zones), TOUS résumés, 39 avec
 *    photo créditée — et l'ancien écran les enterrait sous 23 bandes de
 *    régions. La descente n'est pas perdue : elle vit sur /villes, sous son
 *    vrai nom.
 *
 * ⚠ LES ANCIENNES ADRESSES NE MEURENT PAS. `?region=` et `?ville=` redirigent
 *   vers /villes AVEC leurs paramètres : un lien partagé avant le renommage
 *   arrive au même écran. `?lieu=` (et son synonyme historique `?q=`) continue
 *   de servir la fiche allégée, comme avant — des publications pointent
 *   encore dessus.
 *
 * ⚠ SIX CARTES PAR FAMILLE, PUIS « VOIR PLUS » — qui se sert dans le tableau
 *   DÉJÀ reçu (les 61 fiches arrivent en une réponse), aucun aller-retour de
 *   plus. Les photos sont en `loading="lazy"` sauf la toute première, qui
 *   décide du LCP.
 *
 * ⚠ L'ORDRE DANS CHAQUE FAMILLE EST « PHOTO D'ABORD » et il vient de
 *   `lib/destinations.ts` : sur un écran dont l'argument est l'envie, les 22
 *   fiches sans photo ferment la marche — en aplat de marque, jamais en cadre
 *   gris « image cassée ».
 */

/** Six cartes ouvrent une famille : deux rangées sur téléphone, une et demie
 *  sur grand écran — assez pour donner envie, pas assez pour noyer. */
const PAR_VOLEE = 6;

const AUCUNE: DestinationEmblematique[] = [];

/** L'aplat de chaque famille, quand la photo n'est pas encore saisie. */
const ICONE_FAMILLE: Record<string, LucideIcon> = {
  ile: TreePalm,
  plage: Waves,
  parc: Trees,
  site: Mountain,
  zone_touristique: TentTree,
};

/** L'étiquette d'une carte — le genre au singulier, pas le code brut. */
const GENRE: Record<string, string> = {
  ile: "Île",
  plage: "Plage",
  parc: "Parc",
  site: "Site naturel",
  zone_touristique: "Zone touristique",
};

const genre = (k: string) => GENRE[k] ?? k.replace(/_/g, " ");

const nombre = (n: number) => n.toLocaleString("fr-FR");

const pluriel = (n: number, mot: string) => `${nombre(n)} ${mot}${n > 1 ? "s" : ""}`;

const lieux = (n: number) => `${nombre(n)} lieu${n > 1 ? "x" : ""}`;

/* ══ LE ROUTEUR DE L'ÉCRAN ════════════════════════════════════════════════ */

export default function Explorer() {
  const [params] = useSearchParams();
  // ⚠ `?q=` est accepté depuis longtemps comme synonyme de `?lieu=` : des
  //   publications renvoient encore vers `/explorer?q=…`.
  const lieu = params.get("lieu") ?? params.get("q");

  if (lieu) return <FicheLieu slug={lieu} />;

  // 🔴 LA DESCENTE A DÉMÉNAGÉ SUR /villes, SES LIENS NON. Tout `?region=` ou
  //    `?ville=` partagé avant le renommage est réexpédié AVEC ses paramètres :
  //    l'adresse change, la page attendue arrive quand même.
  if (params.get("region") || params.get("ville")) {
    return <Navigate to={{ pathname: "/villes", search: `?${params.toString()}` }} replace />;
  }

  return <VitrineDestinations />;
}

/* ══ LA VITRINE ═══════════════════════════════════════════════════════════ */

function VitrineDestinations() {
  const stats = useStats();
  const [elements, setElements] = useState<DestinationEmblematique[] | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "erreur">("chargement");
  /** Combien de cartes chaque famille montre. Absent = `PAR_VOLEE`. */
  const [volees, setVolees] = useState<Record<string, number>>({});

  const charger = useCallback(async () => {
    setEtat("chargement");
    try {
      const d = await chargerDestinations();
      setElements(d.elements);
      setEtat("ok");
    } catch {
      setEtat("erreur");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const liste = elements ?? AUCUNE;
  const groupes = useMemo(() => grouperParFamille(liste), [liste]);

  // ⚠ Un rechargement remet les volées à zéro : garder « 24 visibles » sur des
  //   données neuves afficherait tout d'un coup, sans raison visible.
  useEffect(() => setVolees({}), [groupes]);

  const nVisibles = useCallback(
    (kind: string) => volees[kind] ?? PAR_VOLEE,
    [volees]
  );

  /**
   * 🔴 `useReveal` REÇOIT LES CARTES RENDUES DE TOUTES LES FAMILLES, en un seul
   *    tableau mémorisé — jamais une longueur, jamais un tableau reconstruit à
   *    chaque rendu. Le piège est documenté sur neuf écrans de ce dépôt : des
   *    nœuds neufs sans `data-vu` restent à `opacity: 0`, page « vide » sans
   *    erreur.
   */
  const rendues = useMemo(
    () => groupes.flatMap((g) => g.cartes.slice(0, nVisibles(g.kind))),
    [groupes, nVisibles]
  );
  useReveal(rendues);

  useSEO({
    titre:
      liste.length > 0
        ? `Destinations — ${lieux(liste.length)} à visiter à Madagascar`
        : "Destinations de Madagascar",
    description:
      "Les lieux emblématiques de Madagascar : les îles, les plages, les parcs et réserves, les merveilles naturelles — avec leur saison, leurs récits et les adresses sur place.",
    url: "/explorer",
  });

  return (
    <div className="px-4 py-5">
      <p className="dk-etiquette">Découvrir</p>
      <div className="mt-1 flex items-center gap-2">
        <Compass className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
        <h1 className="dk-titre">Destinations</h1>
      </div>
      <p className="dk-corps mt-2 max-w-[70ch] text-muted-foreground">
        {liste.length > 0
          ? `${lieux(liste.length)} emblématiques, des îles du Nord aux parcs du Sud.`
          : "Les lieux emblématiques de Madagascar."}{" "}
        Chaque fiche dit quand y aller, comment, et ce qui s'y trouve.
      </p>

      {/* ── CE QUE CET ÉCRAN N'EST PAS, dit en une ligne de liens ──────────
          ⚠ Les villes ont quitté cet écran : sans ces portes, qui cherche
            « Morondava » conclurait qu'elle a disparu du site. */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Renvoi to="/villes" icone={Building2} libelle="Villes et villages" />
        <Renvoi
          to="/sites"
          icone={Trees}
          libelle={
            stats && stats.sites > 0
              ? `Sites et parcs · ${compteur(stats.sites)}`
              : "Sites et parcs"
          }
        />
        <Renvoi to="/quand-partir" icone={Sun} libelle="Quand partir" />
      </div>

      {etat === "erreur" && <EtatErreur className="mt-5" onReessayer={() => void charger()} />}

      {etat === "chargement" && (
        <div
          className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 large:grid-cols-4"
          aria-hidden="true"
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="dk-skeleton h-64 rounded-2xl" />
          ))}
        </div>
      )}

      {etat === "ok" &&
        groupes.map((g, iGroupe) => (
          <SectionFamille
            key={g.kind}
            famille={g}
            visibles={nVisibles(g.kind)}
            surPremierEcran={iGroupe === 0}
            onPlus={() =>
              setVolees((v) => ({ ...v, [g.kind]: nVisibles(g.kind) + PAR_VOLEE }))
            }
          />
        ))}

      {etat === "ok" && liste.length === 0 && (
        <EmptyState
          className="mt-6"
          icone={Compass}
          manque="Aucun lieu emblématique n'est encore référencé."
          action={{ libelle: "Voir les sites et parcs", lien: "/sites" }}
          contenuReel={
            <>
              <p className="dk-secondaire leading-relaxed">
                Le référentiel se remplit fiche par fiche. En attendant, les
                sites et parcs sont consultables région par région, et la carte
                montre tout ce qui a une position.
              </p>
              <Link
                to="/carte"
                className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-semibold"
              >
                <MapPin className="h-4 w-4" aria-hidden="true" />
                Ouvrir la carte
              </Link>
            </>
          }
        />
      )}
    </div>
  );
}

/** Un renvoi vers un écran voisin — une porte, pas un onglet. */
function Renvoi({ to, icone: Icone, libelle }: { to: string; icone: LucideIcon; libelle: string }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-semibold hover:border-primary hover:text-primary"
    >
      <Icone className="h-4 w-4" aria-hidden="true" />
      {libelle}
    </Link>
  );
}

/* ══ UNE FAMILLE DE DESTINATIONS ══════════════════════════════════════════ */

function SectionFamille({
  famille: g,
  visibles,
  surPremierEcran,
  onPlus,
}: {
  famille: Famille;
  visibles: number;
  /** Vrai pour la première famille : sa première photo décide du LCP. */
  surPremierEcran: boolean;
  onPlus: () => void;
}) {
  const cartes = g.cartes.slice(0, visibles);
  const reste = Math.max(0, g.cartes.length - visibles);

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold leading-tight">{g.titre}</h2>
        <span className="dk-secondaire shrink-0 tabular-nums">{lieux(g.cartes.length)}</span>
      </div>
      {g.sousTitre && <p className="dk-secondaire mt-0.5 max-w-[70ch]">{g.sousTitre}</p>}

      <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 large:grid-cols-4">
        {cartes.map((d, i) => (
          <li key={d.slug}>
            <CarteDestination d={d} lcp={surPremierEcran && i === 0} />
          </li>
        ))}
      </ul>

      {reste > 0 && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={onPlus}
            className="min-h-11 rounded-full border border-input px-6 text-sm font-semibold hover:border-primary hover:text-primary"
          >
            {/* ⚠ Le reste est EXACT : les cartes sont déjà là, on n'en promet
                pas une de plus que ce que le clic va montrer. */}
            Voir {reste > PAR_VOLEE ? `${PAR_VOLEE} ${g.titre.toLowerCase()} de plus` : "le reste"} —{" "}
            {pluriel(reste, "restant")}
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * LA CARTE D'UNE DESTINATION — la photo est l'argument, elle prend la place.
 *
 * ⚠ h-44, CONTRE h-32 SUR LES AUTRES ÉCRANS : ici la photo n'illustre pas une
 *   ligne d'annuaire, elle EST le contenu. Et l'aplat reste pour les 22 fiches
 *   sans photo — icône de famille sur couleur de marque, jamais un cadre gris
 *   qui signale un défaut là où il n'y a qu'une donnée non saisie.
 *
 * ⚠ LE CRÉDIT VOYAGE AVEC LA PHOTO (licences Wikimedia Commons : l'auteur doit
 *   rester lisible), et un compteur INCONNU n'affiche rien — `null` n'est pas
 *   zéro, voir `lib/destinations.ts`.
 */
function CarteDestination({ d, lcp }: { d: DestinationEmblematique; lcp: boolean }) {
  const Icone = ICONE_FAMILLE[d.kind] ?? MapPin;
  const metas = [
    d.saisons === true ? "meilleure saison connue" : null,
    d.nb_recits !== null && d.nb_recits > 0 ? pluriel(d.nb_recits, "récit") : null,
    d.nb_etablissements !== null && d.nb_etablissements > 0
      ? pluriel(d.nb_etablissements, "adresse")
      : null,
  ].filter((m): m is string => !!m);

  return (
    <Link
      to={`/lieu/${d.slug}`}
      className="dk-reveal dk-carte group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="dk-zoom relative h-44 w-full bg-secondary">
        {d.cover_url ? (
          <>
            <img
              src={d.cover_url}
              srcSet={jeuDeTailles(d.cover_url) ?? undefined}
              sizes="(min-width: 1920px) 25vw, (min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
              alt=""
              aria-hidden="true"
              loading={lcp ? "eager" : "lazy"}
              fetchPriority={lcp ? "high" : undefined}
              className="h-full w-full object-cover"
            />
            {d.cover_credit && (
              <p className="absolute bottom-1 right-2 text-[10px] text-white/75 drop-shadow">
                {d.cover_credit}
              </p>
            )}
          </>
        ) : (
          <span className="grid h-full w-full place-items-center">
            <Icone className="h-8 w-8 text-primary/35" aria-hidden="true" />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="dk-etiquette">
          {genre(d.kind)}
          {d.region ? ` · ${d.region}` : ""}
        </p>
        <h3 className="mt-0.5 text-[17px] font-bold leading-tight">{d.nom}</h3>
        {/* ⚠ La ville d'appui seulement quand elle apporte quelque chose : «
            près de Nosy Be » sous la carte Nosy Be ne dirait rien. */}
        {d.ville && d.ville !== d.nom && (
          <p className="dk-secondaire mt-0.5">
            <MapPin className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
            près de {d.ville}
          </p>
        )}
        {d.summary && <p className="dk-secondaire mt-1.5 line-clamp-2">{d.summary}</p>}
        {metas.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-3 text-xs text-muted-foreground">
            {metas.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

/* ══ LA FICHE ALLÉGÉE D'UNE DESTINATION — `?lieu=` ════════════════════════ */

const MOIS = [
  "Janv.", "Févr.", "Mars", "Avril", "Mai", "Juin",
  "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc.",
];

const COULEUR_SAISON: Record<string, string> = {
  ideale: "bg-primary text-primary-foreground",
  correcte: "bg-secondary text-primary",
  deconseillee: "bg-muted text-muted-foreground",
};

/**
 * ⚠ CETTE FICHE EST CONSERVÉE TELLE QUELLE. Elle est atteinte par des liens
 *   existants ailleurs dans le site — et par `?q=`, qu'une publication ancienne
 *   utilise encore. La vitrine ne la remplace pas.
 */
function FicheLieu({ slug }: { slug: string }) {
  const [lieu, setLieu] = useState<Lieu | null>(null);
  const [saisons, setSaisons] = useState<
    { month: number; rating: string; reason: string | null }[]
  >([]);
  const [etabs, setEtabs] = useState<ResultatPage[]>([]);
  const [categorie, setCategorie] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  useReveal(etabs);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const l = await chargerLieu(slug);
      setLieu(l);
      if (l) {
        const [s, p] = await Promise.all([
          chargerSaisons(l.id),
          chercherPages({ lieu: l.slug, categorie, limite: 24 }),
        ]);
        setSaisons(s);
        setEtabs(p);
      }
    } catch {
      /* les états vides ci-dessous disent la vérité */
    } finally {
      setChargement(false);
    }
  }, [slug, categorie]);

  useEffect(() => {
    void charger();
  }, [charger]);

  useSEO({
    titre: lieu ? lieu.name_fr : "Destinations de Madagascar",
    description:
      lieu?.summary ??
      "Les destinations de Madagascar, avec leur saisonnalite, leurs acces reels et les adresses qui s'y trouvent.",
    url: "/explorer",
  });

  if (chargement) {
    return (
      <div className="space-y-4 px-4 py-5">
        <div className="dk-skeleton h-40 w-full rounded-2xl" />
        <div className="dk-skeleton h-6 w-1/2" />
        <div className="dk-skeleton h-20 w-full" />
      </div>
    );
  }

  if (!lieu) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Destination inconnue</h1>
        <Link
          to="/explorer"
          className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          Toutes les destinations
        </Link>
      </div>
    );
  }

  const moisCourant = saisons.find((s) => s.month === new Date().getMonth() + 1);

  return (
    <div className="pb-6">
      {/* ── L'ENTÊTE : LA PHOTO QUAND ELLE EXISTE, L'APLAT SINON ──────────
          ⚠ LE VOILE SOMBRE N'EST PAS DÉCORATIF. Le titre est blanc ; sur une
            photo de plage surexposée il devient illisible sans lui. */}
      <div className="relative flex h-40 items-center justify-center overflow-hidden bg-primary md:h-56 md:rounded-2xl">
        {lieu.cover_url && (
          <>
            <img
              src={lieu.cover_url}
              srcSet={jeuDeTailles(lieu.cover_url) ?? undefined}
              sizes="(min-width: 768px) 900px, 100vw"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover"
              loading="eager"
              /* La photo de l'entête est le plus gros élément de l'écran :
                 c'est elle qui décide du LCP. */
              fetchPriority="high"
            />
            <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
          </>
        )}
        <div className="relative px-6 text-center">
          <h1 className="text-2xl font-semibold text-primary-foreground drop-shadow md:text-3xl">{lieu.name_fr}</h1>
          {lieu.region && <p className="mt-1 text-sm text-primary-foreground/85 drop-shadow">{lieu.region}</p>}
        </div>
        {lieu.cover_credit && (
          /* Le crédit voyage AVEC la photo — il ne se met pas dans un pied
             de page global, où il se perd au premier remaniement. */
          <p className="absolute bottom-1 right-2 text-[10px] text-white/70">
            {lieu.cover_credit}
          </p>
        )}
      </div>

      <div className="px-4">
        <Link
          to="/explorer"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Toutes les destinations
        </Link>

        {lieu.summary && <p className="mt-3 text-[15px] leading-relaxed">{lieu.summary}</p>}

        {lieu.why_go && lieu.why_go.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {lieu.why_go.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="text-primary" aria-hidden="true">
                  •
                </span>
                {r}
              </li>
            ))}
          </ul>
        )}

        {/* « Quand y aller » est la première question d'un voyageur étranger.
            On ne l'affiche que là où la réponse est renseignée et sûre —
            baleines, cyclones, fermeture des Tsingy. Ailleurs, silence
            plutôt qu'à-peu-près. */}
        {saisons.length > 0 && (
          <section className="mt-6">
            <h2 className="text-lg font-semibold">Quand y aller</h2>
            <div className="mt-2 grid grid-cols-6 gap-1.5 sm:grid-cols-12">
              {saisons.map((s) => (
                <div
                  key={s.month}
                  className={cn(
                    "rounded-lg py-1.5 text-center text-[11px] font-medium",
                    COULEUR_SAISON[s.rating] ?? "bg-muted"
                  )}
                  title={s.reason ?? undefined}
                >
                  {MOIS[s.month - 1]}
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
                idéale
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-secondary" aria-hidden="true" />
                correcte
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-muted" aria-hidden="true" />
                déconseillée
              </span>
            </div>
            {moisCourant?.reason && (
              <p className="mt-2 text-sm text-muted-foreground">
                Ce mois-ci : {moisCourant.reason}.
              </p>
            )}
          </section>
        )}

        <section className="mt-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Où dormir et où manger</h2>
            <div className="flex flex-wrap gap-1.5">
              {["hotel", "restaurant", "agence_voyage"].map((c) => (
                <button
                  key={c}
                  onClick={() => setCategorie(categorie === c ? null : c)}
                  aria-pressed={categorie === c}
                  className={cn(
                    "min-h-8 rounded-full border px-2.5 text-xs transition",
                    categorie === c
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {CATEGORIES.find((x) => x.code === c)?.label}
                </button>
              ))}
            </div>
          </div>

          {etabs.length > 0 ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 large:grid-cols-4">
              {etabs.map((e) => (
                <FicheCard key={e.id} fiche={e} />
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-dashed border-border px-5 py-10 text-center">
              <p className="font-medium">Aucun établissement référencé ici</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Les hôtels, restaurants et agences apparaîtront au fur et à
                mesure qu'ils créeront leur page.
              </p>
              <Link
                to="/pro"
                className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
              >
                Inscrire mon établissement
              </Link>
            </div>
          )}
        </section>

        {lieu.nb_posts > 0 && (
          <p className="mt-6 text-sm">
            <Link
              to={`/recherche?q=${encodeURIComponent(lieu.name_fr)}`}
              className="font-medium text-primary underline underline-offset-4"
            >
              Lire les {lieu.nb_posts} récit{lieu.nb_posts > 1 ? "s" : ""} publié
              {lieu.nb_posts > 1 ? "s" : ""} sur {lieu.name_fr}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
