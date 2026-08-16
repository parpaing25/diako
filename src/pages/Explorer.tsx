import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, Compass, MapPin, Mountain } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
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
  chargerRegion,
  chargerRegions,
  chargerVille,
  regionDeVille,
  type AilleursCarte,
  type DestinationCarte,
  type RegionCarte,
  type RegionDetail,
  type VilleCarte,
  type VilleDetail,
} from "@/lib/explorer";
import { GRANDES_REGIONS, grandeRegionDe } from "@/lib/grandesRegions";
import { jeuDeTailles } from "@/lib/imageThumb";
import { cn } from "@/lib/utils";

/**
 * EXPLORER — LA DESCENTE EN TROIS PALIERS : pays › région › ville.
 *
 * 🔴 CE QUE ÇA CORRIGE. L'écran déversait les 522 destinations en une grille
 *    alphabétique unique. Pour trouver où aller dans le Nord il fallait faire
 *    défiler d'Ambalavao à Vohipeno en connaissant déjà les noms — c'est-à-dire
 *    n'avoir plus besoin du catalogue. On descend désormais palier par palier :
 *    les régions, puis leurs villes, puis les destinations de chaque ville.
 *
 * ⚠ CHAQUE PALIER A SON ADRESSE, ET C'EST L'URL QUI PORTE L'ÉTAT.
 *   `/explorer` · `/explorer?region=diana` · `/explorer?region=diana&ville=nosy-be`.
 *   Une descente qui ne vivrait que dans l'état React perdrait tout au
 *   rechargement, ne se partagerait pas, et le bouton « retour » du navigateur
 *   quitterait l'écran d'un coup au lieu de remonter d'un cran. Comme la
 *   descente se fait par de vrais `<Link>`, chaque cran est une entrée
 *   d'historique : le retour remonte, sans une ligne de code pour ça.
 *
 * ⚠ LE PARAMÈTRE `?lieu=` EST CONSERVÉ TEL QUEL. Des liens existants ailleurs
 *   dans le site pointent dessus ; il continue de servir la fiche allégée d'une
 *   destination, et il passe AVANT les deux autres paramètres.
 *
 * ⚠ LES COMPTEURS VIENNENT DES FONCTIONS, JAMAIS DU TABLEAU AFFICHÉ. « 81
 *   destinations » sous une carte de région est le total réel, même quand
 *   l'écran n'en montre que vingt-quatre.
 */

/** ⚠ Assez pour remplir deux rangées sur un écran large sans faire défiler
 *  quatre-vingts vignettes sur un téléphone. Le reste vient au « voir plus »,
 *  qui se sert dans le tableau DÉJÀ reçu — aucun aller-retour de plus. */
const PAR_VOLEE = 24;

/** ⚠ UNE RÉFÉRENCE STABLE, et non un `[]` littéral écrit dans le rendu : un
 *  tableau reconstruit à chaque passage relancerait tous les `useMemo` qui en
 *  dépendent, et avec eux l'effet de révélation. */
const AUCUN: never[] = [];

/** Les genres de lieux réellement présents dans le référentiel. Un genre absent
 *  de cette table s'affiche tel quel plutôt que de disparaître. */
const GENRE: Record<string, string> = {
  pays: "Pays",
  region: "Région",
  commune: "Commune",
  ville: "Ville",
  village: "Village",
  hameau: "Hameau",
  quartier: "Quartier",
  zone_touristique: "Zone touristique",
  parc: "Parc",
  site: "Site",
  plage: "Plage",
  ile: "Île",
};

const genre = (k: string) => GENRE[k] ?? k.replace(/_/g, " ");

const nombre = (n: number) => n.toLocaleString("fr-FR");

const pluriel = (n: number, mot: string) => `${nombre(n)} ${mot}${n > 1 ? "s" : ""}`;

/* ══ LE ROUTEUR DES PALIERS ═══════════════════════════════════════════════ */

export default function Explorer() {
  const [params] = useSearchParams();
  // ⚠ `?q=` est accepté depuis longtemps comme synonyme de `?lieu=` : des
  //   publications renvoient encore vers `/explorer?q=…`.
  const lieu = params.get("lieu") ?? params.get("q");
  const ville = params.get("ville");
  const region = params.get("region");

  if (lieu) return <FicheLieu slug={lieu} />;
  if (ville) return <PalierVille slug={ville} regionUrl={region} />;
  if (region) return <PalierRegion slug={region} />;
  return <PalierRegions />;
}

/* ══ ① LES RÉGIONS ════════════════════════════════════════════════════════ */

function PalierRegions() {
  const [regions, setRegions] = useState<RegionCarte[] | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "erreur">("chargement");

  const charger = useCallback(async () => {
    setEtat("chargement");
    try {
      setRegions(await chargerRegions());
      setEtat("ok");
    } catch {
      setEtat("erreur");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const liste = regions ?? AUCUN;
  useReveal(liste);

  /** ⚠ LE TOTAL EST LA SOMME DES CARTES AFFICHÉES, et pas un chiffre appris par
   *  cœur : il ne peut donc pas contredire ce qu'on voit à l'écran. */
  const total = useMemo(
    () => liste.reduce((s, r) => s + r.nb_destinations, 0),
    [liste]
  );

  /**
   * ⚠ VINGT-TROIS CARTES EN UN MUR ALPHABÉTIQUE NE SE LISENT PAS. On les range
   *   sous les cinq grandes régions du dépôt — un voyageur pense « la côte est »
   *   avant de penser « Fitovinany ».
   * ⚠ AUCUNE CARTE NE PEUT SE PERDRE : une région qu'aucun groupe ne réclame
   *   (orthographe divergente) tombe dans un dernier groupe visible, jamais
   *   dans le vide. Une région perdue serait inatteignable EN SILENCE.
   */
  const groupes = useMemo(() => {
    const restant = new Map(liste.map((r) => [r.slug, r]));
    const rangs = GRANDES_REGIONS.map((g) => {
      const cartes = liste.filter((r) => grandeRegionDe(r.nom)?.code === g.code);
      cartes.forEach((c) => restant.delete(c.slug));
      return { titre: g.libelle, cartes };
    });
    if (restant.size) rangs.push({ titre: "Autres régions", cartes: [...restant.values()] });
    return rangs.filter((r) => r.cartes.length > 0);
  }, [liste]);

  useSEO({
    titre: total
      ? `Explorer Madagascar — ${nombre(total)} destinations`
      : "Explorer Madagascar",
    description:
      "Madagascar région par région : les villes, leurs destinations, leur saison et les adresses qui s'y trouvent.",
    url: "/explorer",
  });

  return (
    <div className="px-4 py-5">
      <p className="dk-etiquette">Découvrir</p>
      <div className="mt-1 flex items-center gap-2">
        <Compass className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
        <h1 className="dk-titre">Explorer Madagascar</h1>
      </div>
      <p className="dk-corps mt-2 max-w-[70ch] text-muted-foreground">
        {liste.length > 0
          ? `${pluriel(liste.length, "région")} · ${pluriel(total, "destination")}.`
          : "Le pays région par région."}{" "}
        Ouvrez une région pour voir ses villes, puis une ville pour voir ce qu'il
        y a autour.
      </p>

      {etat === "erreur" && <EtatErreur className="mt-5" onReessayer={() => void charger()} />}

      {etat === "chargement" && <Squelettes hauteur="h-52" />}

      {etat === "ok" &&
        groupes.map((g) => (
          <section key={g.titre} className="mt-7">
            <h2 className="dk-etiquette">{g.titre}</h2>
            <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 large:grid-cols-4">
              {g.cartes.map((r) => (
                <li key={r.slug}>
                  <Carte
                    to={`/explorer?region=${encodeURIComponent(r.slug)}`}
                    nom={r.nom}
                    etiquette="Région"
                    cover={r.cover_url}
                    credit={r.cover_credit}
                    icone={Mountain}
                    metas={[
                      pluriel(r.nb_destinations, "destination"),
                      r.nb_etablissements > 0
                        ? pluriel(r.nb_etablissements, "établissement")
                        : null,
                    ]}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}

      {etat === "ok" && liste.length === 0 && (
        <EmptyState
          className="mt-6"
          icone={Compass}
          manque="Aucune région n'est encore ouverte à l'exploration."
          action={{ libelle: "Voir les sites et parcs", lien: "/sites" }}
          contenuReel={
            <>
              <p className="dk-secondaire leading-relaxed">
                Le découpage par région se remplit au fur et à mesure que les
                destinations sont rattachées. En attendant, les parcs, les
                plages et le patrimoine sont déjà consultables un par un.
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

/* ══ ② LES VILLES D'UNE RÉGION ════════════════════════════════════════════ */

function PalierRegion({ slug }: { slug: string }) {
  const [detail, setDetail] = useState<RegionDetail | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "absente" | "erreur">("chargement");

  const charger = useCallback(async () => {
    setEtat("chargement");
    try {
      const d = await chargerRegion(slug);
      setDetail(d);
      setEtat(d ? "ok" : "absente");
    } catch {
      setEtat("erreur");
    }
  }, [slug]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const villes = useVolee<VilleCarte>(detail?.villes ?? AUCUN);
  const ailleurs = useVolee<AilleursCarte>(detail?.ailleurs ?? AUCUN);

  /**
   * 🔴 `useReveal` REÇOIT LES TABLEAUX RENDUS, JAMAIS LEUR LONGUEUR. Passer une
   *    taille ne relance pas l'effet quand vingt-quatre cartes en remplacent
   *    vingt-quatre autres : React a créé de NOUVEAUX nœuds, sans `data-vu`, et
   *    `.dk-reveal` part à `opacity: 0` — la page paraît VIDE, sans erreur.
   *    Le `useMemo` garde la référence stable tant que rien ne bouge, pour que
   *    l'effet ne se rejoue pas à chaque rendu.
   */
  const rendus = useMemo(
    () => [...villes.visibles, ...ailleurs.visibles],
    [villes.visibles, ailleurs.visibles]
  );
  useReveal(rendus);

  const nom = detail?.region.nom ?? "";

  useSEO({
    titre: nom ? `${nom} — que voir, où aller` : "Explorer Madagascar",
    description: detail
      ? `${pluriel(detail.region.nb_destinations, "destination")} dans la région ${nom} : ses villes, ses parcs et ses plages, avec les adresses sur place.`
      : undefined,
    url: `/explorer?region=${encodeURIComponent(slug)}`,
  });

  if (etat === "absente") return <Introuvable quoi="Région inconnue" />;

  return (
    <div className="px-4 py-5">
      <Ariane crans={[{ nom: "Madagascar", to: "/explorer" }, { nom: nom || "Région" }]} />

      <h1 className="dk-titre mt-2">{nom || "Région"}</h1>
      {detail && (
        <p className="dk-corps mt-2 max-w-[70ch] text-muted-foreground">
          {pluriel(detail.region.nb_destinations, "destination")} dans la région.
          Ouvrez une ville pour voir ce qu'il y a autour.
        </p>
      )}

      {etat === "erreur" && <EtatErreur className="mt-5" onReessayer={() => void charger()} />}
      {etat === "chargement" && <Squelettes hauteur="h-52" />}

      {etat === "ok" && detail && (
        <>
          {detail.villes.length > 0 && (
            <section className="mt-6">
              <h2 className="dk-etiquette">Villes et villages</h2>
              <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 large:grid-cols-4">
                {villes.visibles.map((v) => (
                  <li key={v.slug}>
                    <Carte
                      to={`/explorer?region=${encodeURIComponent(detail.region.slug)}&ville=${encodeURIComponent(v.slug)}`}
                      nom={v.nom}
                      etiquette={genre(v.kind)}
                      resume={v.summary}
                      cover={v.cover_url}
                      credit={v.cover_credit}
                      icone={MapPin}
                      metas={[
                        pluriel(v.nb_destinations, "destination"),
                        v.nb_etablissements > 0
                          ? pluriel(v.nb_etablissements, "établissement")
                          : null,
                        v.nb_recits > 0 ? pluriel(v.nb_recits, "récit") : null,
                      ]}
                    />
                  </li>
                ))}
              </ul>
              <BoutonPlus volee={villes} mot="ville" />
            </section>
          )}

          {detail.ailleurs.length > 0 && (
            <section className="mt-8">
              <h2 className="dk-etiquette">Ailleurs dans la région</h2>
              {/* ⚠ CE N'EST PAS UN FOURRE-TOUT : ce sont les destinations
                  qu'aucune ville ne peut accueillir — un massif, une île, un
                  parc à cheval sur plusieurs communes. Les taire les rendrait
                  inatteignables depuis la descente. */}
              <p className="dk-secondaire mt-1 max-w-[70ch]">
                Ces destinations ne dépendent d'aucune ville de la région.
              </p>
              <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 large:grid-cols-4">
                {ailleurs.visibles.map((a) => (
                  <li key={a.slug}>
                    <Carte
                      to={`/lieu/${a.slug}`}
                      nom={a.nom}
                      etiquette={genre(a.kind)}
                      resume={a.summary}
                      cover={a.cover_url}
                      credit={a.cover_credit}
                      icone={MapPin}
                      metas={[
                        a.nb_etablissements > 0
                          ? pluriel(a.nb_etablissements, "établissement")
                          : null,
                        a.nb_recits > 0 ? pluriel(a.nb_recits, "récit") : null,
                      ]}
                    />
                  </li>
                ))}
              </ul>
              <BoutonPlus volee={ailleurs} mot="destination" />
            </section>
          )}

          {/* 🔴 UNE GRILLE VIDE N'EST PAS UN RÉSULTAT, C'EST UNE PANNE
              APPARENTE. C'est exactement ce qui nous a été signalé sur
              Analamanga : rien à l'écran, et rien pour dire quoi faire. */}
          {detail.villes.length === 0 && detail.ailleurs.length === 0 && (
            <EmptyState
              className="mt-6"
              icone={Compass}
              manque={`Aucune destination n'est encore rattachée à ${nom}.`}
              action={{ libelle: "Voir toutes les régions", lien: "/explorer" }}
              contenuReel={
                <>
                  <p className="dk-secondaire leading-relaxed">
                    Le référentiel ne couvre pas encore cette région. Les parcs,
                    les plages et le patrimoine du pays restent consultables un
                    par un, et la carte montre ce qui est déjà documenté autour.
                  </p>
                  <Link
                    to="/sites"
                    className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-semibold"
                  >
                    <Mountain className="h-4 w-4" aria-hidden="true" />
                    Sites et parcs
                  </Link>
                </>
              }
            />
          )}
        </>
      )}
    </div>
  );
}

/* ══ ③ LES DESTINATIONS D'UNE VILLE ═══════════════════════════════════════ */

function PalierVille({ slug, regionUrl }: { slug: string; regionUrl: string | null }) {
  const [detail, setDetail] = useState<VilleDetail | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "absente" | "erreur">("chargement");
  const [cranRegion, setCranRegion] = useState<{ slug: string; nom: string } | null>(null);

  const charger = useCallback(async () => {
    setEtat("chargement");
    try {
      const d = await chargerVille(slug);
      setDetail(d);
      setEtat(d ? "ok" : "absente");
    } catch {
      setEtat("erreur");
    }
  }, [slug]);

  useEffect(() => {
    void charger();
  }, [charger]);

  /**
   * ⚠ LE CRAN DU MILIEU DOIT SURVIVRE À UN LIEN PARTAGÉ. Ouvrir `?ville=nosy-be`
   *   sans `?region=` ne doit pas amputer le fil d'Ariane : on retrouve la
   *   région par son nom, et on ne se rabat sur le paramètre d'URL que si la
   *   résolution échoue. Un cran non résolu reste du texte — jamais un lien qui
   *   mène nulle part.
   */
  useEffect(() => {
    if (!detail) {
      setCranRegion(null);
      return;
    }
    let vivant = true;
    void regionDeVille(detail.ville.region).then((r) => {
      if (!vivant) return;
      setCranRegion(
        r ??
          (regionUrl
            ? { slug: regionUrl, nom: detail.ville.region ?? regionUrl }
            : null)
      );
    });
    return () => {
      vivant = false;
    };
  }, [detail, regionUrl]);

  const dest = useVolee<DestinationCarte>(detail?.destinations ?? AUCUN);
  // 🔴 LE TABLEAU RENDU, jamais sa longueur — voir le commentaire du palier ②.
  useReveal(dest.visibles);

  const v = detail?.ville;

  useSEO({
    titre: v ? `${v.nom} — que voir autour` : "Explorer Madagascar",
    description:
      v?.summary ??
      (v
        ? `Les destinations autour de ${v.nom} : ce qu'il y a à voir, à quelle distance, et les adresses sur place.`
        : undefined),
    image: v?.cover_url ?? undefined,
    url: `/explorer?ville=${encodeURIComponent(slug)}`,
  });

  if (etat === "absente") return <Introuvable quoi="Destination inconnue" />;

  return (
    <div className="px-4 py-5">
      <Ariane
        crans={[
          { nom: "Madagascar", to: "/explorer" },
          ...(cranRegion
            ? [{ nom: cranRegion.nom, to: `/explorer?region=${encodeURIComponent(cranRegion.slug)}` }]
            : []),
          { nom: v?.nom ?? "Ville" },
        ]}
      />

      {/* ⚠ LA PHOTO QUAND ELLE EXISTE, L'APLAT SINON — et le crédit AVEC la
          photo. Un cadre gris « image manquante » signalerait un défaut là où
          il n'y a qu'une donnée non saisie. */}
      {v && (
        <div className="relative mt-2 flex h-36 items-center justify-center overflow-hidden rounded-2xl bg-primary md:h-48">
          {v.cover_url && (
            <>
              <img
                src={v.cover_url}
                srcSet={jeuDeTailles(v.cover_url) ?? undefined}
                sizes="(min-width: 768px) 900px, 100vw"
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover"
                loading="eager"
                /* La couverture est le plus gros élément de l'écran : c'est
                   elle qui décide du LCP. */
                fetchPriority="high"
              />
              {/* Le voile n'est pas décoratif : le titre est blanc, et sur une
                  plage surexposée il devient illisible sans lui. */}
              <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
            </>
          )}
          <h1 className="relative px-6 text-center text-2xl font-semibold text-primary-foreground drop-shadow md:text-3xl">
            {v.nom}
          </h1>
          {v.cover_credit && (
            <p className="absolute bottom-1 right-2 text-[10px] text-white/75">{v.cover_credit}</p>
          )}
        </div>
      )}

      {v?.summary && <p className="dk-corps mt-3 max-w-[70ch]">{v.summary}</p>}

      {v && (
        <Link
          to={`/lieu/${v.slug}`}
          className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-semibold hover:border-primary hover:text-primary"
        >
          <Compass className="h-4 w-4" aria-hidden="true" />
          Fiche complète de {v.nom}
        </Link>
      )}

      {etat === "erreur" && <EtatErreur className="mt-5" onReessayer={() => void charger()} />}
      {etat === "chargement" && <Squelettes hauteur="h-52" />}

      {etat === "ok" && detail && detail.destinations.length > 0 && (
        <section className="mt-6">
          <h2 className="dk-etiquette">
            {pluriel(detail.destinations.length, "destination")} autour
          </h2>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 large:grid-cols-4">
            {dest.visibles.map((d) => (
              <li key={d.slug}>
                <Carte
                  to={`/lieu/${d.slug}`}
                  nom={d.nom}
                  etiquette={genre(d.kind)}
                  resume={d.summary}
                  cover={d.cover_url}
                  credit={d.cover_credit}
                  icone={MapPin}
                  metas={[
                    // ⚠ ZÉRO KILOMÈTRE EST UNE VRAIE RÉPONSE : la destination
                    //   est dans la ville même. « à 0 km » se lirait comme une
                    //   donnée manquante, ce qu'elle n'est pas.
                    d.km === null ? null : d.km === 0 ? "sur place" : `à ${nombre(d.km)} km`,
                    d.nb_etablissements > 0
                      ? pluriel(d.nb_etablissements, "établissement")
                      : null,
                    d.nb_recits > 0 ? pluriel(d.nb_recits, "récit") : null,
                  ]}
                />
              </li>
            ))}
          </ul>
          <BoutonPlus volee={dest} mot="destination" />
        </section>
      )}

      {etat === "ok" && detail && detail.destinations.length === 0 && (
        <EmptyState
          className="mt-6"
          icone={Compass}
          manque={`Aucune destination n'est rattachée à ${v?.nom ?? "cette ville"} pour l'instant.`}
          action={
            cranRegion
              ? {
                  libelle: `Revenir à ${cranRegion.nom}`,
                  lien: `/explorer?region=${encodeURIComponent(cranRegion.slug)}`,
                }
              : { libelle: "Voir toutes les régions", lien: "/explorer" }
          }
          contenuReel={
            <>
              <p className="dk-secondaire leading-relaxed">
                Rien n'est encore rattaché ici, mais la fiche du lieu porte déjà
                sa saison, ses accès et les adresses qui s'y trouvent.
              </p>
              {v && (
                <Link
                  to={`/lieu/${v.slug}`}
                  className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-semibold"
                >
                  <Compass className="h-4 w-4" aria-hidden="true" />
                  Fiche de {v.nom}
                </Link>
              )}
            </>
          }
        />
      )}
    </div>
  );
}

/* ══ LES PIÈCES COMMUNES ══════════════════════════════════════════════════ */

/**
 * LE FIL D'ARIANE — Madagascar › Diana › Nosy Be, chaque cran cliquable.
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

/**
 * LA CARTE D'UN PALIER — région, ville ou destination.
 *
 * ⚠ LA VIGNETTE OCCUPE TOUJOURS SA PLACE, avec la photo si elle existe et un
 *   aplat sinon. La règle précédente — pas de bandeau sans photo — produisait
 *   une grille où des cartes hautes et des cartes courtes alternaient au
 *   hasard des photos saisies, ce qui se lit comme un défaut d'affichage.
 *   L'aplat porte une icône et la couleur de marque : il ne ressemble pas à
 *   une image cassée, et il ne prétend pas remplacer une photo.
 */
function Carte({
  to,
  nom,
  etiquette,
  resume,
  cover,
  credit,
  icone: Icone,
  metas,
}: {
  to: string;
  nom: string;
  etiquette: string;
  resume?: string | null;
  cover: string | null;
  credit: string | null;
  icone: typeof MapPin;
  /** Les `null` sont écartés ici : un compteur à zéro ne se dit pas. */
  metas: (string | null)[];
}) {
  const vus = metas.filter((m): m is string => !!m);
  return (
    <Link
      to={to}
      className="dk-reveal dk-carte group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="dk-zoom relative h-32 w-full bg-secondary">
        {cover ? (
          <>
            <img
              src={cover}
              srcSet={jeuDeTailles(cover) ?? undefined}
              sizes="(min-width: 1920px) 25vw, (min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="h-full w-full object-cover"
            />
            {/* Le crédit voyage AVEC la photo : dans un pied de page global il
                se perdrait au premier remaniement. */}
            {credit && (
              <p className="absolute bottom-1 right-2 text-[10px] text-white/75 drop-shadow">
                {credit}
              </p>
            )}
          </>
        ) : (
          <span className="grid h-full w-full place-items-center">
            <Icone className="h-7 w-7 text-primary/35" aria-hidden="true" />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="dk-etiquette">{etiquette}</p>
        <h3 className="mt-0.5 font-semibold leading-tight">{nom}</h3>
        {resume && <p className="dk-secondaire mt-1.5 line-clamp-2">{resume}</p>}
        {vus.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-3 text-xs text-muted-foreground">
            {vus.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

/**
 * LE « VOIR PLUS » D'UNE VOLÉE.
 *
 * ⚠ IL NE REDEMANDE RIEN AU SERVEUR : la fonction a déjà rendu le tableau
 *   complet du palier, on n'en montrait qu'une partie. Le libellé annonce donc
 *   un reste EXACT, pas une promesse.
 */
function BoutonPlus<T>({ volee, mot }: { volee: Volee<T>; mot: string }) {
  if (volee.reste === 0) return null;
  return (
    <div className="mt-4 flex justify-center">
      <button
        onClick={volee.plus}
        className="min-h-11 rounded-full border border-input px-6 text-sm font-semibold hover:border-primary hover:text-primary"
      >
        Voir {volee.reste > PAR_VOLEE ? `${PAR_VOLEE} ` : ""}
        {mot}
        {volee.reste > PAR_VOLEE ? "s" : ""} de plus — {pluriel(volee.reste, "restant")}
      </button>
    </div>
  );
}

function Squelettes({ hauteur }: { hauteur: string }) {
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 large:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={cn("dk-skeleton rounded-2xl", hauteur)} />
      ))}
    </div>
  );
}

/** ⚠ Une adresse partagée peut viser un slug qui n'existe plus : on le dit, et
 *  on donne le chemin du retour — jamais une grille vide. */
function Introuvable({ quoi }: { quoi: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">{quoi}</h1>
      <p className="dk-secondaire mt-2">
        Ce lien ne correspond à rien dans le référentiel — il a peut-être été
        renommé.
      </p>
      <Link
        to="/explorer"
        className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
      >
        Explorer Madagascar
      </Link>
    </div>
  );
}

interface Volee<T> {
  visibles: T[];
  reste: number;
  plus: () => void;
}

/**
 * Montrer une partie d'un tableau déjà chargé, et le reste à la demande.
 *
 * ⚠ LE COMPTEUR REPART À ZÉRO QUAND LE TABLEAU CHANGE. Sans cette remise,
 *   passer d'une région de 80 destinations à une région de 5 laisserait la
 *   volée à 80 : l'écran afficherait tout d'un coup, et le « voir plus »
 *   disparaîtrait sans raison visible.
 * ⚠ `visibles` est mémorisé : `useReveal` a besoin d'une référence qui ne
 *   change QUE lorsque les nœuds rendus changent.
 */
function useVolee<T>(liste: T[], pas = PAR_VOLEE): Volee<T> {
  const [n, setN] = useState(pas);
  useEffect(() => setN(pas), [liste, pas]);
  const visibles = useMemo(() => liste.slice(0, n), [liste, n]);
  return {
    visibles,
    reste: Math.max(0, liste.length - n),
    plus: () => setN((x) => x + pas),
  };
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
 *   utilise encore. La descente en trois paliers ne la remplace pas.
 *
 * 🔴 SEUL CHANGEMENT : `useReveal` reçoit maintenant les établissements. Il
 *    dépendait d'une liste qui restait vide sur cette branche : au moment où
 *    l'effet passait, aucune `FicheCard` n'était encore rendue, et celles qui
 *    arrivaient ensuite restaient à `opacity: 0` — invisibles jusqu'à ce que le
 *    filet de sécurité global les rattrape, 700 ms plus tard.
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
    titre: lieu ? lieu.name_fr : "Explorer Madagascar",
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
