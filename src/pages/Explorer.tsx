import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Compass, MapPin } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { FicheCard } from "@/components/FicheCard";
import {
  CATEGORIES,
  chargerDestinations,
  compterDestinations,
  chargerLieu,
  chargerSaisons,
  chercherPages,
  type Lieu,
  type ResultatPage,
} from "@/lib/etablissements";
import { cn } from "@/lib/utils";
import { jeuDeTailles } from "@/lib/imageThumb";
import { GRANDES_REGIONS } from "@/lib/grandesRegions";
import { useReveal } from "@/hooks/useReveal";

const MOIS = [
  "Janv.",
  "Févr.",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juil.",
  "Août",
  "Sept.",
  "Oct.",
  "Nov.",
  "Déc.",
];

const COULEUR_SAISON: Record<string, string> = {
  ideale: "bg-primary text-primary-foreground",
  correcte: "bg-secondary text-primary",
  deconseillee: "bg-muted text-muted-foreground",
};

/**
 * Explorer — le catalogue des destinations.
 *
 * ⚠ DEUX DÉFAUTS CORRIGÉS.
 *
 *  ① Les huit destinations venaient d'un fichier codé en dur, et la section
 *    « Où dormir et où manger » affichait quatre établissements inventés — les
 *    mêmes pour toutes les destinations, y compris leurs notes et leurs prix.
 *    Tout vient maintenant du référentiel : 178 lieux réels, leur saisonnalité,
 *    et les établissements réellement rattachés.
 *
 *  ② Le paramètre d'URL était incohérent avec le reste du site : une
 *    publication renvoyait vers `/explorer?q=Nosy be` alors que cet écran ne
 *    lisait que `?lieu=`. Le clic atterrissait sur la liste générique, en
 *    silence. On accepte désormais les deux — et le lien des publications
 *    pointe vers la recherche, qui sait résoudre « Nosy be » en « nosy-be ».
 */
/** ⚠ Assez pour remplir deux rangees sur un ecran large sans faire attendre un
 *  telephone en 3G. Le reste vient au « voir plus ». */
const PAR_PAGE_DEST = 48;

export default function Explorer() {
  const [params] = useSearchParams();
  const slug = params.get("lieu") ?? params.get("q");

  const [destinations, setDestinations] = useState<Lieu[]>([]);
  const [totalDest, setTotalDest] = useState<number | null>(null);
  useReveal(destinations);
  const [encore, setEncore] = useState(false);
  const [finiDest, setFiniDest] = useState(false);
  const [lieu, setLieu] = useState<Lieu | null>(null);
  const [saisons, setSaisons] = useState<
    { month: number; rating: string; reason: string | null }[]
  >([]);
  const [etabs, setEtabs] = useState<ResultatPage[]>([]);
  const [categorie, setCategorie] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  /** Grande région choisie, puis éventuellement une région administrative
   *  précise à l'intérieur. `null` = tout Madagascar. */
  const [grande, setGrande] = useState<string | null>(null);
  const [regionFine, setRegionFine] = useState<string | null>(null);

  const gr = GRANDES_REGIONS.find((g) => g.code === grande) ?? null;
  const regionsFiltre = regionFine ? [regionFine] : gr ? gr.regions : null;

  useSEO({
    titre: lieu
      ? lieu.name_fr
      : totalDest
        ? `Explorer Madagascar — ${totalDest} destinations`
        : "Explorer Madagascar",
    description: lieu?.summary ??
      "Les destinations de Madagascar, avec leur saisonnalite, leurs acces reels et les adresses qui s'y trouvent.",
    url: "/explorer",
  });

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      if (!slug) {
        setLieu(null);
        // 🔴 UNE LIMITE FIXE EST UN PIEGE QUI SE REFERME TOUT SEUL. Cet ecran
        //    a deja perdu des destinations une fois (limite 80 pour 87 lieux).
        //    On l'avait passee a 200 ; le catalogue est monte a 524 le jour ou
        //    les lieux abritant un parc ou une cascade y sont entres, et 324
        //    ont recommence a disparaitre EN SILENCE. Une limite au-dessus du
        //    volume du jour n'est pas une solution, c'est un report.
        // ⚠ D'ou une PAGINATION, qui ne se perime pas.
        const [page, n] = await Promise.all([
          chargerDestinations(PAR_PAGE_DEST, null, regionsFiltre),
          compterDestinations(regionsFiltre).catch(() => null),
        ]);
        setDestinations(page);
        setTotalDest(n);
        setFiniDest(page.length < PAR_PAGE_DEST);
      } else {
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
      }
    } catch {
      /* les états vides ci-dessous disent la vérité */
    } finally {
      setChargement(false);
    }
    // ⚠ `regionsFiltre` EST UN TABLEAU RECONSTRUIT À CHAQUE RENDU : le placer
    //   tel quel en dépendance relancerait la requête en boucle. On dépend donc
    //   du CHOIX — deux chaînes — et non de sa forme dérivée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, categorie, grande, regionFine]);

  useEffect(() => {
    void charger();
  }, [charger]);

  /* ── Une destination ─────────────────────────────────────────────────── */
  if (slug) {
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
            🔴 CET ENTÊTE ÉTAIT UN RECTANGLE DE COULEUR. 160 px de bleu plein
               en haut de chaque destination — sur un produit de VOYAGE, dont
               tout l'argument est de donner envie d'aller quelque part. Les
               photos existaient (198 sur les sites), mais `places` n'avait
               aucune colonne pour en porter une : c'est ce que 0082 corrige.

            ⚠ ET L'APLAT RESTE, pour les 18 300 destinations sans photo. Un
              cadre gris « image manquante » serait pire que la couleur : il
              signale un défaut là où il n'y a qu'une donnée non saisie.

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

  /* ── Le catalogue ────────────────────────────────────────────────────── */
  return (
    <div className="px-4 py-5">
      <div className="flex items-center gap-2">
        <Compass className="h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">Explorer Madagascar</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {totalDest
          ? `${totalDest.toLocaleString("fr-FR")} destination${totalDest > 1 ? "s" : ""}`
          : "Les destinations du pays"}
        {gr ? ` dans ${regionFine ?? gr.libelle}` : ""}, avec leur saison et les
        établissements sur place.
      </p>

      {/* ── PAR GRANDE RÉGION ────────────────────────────────────────────
          ⚠ CINQ ENTRÉES, PAS VINGT-TROIS. Un voyageur ne pense pas en
            « Fitovinany » mais en « côte est » ; et vingt-trois boutons font
            une barre de filtres plus haute que les résultats sur un téléphone.
            Les régions administratives restent accessibles au deuxième rang,
            une fois la grande région choisie. */}
      <nav aria-label="Filtrer par région" className="mt-4">
        <ul className="flex flex-wrap gap-1.5">
          <li>
            <button
              onClick={() => {
                setGrande(null);
                setRegionFine(null);
              }}
              aria-pressed={!grande}
              className={cn(
                "min-h-9 rounded-full border px-3.5 text-sm font-medium transition",
                !grande
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:border-primary hover:text-primary"
              )}
            >
              Tout Madagascar
            </button>
          </li>
          {GRANDES_REGIONS.map((g) => (
            <li key={g.code}>
              <button
                onClick={() => {
                  setGrande(g.code === grande ? null : g.code);
                  setRegionFine(null);
                }}
                aria-pressed={grande === g.code}
                className={cn(
                  "min-h-9 rounded-full border px-3.5 text-sm font-medium transition",
                  grande === g.code
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:border-primary hover:text-primary"
                )}
              >
                {g.libelle}
              </button>
            </li>
          ))}
        </ul>

        {gr && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {gr.regions.map((r) => (
              <li key={r}>
                <button
                  onClick={() => setRegionFine(r === regionFine ? null : r)}
                  aria-pressed={regionFine === r}
                  className={cn(
                    "min-h-8 rounded-full border px-2.5 text-xs transition",
                    regionFine === r
                      ? "border-primary bg-secondary text-primary"
                      : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                  )}
                >
                  {r}
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      {chargement ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 large:grid-cols-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="dk-skeleton h-32 rounded-2xl" />
          ))}
        </div>
      ) : destinations.length === 0 ? (
        /* 🔴 UNE GRILLE VIDE N'EST PAS UN RÉSULTAT, C'EST UNE PANNE APPARENTE.
           Filtrer sur une région sans destination renvoyait un `<div>` vide :
           la page semblait cassée, et rien n'indiquait qu'il fallait relâcher
           le filtre. C'est exactement ce qu'on nous a signalé sur Analamanga. */
        <div className="mt-5 rounded-2xl border border-dashed border-border px-5 py-12 text-center">
          <p className="font-medium">
            Aucune destination référencée{gr ? ` dans ${regionFine ?? gr.libelle}` : ""}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Le référentiel ne couvre pas encore cette zone. Essayez une région
            voisine, ou revenez à tout Madagascar.
          </p>
          {grande && (
            <button
              onClick={() => {
                setGrande(null);
                setRegionFine(null);
              }}
              className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
            >
              Voir tout Madagascar
            </button>
          )}
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 large:grid-cols-4">
          {destinations.map((d) => (
            <Link
              key={d.slug}
              /* 🔴 Menait vers `/explorer?lieu=`, qui rend une fiche ALLEGEE
                 (resume + saisons) alors que `/lieu/` porte en plus les acces
                 chronometres et les lieux rattaches. Deux ecrans pour le meme
                 lieu selon la porte d'entree, et le catalogue servait
                 systematiquement le plus pauvre. */
              to={`/lieu/${d.slug}`}
              className="group overflow-hidden rounded-2xl border border-border transition hover:border-primary/40 hover:shadow-sm"
            >
              {/* ⚠ LA VIGNETTE N'OCCUPE LA PLACE QUE SI ELLE EXISTE. Réserver
                  un bandeau de 128 px sur les 18 300 destinations sans photo
                  transformerait la grille en enfilade de rectangles vides —
                  une carte sans image doit rester une carte compacte. */}
              {d.cover_url && (
                <div className="relative h-32 w-full overflow-hidden bg-muted">
                  <img
                    src={d.cover_url}
                    srcSet={jeuDeTailles(d.cover_url) ?? undefined}
                    sizes="(min-width: 1920px) 25vw, (min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  />
                </div>
              )}
              <div className={cn("p-4", d.cover_url && "pt-3")}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold leading-tight">{d.name_fr}</h2>
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              </div>
              {d.region && <p className="mt-0.5 text-xs text-muted-foreground">{d.region}</p>}
              {d.summary && (
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{d.summary}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {d.nb_pages > 0 && (
                  <span>
                    {d.nb_pages} établissement{d.nb_pages > 1 ? "s" : ""}
                  </span>
                )}
                {d.nb_posts > 0 && (
                  <span>
                    {d.nb_posts} récit{d.nb_posts > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ⚠ « Voir plus » plutot qu'un defilement infini : sur une grille de
          vignettes, le defilement infini rend le pied de page inatteignable. */}
      {!chargement && destinations.length > 0 && !finiDest && (
        <div className="mt-5 flex justify-center">
          <button
            onClick={async () => {
              setEncore(true);
              try {
                const suite = await chargerDestinations(
                  PAR_PAGE_DEST,
                  destinations[destinations.length - 1].name_fr,
                  /* ⚠ LE FILTRE DOIT SUIVRE LA PAGINATION. Sans lui, « voir
                     plus » sur « Nord » ramenait la suite de TOUT Madagascar
                     par ordre alphabétique : la liste se contaminait au
                     deuxième écran, et le compteur devenait faux. */
                  regionsFiltre
                );
                setFiniDest(suite.length < PAR_PAGE_DEST);
                setDestinations((avant) => {
                  const vus = new Set(avant.map((x) => x.slug));
                  return [...avant, ...suite.filter((x) => !vus.has(x.slug))];
                });
              } finally {
                setEncore(false);
              }
            }}
            disabled={encore}
            className="min-h-11 rounded-full border border-input px-6 text-sm font-semibold hover:border-primary hover:text-primary disabled:opacity-60"
          >
            {encore
              ? "Chargement…"
              : totalDest
                ? `Voir plus — ${destinations.length} sur ${totalDest.toLocaleString("fr-FR")}`
                : "Voir plus de destinations"}
          </button>
        </div>
      )}
    </div>
  );
}
