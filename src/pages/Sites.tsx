import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Map as MapIcon,
  MapPin,
  Mountain,
  PenLine,
  Search,
  SlidersHorizontal,
  Trees,
} from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { useRetour } from "@/hooks/useRetour";
import { useMediaQuery } from "@/hooks/use-mobile";
import { EmptyState, EtatErreur, Squelettes } from "@/components/Etats";
import { ImageProgressive } from "@/components/ImageProgressive";
import { ariary } from "@/lib/etablissements";
import { compterSites } from "@/lib/decouverte";
import { cn } from "@/lib/utils";
import {
  chargerRegionsSites,
  chargerSitesDeLaRegion,
  FILTRE_GUIDE_INERTE,
  grandeRegionDeRegion,
  grouperParGrandeRegion,
  libelleType,
  libelleTypeCourt,
  LIBELLE_TYPE_COURT,
  lienGroupe,
  lienRegion,
  nombre,
  normaliser,
  PAR_PAGE,
  pluriel,
  RACCOURCIS,
  type FacetteType,
  type FacetteVille,
  type PageRegionSites,
  type RegionSites,
  type SiteLigne,
} from "@/lib/sites";

/**
 * SITES ET PARCS — /sites, en DEUX NIVEAUX.
 *
 * 🔴 CE QUE ÇA REMPLACE, ET CE QUE ÇA CORRIGE.
 *    L'écran déversait 2 476 fiches dans une grille de vignettes 4/3. Or 226
 *    fiches sur 2 476 portent une photo : la grille produisait 2 250 cadres
 *    gris, un par site, chacun haut comme un tiers d'écran de téléphone. Un
 *    visiteur descendait quatre écrans pour lire six noms. « Une grille de
 *    vignettes sans photo ne sert à rien » : on entre désormais par la RÉGION,
 *    la bande d'illustration est COURTE, et la place va au texte utile — villes,
 *    types dominants, ce qui est réellement documenté.
 *
 * 🔴 ET SURTOUT, L'ÉCRAN NE FAIT PLUS SEMBLANT D'AVOIR DES DONNÉES.
 *    0 fiche sur 2 476 porte un tarif résident, 0 un fady, 0 un mois conseillé.
 *    L'ancienne fiche affichait douze cases grises pour les mois — ce qui se lit
 *    comme « déconseillé toute l'année », soit exactement l'inverse de « on ne
 *    sait pas ». Chaque ligne dit maintenant, en toutes lettres, « aucun mois
 *    renseigné », « aucun fady noté », « aucun tarif renseigné ».
 *
 * ⚠ AUCUN CHIFFRE N'EST ÉCRIT EN DUR. Tous les compteurs de cet écran viennent
 *   du serveur à chaque visite. Les proportions citées dans ces commentaires
 *   sont des mesures du 16/08/2026, elles justifient la FORME — elles ne
 *   remplissent jamais l'écran.
 */

/** ⚠ Une constante, pas un `[]` littéral : une nouvelle référence à chaque rendu
 *  relancerait `useReveal` et les `useMemo` en boucle. */
const AUCUNE_REGION: RegionSites[] = [];

/* ══ LE ROUTEUR DES DEUX NIVEAUX ══════════════════════════════════════════ */

export default function Sites() {
  const [params] = useSearchParams();
  const region = params.get("region");

  /**
   * 🔴 LA `key` N'EST PAS DÉCORATIVE. Sans elle, passer de `?region=diana` à
   *    `?region=sava` ne remonte pas le composant : React garde l'état, et la
   *    page affiche le NOM et les FACETTES de la Diana au-dessus des sites de la
   *    Sava pendant toute la requête. Deux régions mélangées à l'écran, sans
   *    aucune erreur pour le dire.
   */
  return region ? <NiveauRegion key={region} slug={region} /> : <NiveauRegions />;
}

/* ══ ① LES 23 RÉGIONS ═════════════════════════════════════════════════════ */

type Tri = "grandes-regions" | "documentation" | "sites" | "nom";

const TRIS: { cle: Tri; libelle: string }[] = [
  { cle: "grandes-regions", libelle: "Par grande région" },
  { cle: "documentation", libelle: "Les mieux documentées" },
  { cle: "sites", libelle: "Le plus de sites" },
  { cle: "nom", libelle: "A → Z" },
];

function NiveauRegions() {
  const [params, setParams] = useSearchParams();
  const groupeActif = params.get("groupe") ?? "";
  const typeArme = params.get("type") ?? "";
  const q = params.get("q") ?? "";
  const tri = (TRIS.find((t) => t.cle === params.get("tri"))?.cle ?? "grandes-regions") as Tri;

  const [regions, setRegions] = useState<RegionSites[] | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "erreur">("chargement");
  const [comptes, setComptes] = useState<{ total: number; parGenre: Record<string, number> } | null>(
    null
  );

  const charger = useCallback(async () => {
    setEtat("chargement");
    try {
      setRegions(await chargerRegionsSites());
      setEtat("ok");
    } catch {
      setEtat("erreur");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  /**
   * ⚠ LE COMPTE PAR TYPE VIENT DE `compter_sites`, PAS D'UNE SOMME DES CARTES.
   *   `sites_par_region` ne rend que les TROIS types dominants de chaque région :
   *   les additionner donnerait « 4 cascades » au lieu de 20, parce qu'une
   *   cascade n'est jamais dans le trio de tête d'une région. Un compteur faux
   *   par construction est pire qu'un compteur absent — d'où l'appel séparé,
   *   déjà écrit et déjà branché sur la vraie fonction du dépôt.
   * ⚠ Son échec n'empêche pas l'écran : les raccourcis disparaissent, les
   *   régions restent. Une panne de compteur ne doit pas coûter l'annuaire.
   */
  useEffect(() => {
    compterSites()
      .then(setComptes)
      .catch(() => setComptes(null));
  }, []);

  const liste = regions ?? AUCUNE_REGION;

  /**
   * ⚠ LE PANNEAU « CE QUI EST DOCUMENTÉ » SE CALCULE SUR LA LISTE ENTIÈRE, jamais
   *   sur la liste filtrée. Sinon il changerait au fil de la frappe dans la
   *   recherche et cesserait de dire ce que LA BASE contient — ce qu'il est le
   *   seul élément de l'écran à dire.
   */
  const bilan = useMemo(() => {
    const sites = liste.reduce((s, r) => s + r.nb_sites, 0);
    const photo = liste.reduce((s, r) => s + r.nb_avec_photo, 0);
    const description = liste.reduce((s, r) => s + r.nb_avec_description, 0);
    // ⚠ La tuile « tarif » n'existe que si le serveur rend le compte. Voir
    //   `RegionSites.nb_avec_tarif` : hors contrat, donc facultatif, jamais
    //   déduit d'un échantillon.
    const avecTarif = liste.filter((r) => r.nb_avec_tarif !== null);
    const tarif =
      avecTarif.length > 0 ? avecTarif.reduce((s, r) => s + (r.nb_avec_tarif ?? 0), 0) : null;
    return { sites, photo, description, tarif };
  }, [liste]);

  /**
   * 🔴 CE QUE LE TOTAL DES CARTES NE DIT PAS. 2 465 sites sur 2 476 sont
   *    rattachés à un lieu : onze n'ont pas de région et ne sont donc atteignables
   *    par AUCUN chemin de cet écran. Annoncer « 2 476 sites » au-dessus de
   *    cartes qui n'en additionnent que 2 465 fait mentir l'un des deux chiffres.
   *    On dit les deux, et l'écart se calcule — il tombe tout seul le jour où les
   *    onze fiches sont rattachées.
   */
  const totalRecense = comptes?.total ?? null;
  const orphelins =
    totalRecense !== null && liste.length > 0 ? Math.max(0, totalRecense - bilan.sites) : 0;

  /** Ce que la recherche compare : le nom, la grande région, les villes et les
   *  types AFFICHÉS sur la carte. On ne cherche que dans ce qui est visible —
   *  une correspondance invisible se lit comme un bogue. */
  const filtrees = useMemo(() => {
    let l = liste;

    if (groupeActif)
      l = l.filter((r) => grandeRegionDeRegion(r.nom, r.grande_region)?.code === groupeActif);

    const cle = normaliser(q);
    if (cle)
      l = l.filter((r) => {
        const g = grandeRegionDeRegion(r.nom, r.grande_region);
        const foin = [r.nom, g?.libelle ?? "", ...r.villes, ...r.types.map((t) => libelleType(t.code))];
        return foin.some((x) => normaliser(x).includes(cle));
      });

    // ⚠ ON NE RETRIE PAS PAR DÉFAUT. Le contrat garantit déjà « les mieux
    //   documentées d'abord » ; recalculer cet ordre ici avec une autre formule
    //   ferait diverger l'écran de la base. Les autres tris sont explicites.
    if (tri === "sites") l = [...l].sort((a, b) => b.nb_sites - a.nb_sites || a.nom.localeCompare(b.nom, "fr"));
    if (tri === "nom") l = [...l].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

    // 🔴 UNE COPIE, TOUJOURS — ET C'EST `useReveal` QUI L'EXIGE. Sans filtre ni
    //    tri explicite, `l` est encore la référence de `liste` : le `useMemo`
    //    rend le MÊME tableau, l'effet de révélation ne se relance pas, et les
    //    cartes que React vient de remonter restent à `opacity: 0`. La page
    //    paraît VIDE alors que les données sont là — le piège exact déjà payé
    //    sur neuf écrans de ce dépôt.
    return l === liste ? [...l] : l;
  }, [liste, groupeActif, q, tri]);

  /**
   * ⚠ GROUPER OU CLASSER, PAS LES DEUX. Un classement « les mieux documentées »
   *   réparti dans cinq sections n'est plus un classement : la 1ʳᵉ du Nord se lit
   *   avant la 1ʳᵉ des Hauts Plateaux qui a pourtant trois fois plus de fiches.
   *   Le tri par grande région groupe ; les trois autres mettent à plat, et
   *   chaque carte porte alors sa grande région en étiquette.
   */
  const groupes = useMemo(
    () => (tri === "grandes-regions" ? grouperParGrandeRegion(filtrees) : []),
    [filtrees, tri]
  );

  /** ⚠ Les pastilles comptent sur la liste ENTIÈRE, pas sur la liste filtrée :
   *  une pastille dont le compte tombe à zéro parce qu'on a tapé trois lettres
   *  dans la recherche ne serait plus un repère, mais un écho de la frappe. */
  const groupesTous = useMemo(() => grouperParGrandeRegion(liste), [liste]);

  // 🔴 `useReveal` REÇOIT LE TABLEAU, JAMAIS SA LONGUEUR. Filtrer 23 cartes et en
  //    obtenir 23 autres ne change pas la longueur : l'effet ne se relancerait
  //    pas, React aurait créé de NOUVEAUX nœuds sans `data-vu`, et `.dk-reveal`
  //    part à `opacity: 0` — la page paraîtrait VIDE, sans la moindre erreur.
  useReveal(filtrees);

  const poser = useCallback(
    (cle: string, valeur: string) => {
      const p = new URLSearchParams(params);
      if (valeur) p.set(cle, valeur);
      else p.delete(cle);
      // ⚠ `replace` : une frappe dans la recherche ne doit pas empiler vingt
      //   entrées d'historique, sinon « retour » ne ramène nulle part.
      setParams(p, { replace: true });
    },
    [params, setParams]
  );

  useSEO({
    titre: totalRecense
      ? `Sites et parcs de Madagascar — ${nombre(totalRecense)} lieux, région par région`
      : "Sites et parcs de Madagascar",
    description:
      "Les parcs nationaux, réserves, plages, cascades et sites de Madagascar, rangés par région : ce qui est documenté, ce qui ne l'est pas encore, et la ville la plus proche de chacun.",
    url: "/sites",
  });

  return (
    <div className="px-4 py-5">
      <p className="dk-etiquette">Nature et patrimoine</p>
      <div className="mt-1 flex items-center gap-2">
        <Trees className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
        <h1 className="dk-titre">Sites et parcs</h1>
      </div>
      <p className="dk-corps mt-2 max-w-[70ch] text-muted-foreground">
        {totalRecense !== null
          ? `${pluriel(totalRecense, "site")} recensés à Madagascar : parcs nationaux, réserves, sommets, plages, cascades et patrimoine.`
          : "Les parcs nationaux, les réserves et les sites à visiter de Madagascar."}{" "}
        Ouvrez une région : c'est à cette échelle que la liste devient lisible.
      </p>

      {/* ── CHERCHER UNE RÉGION ──────────────────────────────────────────
          ⚠ CETTE RECHERCHE NE CHERCHE PAS LES SITES, ET LE DIT. Le contrat ne
            fournit aucune recherche plein texte : `sites_de_la_region` n'a pas
            d'argument de mot-clé. Une boîte « Tsingy, Isalo… » branchée sur rien
            aurait été le pire des mensonges — on annonce donc ce qu'elle filtre,
            avec des exemples qui existent vraiment dans la liste ci-dessous. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Chercher une région, une grande région ou une ville</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => poser("q", e.target.value)}
            placeholder="Diana, Menabe, Hauts Plateaux…"
            className="min-h-11 w-full rounded-full border border-input bg-card pl-9 pr-4 text-sm outline-none focus-visible:border-primary"
          />
        </label>

        <label className="flex items-center gap-2">
          <span className="sr-only">Trier les régions</span>
          <select
            value={tri}
            onChange={(e) => poser("tri", e.target.value === "grandes-regions" ? "" : e.target.value)}
            className="min-h-11 rounded-full border border-input bg-card px-4 text-sm font-medium outline-none focus-visible:border-primary"
          >
            {TRIS.map((t) => (
              <option key={t.cle} value={t.cle}>
                {t.libelle}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* 🔴 SANS CETTE LIGNE, LA RECHERCHE MENT PAR OMISSION. Quelqu'un qui tape
          « Isalo » lit « Aucune région ne correspond » et en conclut que Diako
          n'a pas l'Isalo — alors que la fiche existe, dans l'Ihorombe. Le contrat
          ne fournit aucune recherche par nom de site (`sites_de_la_region` n'a
          pas d'argument de mot-clé) : on dit donc ce que la boîte fait, à
          l'endroit où on s'apprête à taper. */}
      <p className="dk-secondaire mt-1.5">
        Cette recherche filtre les régions et les villes ci-dessous — pas les noms de sites.
      </p>

      {/* ── LES RACCOURCIS PAR TYPE ──────────────────────────────────────── */}
      {comptes && (
        <section className="mt-4" aria-labelledby="titre-raccourcis">
          <h2 id="titre-raccourcis" className="dk-etiquette">
            Ce qu'on cherche le plus
          </h2>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {RACCOURCIS.filter((code) => (comptes.parGenre[code] ?? 0) > 0).map((code) => (
              <li key={code}>
                <Pastille
                  actif={typeArme === code}
                  onClick={() => poser("type", typeArme === code ? "" : code)}
                >
                  {libelleType(code)} · {nombre(comptes.parGenre[code])}
                </Pastille>
              </li>
            ))}
          </ul>
          {/* ⚠ UN RACCOURCI N'OUVRE PAS DE LISTE NATIONALE : elle n'existe pas au
              contrat. Il ARME le filtre, que chaque carte de région emporte. On
              écrit donc ce qui va se passer, plutôt que de le laisser deviner. */}
          {typeArme && (
            <p className="dk-secondaire mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                Filtre armé sur «&nbsp;{libelleType(typeArme)}&nbsp;» : ouvrez une région, il
                la suivra.
              </span>
              <button
                onClick={() => poser("type", "")}
                className="font-semibold text-primary underline underline-offset-4"
              >
                Retirer
              </button>
            </p>
          )}
        </section>
      )}

      {/* ── CE QUI EST DOCUMENTÉ ─────────────────────────────────────────── */}
      {etat === "ok" && liste.length > 0 && (
        <section className="mt-5 rounded-2xl border border-border bg-card p-4">
          <h2 className="dk-etiquette">Ce qui est documenté</h2>
          {/* ⚠ LES QUATRE TUILES PARTAGENT LE MÊME DÉNOMINATEUR — les sites rangés
              par région. Mélanger le total national (qui compte les fiches sans
              lieu) et des parts calculées sur les fiches rattachées donnerait
              quatre nombres qui ne s'additionnent pas entre eux. L'écart, lui,
              est dit en toutes lettres juste en dessous. */}
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Compteur t="Sites rangés par région" n={bilan.sites} />
            <Compteur t="Avec une photo" n={bilan.photo} sur={bilan.sites} />
            <Compteur t="Avec une description" n={bilan.description} sur={bilan.sites} />
            {bilan.tarif !== null && (
              <Compteur t="Avec un tarif d'entrée" n={bilan.tarif} sur={bilan.sites} />
            )}
          </dl>
          {/* ⚠ ON N'ENJOLIVE PAS. Ces proportions sont basses, et c'est
              précisément ce qui justifie d'entrer par la région plutôt que par
              une grille d'images : à l'échelle d'une région, ce qui manque se
              voit et se complète. Les arrondir vers le haut, ou les taire,
              enlèverait à l'écran sa seule raison d'être. */}
          <p className="dk-secondaire mt-3 max-w-[70ch] leading-relaxed">
            L'essentiel de cet annuaire vient d'imports ouverts : un nom, un type et une
            position, rarement plus. C'est pour cela qu'on entre par la région — à cette
            échelle, ce qui manque se voit, et se complète fiche par fiche.
            {orphelins > 0 && (
              <>
                {" "}
                {pluriel(orphelins, "site n'est", "sites ne sont")} rattaché
                {orphelins > 1 ? "s" : ""} à aucune région : {orphelins > 1 ? "ils" : "il"}{" "}
                {orphelins > 1 ? "n'apparaissent" : "n'apparaît"} donc pas ci-dessous.
              </>
            )}
          </p>
        </section>
      )}

      {/* ── LE FILTRE PAR GRANDE RÉGION ──────────────────────────────────── */}
      {etat === "ok" && liste.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-1.5">
          <Pastille actif={!groupeActif} onClick={() => poser("groupe", "")}>
            Tout Madagascar
          </Pastille>
          {groupesTous.map((g) => (
            <Pastille
              key={g.code}
              actif={groupeActif === g.code}
              onClick={() => poser("groupe", groupeActif === g.code ? "" : g.code)}
            >
              {g.titre} · {nombre(g.regions.reduce((s, r) => s + r.nb_sites, 0))}
            </Pastille>
          ))}
        </div>
      )}

      {etat === "erreur" && <EtatErreur className="mt-5" onReessayer={() => void charger()} />}
      {etat === "chargement" && <Squelettes className="mt-5" nombre={4} hauteur="h-44" />}

      {/* ── LES CARTES ───────────────────────────────────────────────────── */}
      {etat === "ok" && tri === "grandes-regions" &&
        groupes.map((g) => (
          <section key={g.code} className="mt-7">
            <h2 className="dk-etiquette">{g.titre}</h2>
            <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 large:grid-cols-4">
              {g.regions.map((r) => (
                <li key={r.slug}>
                  <CarteRegion region={r} typeArme={typeArme} />
                </li>
              ))}
            </ul>
          </section>
        ))}

      {etat === "ok" && tri !== "grandes-regions" && filtrees.length > 0 && (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 large:grid-cols-4">
          {filtrees.map((r) => (
            <li key={r.slug}>
              <CarteRegion region={r} typeArme={typeArme} montrerGrandeRegion />
            </li>
          ))}
        </ul>
      )}

      {/* Une recherche sans résultat n'est pas un annuaire vide. */}
      {etat === "ok" && liste.length > 0 && filtrees.length === 0 && (
        <div className="mt-8 text-center">
          <p className="font-semibold">Aucune région ne correspond.</p>
          <p className="dk-secondaire mx-auto mt-1 max-w-sm">
            {q ? `Rien pour « ${q} »` : "Rien dans cette grande région"} — la recherche porte
            sur les noms de région, de grande région et sur les villes affichées.
          </p>
          <button
            onClick={() => {
              const p = new URLSearchParams(params);
              p.delete("q");
              p.delete("groupe");
              setParams(p, { replace: true });
            }}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
          >
            {/* ⚠ Le nombre est COMPTÉ, pas su par cœur : `sites_par_region` ne
                rend que les régions qui portent au moins un site. Écrire « 23 »
                promettrait une carte de plus que ce que le bouton va montrer. */}
            Voir les {nombre(liste.length)} régions
          </button>
        </div>
      )}

      {/* ⚠ CET ÉTAT VIDE EST CELUI DE LA BASE, pas celui d'une recherche : il ne
          se teste donc PAS sur les filtres. Les tester ferait qu'une base vide
          plus un mot dans la recherche n'afficherait ni l'un ni l'autre bloc —
          un écran entièrement blanc, le seul cas que la maquette interdit. */}
      {etat === "ok" && liste.length === 0 && (
        <EmptyState
          className="mt-6"
          icone={Trees}
          manque="Aucune région n'a encore de site rattaché."
          action={{ libelle: "Explorer les destinations", lien: "/explorer" }}
          contenuReel={
            <>
              <p className="dk-secondaire leading-relaxed">
                Les sites se rattachent à leur région par leur lieu. En attendant, le
                référentiel des destinations porte déjà sa saisonnalité et ses accès, et la
                carte montre tout ce qui a une position.
              </p>
              <Link
                to="/carte"
                className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-semibold"
              >
                <MapIcon className="h-4 w-4" aria-hidden="true" />
                Ouvrir la carte
              </Link>
            </>
          }
        />
      )}
    </div>
  );
}

/**
 * LA CARTE D'UNE RÉGION.
 *
 * 🔴 LA BANDE D'ILLUSTRATION FAIT 80 PX, PAS 160. Répétée vingt-trois fois, une
 *    vignette 4/3 remplissait deux écrans de téléphone avant la première
 *    information utile — et sur un fonds où 9 % des fiches ont une photo, la
 *    plupart de ces vignettes étaient des aplats. La bande reste (une carte
 *    haute et une carte courte côte à côte se lisent comme un défaut
 *    d'affichage), mais elle est COURTE : la place va aux villes, aux types
 *    dominants et à ce qui est documenté.
 *
 * ⚠ LE CRÉDIT PHOTO VOYAGE AVEC LA PHOTO. Les images viennent de Wikimedia
 *   Commons et d'archives : la plupart des licences exigent de nommer l'auteur.
 */
function CarteRegion({
  region: r,
  typeArme,
  montrerGrandeRegion = false,
}: {
  region: RegionSites;
  typeArme: string;
  montrerGrandeRegion?: boolean;
}) {
  const grande = grandeRegionDeRegion(r.nom, r.grande_region);

  return (
    <Link
      to={lienRegion(r.slug, typeArme || null)}
      className="dk-reveal dk-carte group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="dk-zoom relative h-20 w-full shrink-0 bg-secondary">
        {r.cover_url ? (
          <>
            <ImageProgressive
              src={r.cover_url}
              alt=""
              ajustement="cover"
              largeurAffichee="(min-width:1920px) 22vw, (min-width:1280px) 25vw, (min-width:640px) 45vw, 92vw"
            />
            {r.cover_credit && (
              <span className="absolute bottom-0 right-0 bg-black/55 px-1.5 py-0.5 text-[10px] leading-tight text-white">
                {r.cover_credit}
              </span>
            )}
          </>
        ) : (
          <span className="grid h-full w-full place-items-center">
            <Mountain className="h-6 w-6 text-primary/40" aria-hidden="true" />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="min-w-0 truncate text-[16px] font-bold leading-tight">{r.nom}</h3>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
            {nombre(r.nb_sites)}
          </span>
        </div>
        <p className="dk-etiquette mt-0.5">
          {montrerGrandeRegion && grande ? `${grande.libelle} · ` : ""}
          {pluriel(r.nb_sites, "site")}
        </p>

        {r.villes.length > 0 && (
          <p className="dk-secondaire mt-2 line-clamp-2">
            <MapPin className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
            {r.villes.join(" · ")}
          </p>
        )}

        {r.types.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1">
            {r.types.map((t) => (
              <li
                key={t.code}
                className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium"
              >
                {libelleTypeCourt(t.code)} · {nombre(t.n)}
              </li>
            ))}
          </ul>
        )}

        {/* ⚠ CE QUI MANQUE EST DIT SUR LA CARTE, pas seulement dans le panneau du
            haut : c'est ce qui permet de choisir une région à compléter. */}
        <p className="dk-secondaire mt-auto pt-2.5 tabular-nums">
          {nombre(r.nb_avec_photo)} photo{r.nb_avec_photo > 1 ? "s" : ""} ·{" "}
          {nombre(r.nb_avec_description)} description{r.nb_avec_description > 1 ? "s" : ""}
        </p>
      </div>
    </Link>
  );
}

/* ══ ② LES SITES D'UNE RÉGION ═════════════════════════════════════════════ */

function NiveauRegion({ slug }: { slug: string }) {
  const [params, setParams] = useSearchParams();
  const retour = useRetour("/sites");
  /** ⚠ LE SEUIL EST CELUI DU GABARIT, pas les 768 px de `useEstMobile`. La
   *  colonne de filtres n'existe qu'à partir de `xl` (1280 px) : caler le
   *  repliement sur 768 laisserait, entre 768 et 1280, un panneau déplié en
   *  pleine largeur au-dessus de la liste, sans le bouton pour le refermer. */
  const etroit = !useMediaQuery("(min-width: 1280px)");

  /**
   * ⚠ LES FILTRES VIVENT DANS L'URL — c'est ce qui rend
   *   « /sites?region=diana&type=cascade&ville=… » partageable et indexable, et
   *   le partage est le canal d'acquisition n°1 de ce produit. Un filtre gardé
   *   dans un état React produirait un lien qui ne montre pas ce que
   *   l'expéditeur voyait.
   *
   * 🔴 LA CLÉ EST UNE CHAÎNE, PAS LE TABLEAU. `params.get("type").split(",")`
   *    rend un TABLEAU NEUF à chaque rendu : mis en dépendance d'un `useCallback`
   *    ou d'un `useEffect`, il relance la requête à l'infini — la région se
   *    recharge en boucle et l'écran clignote sans jamais se poser.
   */
  const cleTypes = params.get("type") ?? "";
  const ville = params.get("ville") ?? "";
  const sansGuide = params.get("guide") === "sans";
  const types = useMemo(() => cleTypes.split(",").filter(Boolean), [cleTypes]);

  const [page, setPage] = useState<PageRegionSites | null>(null);
  const [elements, setElements] = useState<SiteLigne[]>([]);
  const [curseur, setCurseur] = useState<string | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "absente" | "erreur">("chargement");
  const [encore, setEncore] = useState(false);
  const [erreurSuite, setErreurSuite] = useState(false);
  const [filtresOuverts, setFiltresOuverts] = useState(false);

  /** ⚠ GARDE-FOU DE CONCURRENCE. Cocher « Cascades » puis « Grottes » sur une 3G
   *  à 800 ms lance deux requêtes sans garantie d'ordre d'arrivée : la liste
   *  pouvait rendre le filtre PRÉCÉDENT, sous des cases à cocher justes. Le pire
   *  des cas, parce que l'écran a l'air cohérent. On numérote, on ne garde que
   *  la dernière. */
  const version = useRef(0);

  const charger = useCallback(
    async (apres: string | null) => {
      const mien = ++version.current;
      if (apres) {
        setEncore(true);
        setErreurSuite(false);
      } else {
        setEtat("chargement");
      }
      try {
        const p = await chargerSitesDeLaRegion(slug, {
          types: cleTypes ? cleTypes.split(",").filter(Boolean) : undefined,
          ville: ville || null,
          sansGuide,
          curseur: apres,
          limite: PAR_PAGE,
        });
        if (mien !== version.current) return;

        if (!p) {
          setEtat("absente");
          return;
        }

        // ⚠ Les facettes ne sont posées qu'au PREMIER appel d'une combinaison :
        //   les remplacer pendant un « voir plus » ferait sauter le panneau de
        //   gauche sous le doigt de qui vient de cliquer.
        if (!apres) setPage(p);

        setElements((avant) => {
          if (!apres) return p.elements;
          // ⚠ Dédoublonnage par slug : une fiche publiée entre deux pages
          //   décalerait la fenêtre du curseur et ferait apparaître un doublon.
          const vus = new Set(avant.map((x) => x.slug));
          return [...avant, ...p.elements.filter((x) => !vus.has(x.slug))];
        });

        // 🔴 UN CURSEUR QUI N'AVANCE PAS ARRÊTE LA PAGINATION. Si le serveur
        //    renvoyait deux fois la même valeur, « voir plus » redemanderait la
        //    même page indéfiniment : bouton qui tourne, liste qui ne bouge
        //    plus, et une requête par clic. On s'arrête plutôt que de boucler.
        setCurseur(p.curseur && p.curseur !== apres && p.elements.length > 0 ? p.curseur : null);
        setEtat("ok");
      } catch {
        if (mien !== version.current) return;
        // ⚠ UN ÉCHEC DE « VOIR PLUS » NE JETTE PAS LA LISTE DÉJÀ LUE. On signale
        //   sous la liste et on propose de reprendre là où on s'est arrêté.
        if (apres) setErreurSuite(true);
        else setEtat("erreur");
      } finally {
        if (mien === version.current) setEncore(false);
      }
    },
    [slug, cleTypes, ville, sansGuide]
  );

  useEffect(() => {
    setElements([]);
    setCurseur(null);
    // 🔴 CES DEUX REMISES À ZÉRO MANQUAIENT, ET LA PAGINATION SE BLOQUAIT. Une
    //    erreur sur « voir plus » posait `erreurSuite`, et changer de filtre ne
    //    l'effaçait pas : la nouvelle liste s'affichait avec un message d'échec
    //    qui ne la concernait pas, et le bouton restait désactivé. Même chose
    //    pour `encore` si la requête précédente n'avait pas rendu la main.
    setErreurSuite(false);
    setEncore(false);
    void charger(null);
  }, [charger]);

  // 🔴 LE TABLEAU, JAMAIS SA LONGUEUR — voir le commentaire du niveau 1 : vingt-
  //    quatre lignes qui en remplacent vingt-quatre ne changent pas la longueur,
  //    l'effet ne se relance pas, et la liste reste à `opacity: 0`.
  useReveal(elements);

  /**
   * ⚠ `replace`, PAS `push`. Chaque case cochée empilerait sinon une entrée
   *   d'historique : après avoir essayé trois types et une ville, il faudrait
   *   appuyer cinq fois sur « Retour » pour revenir aux régions. « Retour »
   *   remonte d'un cran de NAVIGATION — région › liste des régions —, il ne
   *   défait pas un filtre. L'adresse reste juste et partageable dans les deux
   *   cas, ce qui est le point.
   */
  const poser = useCallback(
    (maj: Record<string, string>) => {
      const p = new URLSearchParams(params);
      for (const [cle, valeur] of Object.entries(maj)) {
        if (valeur) p.set(cle, valeur);
        else p.delete(cle);
      }
      setParams(p, { replace: true });
    },
    [params, setParams]
  );

  const basculerType = useCallback(
    (code: string) => {
      const suite = types.includes(code) ? types.filter((t) => t !== code) : [...types, code];
      poser({ type: suite.join(",") });
    },
    [poser, types]
  );

  const nom = page?.region.nom ?? "";
  const grande = page ? grandeRegionDeRegion(page.region.nom, page.region.grande_region) : null;

  /**
   * Les libellés de famille tels que le SERVEUR les nomme — il fait autorité, et
   * `dk_libelle_type` rend déjà le code brut plutôt que `null` pour un type
   * inconnu. Ils servent la colonne de filtres et le résumé de l'état vide,
   * c'est-à-dire partout où l'on désigne un ENSEMBLE de sites.
   * ⚠ Les lignes, elles, prennent la forme courte : voir `LIBELLE_TYPE_COURT`.
   */
  const libelles = useMemo(() => {
    const m = new Map<string, string>();
    page?.facettes.types.forEach((t) => m.set(t.code, t.libelle));
    return m;
  }, [page]);

  useSEO({
    titre: nom ? `Sites et parcs de la région ${nom}` : "Sites et parcs",
    description: page
      ? `${pluriel(page.region.nb_sites, "site")} recensés dans la région ${nom} : parcs, plages, cascades et patrimoine, avec la ville la plus proche et ce qui est réellement documenté.`
      : undefined,
    url: lienRegion(slug),
  });

  if (etat === "absente")
    return (
      <div className="px-4 py-16 text-center">
        <h1 className="dk-titre">Région inconnue</h1>
        <p className="dk-corps mx-auto mt-2 max-w-sm text-muted-foreground">
          «&nbsp;{slug}&nbsp;» ne correspond à aucune des 23 régions. Le lien est peut-être
          tronqué.
        </p>
        <Link
          to="/sites"
          className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          Toutes les régions
        </Link>
      </div>
    );

  const nbFiltres = types.length + (ville ? 1 : 0) + (sansGuide ? 1 : 0);
  const panneauOuvert = !etroit || filtresOuverts;

  return (
    <div className="px-4 py-5">
      <Ariane
        crans={[
          { nom: "Sites et parcs", to: "/sites" },
          ...(grande ? [{ nom: grande.libelle, to: lienGroupe(grande.code) }] : []),
          { nom: nom || "Région" },
        ]}
      />

      <div className="mt-2 flex items-start gap-2">
        <button
          onClick={retour}
          aria-label="Revenir à l'écran précédent"
          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-input hover:border-primary hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <h1 className="dk-titre">{nom || "Région"}</h1>
          {page && (
            <p className="dk-corps mt-1 max-w-[70ch] text-muted-foreground">
              {pluriel(page.region.nb_sites, "site")} recensés dans la région
              {grande ? ` (${grande.libelle})` : ""}. Chaque ligne dit ce qu'on sait —&nbsp;et
              ce qu'on ne sait pas encore.
            </p>
          )}
        </div>
      </div>

      {etat === "erreur" && (
        <EtatErreur
          className="mt-5"
          titre="La région n'a pas pu être chargée"
          onReessayer={() => void charger(null)}
        />
      )}

      {etat === "chargement" && !page && <Squelettes className="mt-5" nombre={5} hauteur="h-28" />}

      {page && (
        <div className="mt-5 xl:flex xl:items-start xl:gap-5">
          {/* ── LES FILTRES ───────────────────────────────────────────────
              ⚠ REPLIÉS SUR TÉLÉPHONE, DÉPLIÉS AU-DELÀ. Trois groupes de filtres
                dépliés sur 390 px repoussent le premier site sous deux écrans de
                défilement : on aurait remplacé une grille illisible par un
                formulaire illisible. */}
          <aside className="shrink-0 xl:w-[260px]">
            {etroit && (
              <button
                onClick={() => setFiltresOuverts((x) => !x)}
                aria-expanded={filtresOuverts}
                className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-input px-4 text-sm font-semibold"
              >
                <span className="inline-flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  Filtrer
                  {nbFiltres > 0 && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                      {nbFiltres}
                    </span>
                  )}
                </span>
                <ChevronRight
                  className={cn("h-4 w-4 transition-transform", filtresOuverts && "rotate-90")}
                  aria-hidden="true"
                />
              </button>
            )}

            {panneauOuvert && (
              <div className="mt-2 space-y-4 rounded-2xl border border-border bg-card p-4 xl:mt-0 xl:sticky xl:top-20">
                <GroupeFiltre titre="Type de site">
                  {page.facettes.types.length === 0 ? (
                    <p className="dk-secondaire">Aucun type à filtrer ici.</p>
                  ) : (
                    <ul className="space-y-1">
                      {page.facettes.types.map((t: FacetteType) => (
                        <li key={t.code}>
                          <Case
                            coche={types.includes(t.code)}
                            onChange={() => basculerType(t.code)}
                            compte={t.n}
                          >
                            {t.libelle}
                          </Case>
                        </li>
                      ))}
                    </ul>
                  )}
                </GroupeFiltre>

                <GroupeFiltre titre="Ville la plus proche">
                  {page.facettes.villes.length === 0 ? (
                    <p className="dk-secondaire">Aucune ville rattachée ici.</p>
                  ) : (
                    <label className="block">
                      <span className="sr-only">Choisir la ville la plus proche</span>
                      <select
                        value={ville}
                        onChange={(e) => poser({ ville: e.target.value })}
                        className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus-visible:border-primary"
                      >
                        <option value="">Toutes les villes</option>
                        {page.facettes.villes.map((v: FacetteVille) => (
                          <option key={v.slug} value={v.slug}>
                            {v.nom} ({nombre(v.n)})
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </GroupeFiltre>

                {/* 🔴 « ENTRÉE GRATUITE » N'EXISTE PAS ICI, ET C'EST DÉLIBÉRÉ.
                    Un filtre de gratuité suppose un tarif : au 16/08/2026, aucune
                    fiche ne porte de tarif résident et six sur 2 476 un tarif
                    non-résident. Coché, il aurait rendu une page vide sur une
                    région entière — une impasse qui se lit comme une panne, et
                    non comme une donnée manquante. */}
                <GroupeFiltre titre="Conditions">
                  <Case
                    coche={sansGuide}
                    onChange={() => poser({ guide: sansGuide ? "" : "sans" })}
                  >
                    Sans guide obligatoire
                  </Case>
                  {/* ⚠ ON LE DIT SEULEMENT QUAND C'EST VRAI, et on le déduit des
                      chiffres reçus : si le total filtré égale le total de la
                      région, la case n'a rien retiré. Aucune constante en dur —
                      la phrase disparaîtra d'elle-même le jour où un guide sera
                      saisi. */}
                  {sansGuide && page.total === page.region.nb_sites && page.total > 0 && (
                    <p className="dk-secondaire mt-1.5 leading-relaxed">{FILTRE_GUIDE_INERTE}</p>
                  )}
                  <p className="dk-secondaire mt-2 leading-relaxed">
                    Pas de filtre « entrée gratuite » : presque aucune fiche ne porte de
                    tarif, il ne rendrait rien.
                  </p>
                </GroupeFiltre>

                {nbFiltres > 0 && (
                  <button
                    onClick={() => poser({ type: "", ville: "", guide: "" })}
                    className="inline-flex min-h-10 w-full items-center justify-center rounded-full border border-input text-sm font-semibold hover:border-primary hover:text-primary"
                  >
                    Effacer les filtres ({nbFiltres})
                  </button>
                )}
              </div>
            )}
          </aside>

          {/* ── LA LISTE ──────────────────────────────────────────────────── */}
          <section className="mt-4 min-w-0 flex-1 xl:mt-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              {/* ⚠ LE COMPTEUR ANNONCE LE VRAI TOTAL, pas le nombre de lignes
                  rendues : une liste tronquée en silence se lit comme une
                  absence de contenu.
                  ⚠ `aria-live` : après « voir plus », rien ne bouge pour un
                    lecteur d'écran si le compteur change en silence — la personne
                    ne sait pas que vingt-quatre lignes viennent d'arriver.
                  ⚠ « 24 sur 133 sites » et non « 24 sites sur 133 » : la première
                    forme reste juste au singulier comme au pluriel. */}
              <h2 className="text-sm font-semibold" aria-live="polite">
                {page.total === 0
                  ? "Aucun site"
                  : elements.length < page.total
                    ? `${nombre(elements.length)} sur ${pluriel(page.total, "site")}`
                    : pluriel(page.total, "site")}
              </h2>
              <Link
                to="/carte"
                className="dk-secondaire inline-flex items-center gap-1.5 hover:text-primary"
              >
                <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Ouvrir la carte
              </Link>
            </div>

            {etat === "chargement" && <Squelettes className="mt-3" nombre={4} hauteur="h-28" />}

            {etat === "ok" && elements.length > 0 && (
              <ul className="mt-3 space-y-2.5">
                {elements.map((s) => (
                  <LigneSite
                    key={s.slug}
                    site={s}
                    /* ⚠ LA FORME COURTE D'ABORD SUR UNE LIGNE. Le libellé du
                       serveur (« Réserves et parcs nationaux ») est fait pour la
                       colonne de filtres, où il désigne une FAMILLE ; au-dessus
                       d'un site unique il est faux, et il prend deux lignes de
                       texte avant le nom du lieu sur un écran de 390 px. On garde
                       le serveur en repli : c'est lui qui fait autorité pour un
                       code que cette table ne connaîtrait pas. */
                    libelle={LIBELLE_TYPE_COURT[s.kind] ?? libelles.get(s.kind) ?? s.kind}
                  />
                ))}
              </ul>
            )}

            {erreurSuite && (
              <EtatErreur
                className="mt-4"
                titre="La suite n'est pas arrivée"
                texte="Les sites déjà affichés restent là. Réessayez : la connexion est peut-être passée en 2G."
                onReessayer={() => void charger(curseur)}
              />
            )}

            {/* ⚠ « VOIR PLUS » PLUTÔT QU'UN DÉFILEMENT INFINI : sur une liste, le
                défilement infini rend le pied de page inatteignable et empêche de
                revenir où l'on en était.
                🔴 LA CONDITION CROISE LE CURSEUR **ET** LE RESTE À VOIR. Une
                   région dont le total tombe pile sur un multiple de 24 rend une
                   dernière page pleine, donc un curseur non nul : le bouton
                   s'affichait « Voir plus (0 restants) » et une requête partait
                   pour ne rien ramener. Le reste est calculé, le bouton disparaît
                   quand il vaut zéro. */}
            {etat === "ok" && curseur && elements.length < page.total && !erreurSuite && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => void charger(curseur)}
                  disabled={encore}
                  className="min-h-11 rounded-full border border-input px-6 text-sm font-semibold hover:border-primary hover:text-primary disabled:opacity-60"
                >
                  {encore
                    ? "Chargement…"
                    : `Voir plus (${nombre(Math.max(0, page.total - elements.length))} restants)`}
                </button>
              </div>
            )}

            {/* ── L'ÉTAT VIDE, PAR COMBINAISON DE FILTRES ─────────────────── */}
            {etat === "ok" && elements.length === 0 && (
              <div className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center">
                <p className="font-semibold">
                  {nbFiltres > 0
                    ? "Aucun site avec ces filtres."
                    : `Aucun site recensé dans la région ${nom}.`}
                </p>
                {nbFiltres > 0 && (
                  <p className="dk-secondaire mx-auto mt-1.5 max-w-md leading-relaxed">
                    {[
                      types.length > 0
                        ? `type : ${types.map((t) => libelles.get(t) ?? libelleTypeCourt(t)).join(", ")}`
                        : null,
                      ville
                        ? `ville : ${page.facettes.villes.find((v) => v.slug === ville)?.nom ?? ville}`
                        : null,
                      sansGuide ? "sans guide obligatoire" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}{" "}
                    — sur {pluriel(page.region.nb_sites, "site")} dans la région.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {nbFiltres > 0 && (
                    <button
                      onClick={() => poser({ type: "", ville: "", guide: "" })}
                      className="inline-flex min-h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
                    >
                      {/* ⚠ Le compte entre parenthèses, pas accordé dans la
                          phrase : « Voir les 1 site » se lit comme un bogue. */}
                      Voir tous les sites de la région ({nombre(page.region.nb_sites)})
                    </button>
                  )}
                  <Link
                    to="/sites"
                    className="inline-flex min-h-11 items-center rounded-full border border-input px-6 text-sm font-semibold"
                  >
                    Changer de région
                  </Link>
                </div>
              </div>
            )}

            {/* ── PROPOSER UNE CORRECTION ──────────────────────────────────
                ⚠ CE BLOC POINTE UN CANAL QUI EXISTE. Le dépôt sait signaler une
                  fiche depuis la migration 0044 (`signaler("attraction", id, …)`),
                  mais ce contrat ne rend pas l'identifiant des sites : impossible
                  de l'appeler d'ici. Plutôt qu'un bouton mort, on ouvre l'adresse
                  de contact publiée en pied de site et dans les mentions légales,
                  avec la région déjà écrite dans l'objet. */}
            {etat === "ok" && (
              <div className="mt-6 rounded-2xl border border-border bg-secondary/40 p-4">
                <p className="text-sm font-semibold">Une erreur, un tarif, un fady à ajouter ?</p>
                <p className="dk-secondaire mt-1 leading-relaxed">
                  Ces fiches viennent d'imports ouverts ; beaucoup n'ont qu'un nom et une
                  position. Une correction vaut plus qu'une fiche de plus.
                </p>
                <a
                  href={`mailto:contact.fonenako@gmail.com?subject=${encodeURIComponent(
                    `Correction — sites de la région ${nom}`
                  )}&body=${encodeURIComponent(
                    `Région : ${nom}\nSite concerné : \nCe qu'il faut corriger ou ajouter : \n`
                  )}`}
                  className="mt-3 inline-flex min-h-11 items-center rounded-full border border-input px-5 text-sm font-semibold hover:border-primary hover:text-primary"
                >
                  Proposer une correction
                </a>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/**
 * UNE LIGNE DE SITE.
 *
 * 🔴 CE QUI A CHANGÉ, ET POURQUOI ÇA COMPTE. La vignette affichait douze cases
 *    grises quand `best_months` était vide — c'est-à-dire sur les 2 476 fiches.
 *    Douze cases éteintes ne se lisent pas « on ne sait pas », elles se lisent
 *    « déconseillé toute l'année » : l'écran décourageait la visite de chaque
 *    site du pays. Même piège pour les tarifs et les fady. Une absence se dit
 *    avec des mots, jamais avec un gabarit vide.
 */
function LigneSite({ site: s, libelle }: { site: SiteLigne; libelle: string }) {
  const sansTarif = s.tarif_resident_ar === null && s.tarif_non_resident_ar === null;

  return (
    <li>
      {/* ⚠ PAS DE `dk-carte` ICI : cette classe soulève la carte au survol, ce qui
          promet un clic sur toute la surface. La ligne n'est pas cliquable en
          entier — elle porte deux liens distincts (la fiche, et « compléter ») —
          et un relief menteur fait cliquer dans le vide. */}
      <article className="dk-reveal overflow-hidden rounded-2xl border border-border bg-card p-3.5">
        <div className="flex gap-3">
          {/* ⚠ Une vignette carrée de 64 px, pas un bandeau : sur un fonds à 9 %
              de photos, un bandeau par ligne serait un mur de gris. */}
          {s.cover_url && (
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-secondary">
              <ImageProgressive
                src={s.cover_url}
                alt=""
                ajustement="cover"
                largeurAffichee="64px"
              />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="dk-etiquette">{libelle}</p>
            <h3 className="mt-0.5 text-[16px] font-bold leading-tight">
              <Link to={`/site/${s.slug}`} className="hover:text-primary">
                {s.nom}
              </Link>
            </h3>

            {(s.ville || s.km_ville !== null) && (
              <p className="dk-secondaire mt-0.5">
                <MapPin className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
                {[
                  s.ville,
                  // ⚠ 0 km est une VRAIE distance : le site est dans la ville.
                  //   Le confondre avec « inconnu » ferait perdre sa mention à la
                  //   moitié des sites urbains.
                  s.km_ville === null
                    ? null
                    : s.km_ville === 0
                      ? "sur place"
                      : `à ${nombre(Math.round(s.km_ville))} km`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}

            {/* ⚠ L'ÉTAT DE LA ROUTE EST UNE PHRASE, PAS UNE PASTILLE :
                « RN7 goudronnée, nids-de-poule ponctuels », « Piste difficile,
                deux bacs à traverser. FERMÉ en saison des pluies ». Tronqué dans
                une puce, il perdait précisément ce qui sert. */}
            {s.etat_route && (
              <p className="dk-secondaire mt-1 leading-relaxed">
                <span className="font-medium text-foreground">Accès&nbsp;:</span> {s.etat_route}
              </p>
            )}

            {s.resume && <p className="dk-corps mt-1.5 line-clamp-2 text-muted-foreground">{s.resume}</p>}
          </div>

          {s.guide_obligatoire && (
            <span className="h-fit shrink-0 rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-semibold text-warn">
              Guide obligatoire
            </span>
          )}
        </div>

        {/* ── CE QU'ON SAIT, ET CE QU'ON NE SAIT PAS ──────────────────────── */}
        <dl className="mt-3 grid gap-1.5 border-t border-border pt-2.5 text-xs sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="dk-etiquette">Entrée</dt>
            <dd className="mt-0.5">
              {sansTarif ? (
                <span className="text-muted-foreground">
                  {/* 🔴 « ACCÈS LIBRE » ÉTAIT UNE DONNÉE INVENTÉE. Le champ vide
                      dit qu'on NE SAIT PAS ce que coûte l'entrée ; il ne dit pas
                      qu'elle est gratuite. Or 2 470 fiches sur 2 476 tombent
                      dans ce cas, dont les 133 réserves — Isalo, Andasibe,
                      Ranomafana font tous payer. Annoncer la gratuité sur un
                      parc national envoie quelqu'un sans argent à l'entrée. */}
                  Aucun tarif renseigné
                </span>
              ) : (
                <span className="block space-y-0.5">
                  {/* ⚠ LES DEUX TARIFS, TOUJOURS ENSEMBLE ET TOUJOURS NOMMÉS. Les
                      parcs malgaches facturent résident et non-résident avec un
                      écart de un à cinq : n'en montrer qu'un ferait renoncer un
                      Malgache, ou arriver un étranger avec la moitié de la somme. */}
                  <span className="block tabular-nums">
                    Résident&nbsp;:{" "}
                    {s.tarif_resident_ar !== null ? (
                      <strong>{ariary(s.tarif_resident_ar)}</strong>
                    ) : (
                      <span className="text-muted-foreground">non renseigné</span>
                    )}
                  </span>
                  <span className="block tabular-nums">
                    Non-résident&nbsp;:{" "}
                    {s.tarif_non_resident_ar !== null ? (
                      <strong>{ariary(s.tarif_non_resident_ar)}</strong>
                    ) : (
                      <span className="text-muted-foreground">non renseigné</span>
                    )}
                  </span>
                </span>
              )}
            </dd>
          </div>

          <div className="min-w-0">
            <dt className="dk-etiquette">Meilleurs mois</dt>
            <dd className="mt-0.5">
              {s.best_months.length > 0 ? (
                <FriseMois mois={s.best_months} />
              ) : (
                <span className="text-muted-foreground">aucun mois renseigné</span>
              )}
            </dd>
          </div>

          <div className="min-w-0">
            <dt className="dk-etiquette">Fady</dt>
            <dd className="mt-0.5">
              {s.fady_n > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-gold-soft px-2 py-0.5 font-semibold text-warn">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  {pluriel(s.fady_n, "fady", "fady")} à respecter
                </span>
              ) : (
                <span className="text-muted-foreground">aucun fady noté</span>
              )}
            </dd>
          </div>
        </dl>

        {(!s.complet || (s.cover_url && s.cover_credit)) && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            {/* ⚠ « COMPLÉTER » MÈNE À LA FICHE, qui porte sa source, sa licence et
                le lien pour corriger à l'origine : c'est de là qu'une correction
                part vraiment. Ce n'est pas un bouton mort, c'est le seul chemin
                qui existe aujourd'hui — voir la note du bloc « Proposer une
                correction » plus haut.
                ⚠ CE QUI MANQUE N'EST DIT QUE QUAND ON PEUT LE CONSTATER.
                  `complet` vient du serveur et croise photo ET description ;
                  `cover_url` et `resume` sont ce que la ligne a sous la main.
                  Quand aucun des deux ne manque visiblement, on n'invente pas de
                  raison — on invite sans préciser. */}
            {!s.complet ? (
              <Link
                to={`/site/${s.slug}`}
                className="dk-secondaire inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
                Compléter cette fiche
                {(!s.cover_url || !s.resume) && (
                  <span className="font-normal text-muted-foreground">
                    (
                    {!s.cover_url && !s.resume
                      ? "ni photo ni description"
                      : !s.cover_url
                        ? "photo manquante"
                        : "description manquante"}
                    )
                  </span>
                )}
              </Link>
            ) : (
              <span />
            )}

            {/* ⚠ LE CRÉDIT VOYAGE AVEC LA PHOTO — c'est une obligation de licence,
                pas une politesse : les images viennent de Wikimedia Commons et
                d'archives, et la plupart de ces licences exigent de nommer
                l'auteur. Sur une vignette de 64 px il n'y a pas de place pour
                l'incruster : il prend donc sa propre ligne, en pied de fiche,
                plutôt que de disparaître. */}
            {s.cover_url && s.cover_credit && (
              <span className="dk-secondaire text-[11px]">Photo&nbsp;: {s.cover_credit}</span>
            )}
          </div>
        )}
      </article>
    </li>
  );
}

/* ══ LES PIÈCES COMMUNES ══════════════════════════════════════════════════ */

const MOIS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MOIS_LONG = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/**
 * ⚠ CETTE FRISE NE S'AFFICHE QUE QUAND IL Y A QUELQUE CHOSE À MONTRER. Vide,
 *   elle dit le contraire de ce qu'elle sait : douze cases éteintes se lisent
 *   « déconseillé toute l'année ». L'appelant vérifie avant de la monter.
 * ⚠ Le nom complet du mois est porté par `title` ET par un texte lisible aux
 *   lecteurs d'écran : « J F M A M J » n'est pas une information sans lui.
 */
function FriseMois({ mois }: { mois: number[] }) {
  const dits = mois.map((m) => MOIS_LONG[m - 1]).filter(Boolean);
  return (
    <>
      <span className="sr-only">Conseillé en {dits.join(", ")}.</span>
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {MOIS.map((m, i) => (
          <span
            key={i}
            title={MOIS_LONG[i]}
            className={
              mois.includes(i + 1)
                ? "grid h-5 w-5 place-items-center rounded bg-primary text-[10px] font-bold text-primary-foreground"
                : "grid h-5 w-5 place-items-center rounded bg-muted text-[10px] text-muted-foreground/50"
            }
          >
            {m}
          </span>
        ))}
      </span>
    </>
  );
}

/**
 * LE FIL D'ARIANE — Sites et parcs › Nord › Diana, chaque cran cliquable.
 *
 * ⚠ LE DERNIER CRAN N'EST PAS UN LIEN : il désigne la page où l'on se trouve.
 *   `aria-current="page"` le dit aux lecteurs d'écran, qui sinon annoncent un
 *   lien qui ne mène nulle part.
 */
function Ariane({ crans }: { crans: { nom: string; to?: string }[] }) {
  return (
    <nav aria-label="Fil d'Ariane">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm text-muted-foreground">
        {crans.map((c, i) => (
          <li key={`${c.nom}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            {c.to ? (
              <Link to={c.to} className="hover:text-foreground hover:underline underline-offset-4">
                {c.nom}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-foreground">
                {c.nom}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Pastille({
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

function Compteur({ t, n, sur }: { t: string; n: number; sur?: number }) {
  // ⚠ La part se dit à l'entier près et JAMAIS arrondie vers le haut : 6 % ne
  //   doit pas devenir « près de 10 % ». C'est ce chiffre bas qui justifie tout
  //   l'écran.
  const part = sur && sur > 0 ? Math.floor((n / sur) * 100) : null;
  return (
    <div className="rounded-xl bg-secondary px-3 py-2.5">
      <dt className="dk-etiquette">{t}</dt>
      <dd className="mt-0.5 text-lg font-bold tabular-nums leading-none">
        {nombre(n)}
        {part !== null && (
          <span className="ml-1.5 text-xs font-medium text-muted-foreground">{part}&nbsp;%</span>
        )}
      </dd>
    </div>
  );
}

function GroupeFiltre({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="dk-etiquette">{titre}</h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/**
 * ⚠ UNE VRAIE CASE À COCHER, pas un `<div onClick>`. Le clavier, le lecteur
 *   d'écran et l'étiquette cliquable viennent avec — et la cible fait 44 px de
 *   haut, comme partout ailleurs sur ce produit.
 */
function Case({
  coche,
  onChange,
  compte,
  children,
}: {
  coche: boolean;
  onChange: () => void;
  compte?: number;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={coche}
        onChange={onChange}
        className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
      />
      <span className="min-w-0 flex-1">{children}</span>
      {compte !== undefined && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{nombre(compte)}</span>
      )}
    </label>
  );
}
