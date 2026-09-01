import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Building2, ChevronDown, ChevronRight, Compass, MapPin, Mountain } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { EmptyState, EtatErreur } from "@/components/Etats";
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
 * VILLES ET VILLAGES — LA DESCENTE EN TROIS PALIERS : pays › région › ville.
 *
 * 🔴 CET ÉCRAN VIVAIT SUR /explorer SOUS LE NOM « DESTINATIONS », et c'était
 *    le contresens que le propriétaire a fini par nommer : une descente
 *    administrative (23 régions, leurs communes, leurs hameaux) n'est pas ce
 *    qu'on attend derrière « Destinations ». Le mot est rendu aux lieux
 *    emblématiques (/explorer, refait) ; la géographie habitée, elle, vit ici,
 *    sous son vrai nom. Le code des trois paliers est repris tel quel — seules
 *    les adresses, les intitulés et le vocabulaire changent : on dit « lieux »,
 *    plus « destinations ».
 *
 * ⚠ CHAQUE PALIER A SON ADRESSE, ET C'EST L'URL QUI PORTE L'ÉTAT.
 *   `/villes` · `/villes?region=diana` · `/villes?region=diana&ville=nosy-be`.
 *   Les anciennes adresses `/explorer?region=…` et `?ville=…` sont REDIRIGÉES
 *   ici par Explorer.tsx : un lien partagé avant le renommage arrive au même
 *   écran, paramètres compris.
 *
 * ⚠ LES COMPTEURS VIENNENT DES FONCTIONS, JAMAIS DU TABLEAU AFFICHÉ — voir
 *   `lib/explorer.ts` : PostgREST plafonne une réponse à 1 000 lignes sans le
 *   dire, et « 81 lieux » sous une carte doit rester le total réel.
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

/** « lieu » prend un x — `pluriel()` fabriquerait « lieus ». */
const lieux = (n: number) => `${nombre(n)} lieu${n > 1 ? "x" : ""}`;

/* ══ LE ROUTEUR DES PALIERS ═══════════════════════════════════════════════ */

export default function Villes() {
  const [params] = useSearchParams();
  const ville = params.get("ville");
  const region = params.get("region");

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
      ? `Villes et villages de Madagascar — ${lieux(total)} référencés`
      : "Villes et villages de Madagascar",
    description:
      "Madagascar région par région : les villes et villages, ce qu'il y a à voir autour de chacun, et les adresses sur place.",
    url: "/villes",
  });

  return (
    <div className="px-4 py-5">
      <p className="dk-etiquette">Découvrir</p>
      <div className="mt-1 flex items-center gap-2">
        <Building2 className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
        <h1 className="dk-titre">Villes et villages</h1>
      </div>
      <p className="dk-corps mt-2 max-w-[70ch] text-muted-foreground">
        {liste.length > 0
          ? `${pluriel(liste.length, "région")} · ${lieux(total)} référencés.`
          : "Le pays région par région."}{" "}
        Ouvrez une région pour voir ses villes, puis une ville pour voir ce
        qu'il y a autour.
      </p>
      {/* Le renvoi inverse de celui de /explorer : qui cherche une plage ou un
          parc n'a rien à faire dans la géographie communale. */}
      <p className="dk-secondaire mt-1.5">
        Vous cherchez plutôt les lieux à visiter ?{" "}
        <Link to="/explorer" className="font-semibold text-primary underline underline-offset-4">
          Voir les destinations
        </Link>
      </p>

      {etat === "erreur" && <EtatErreur className="mt-5" onReessayer={() => void charger()} />}

      {etat === "chargement" && <Squelettes hauteur="h-52" />}

      {/* 🔴 LES CINQ BANDES SONT REPLIÉES — voir l'historique sur /explorer :
             ouvertes, c'étaient 23 cartes à couverture photo avant de
             comprendre qu'il y a une structure.
          ⚠ `<details>` NATIF, PAS UN ÉTAT REACT : clavier, rôle ARIA, recherche
            dans la page et impression viennent avec.
          ⚠ ET LES IMAGES NE PARTENT PAS TANT QUE LA BANDE EST FERMÉE : le
            contenu d'un `<details>` fermé n'est pas rendu. C'est le vrai gain
            sur une 3G. */}
      {etat === "ok" &&
        groupes.map((g) => (
          <details key={g.titre} className="group mt-3 rounded-2xl border border-border bg-card">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex items-center gap-2.5">
                <Mountain className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-left">
                  <span className="block font-bold leading-tight">{g.titre}</span>
                  <span className="dk-secondaire block text-muted-foreground">
                    {pluriel(g.cartes.length, "région")} ·{" "}
                    {lieux(g.cartes.reduce((s, r) => s + r.nb_destinations, 0))}
                  </span>
                </span>
              </span>
              {/* `aria-hidden` : `<summary>` annonce déjà l'état plié/déplié. */}
              <ChevronDown
                className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <ul className="grid gap-3 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-3 large:grid-cols-4">
              {g.cartes.map((r) => (
                <li key={r.slug}>
                  <Carte
                    to={`/villes?region=${encodeURIComponent(r.slug)}`}
                    nom={r.nom}
                    etiquette="Région"
                    cover={r.cover_url}
                    credit={r.cover_credit}
                    icone={Mountain}
                    metas={[
                      lieux(r.nb_destinations),
                      r.nb_etablissements > 0
                        ? pluriel(r.nb_etablissements, "établissement")
                        : null,
                    ]}
                  />
                </li>
              ))}
            </ul>
          </details>
        ))}

      {etat === "ok" && liste.length === 0 && (
        <EmptyState
          className="mt-6"
          icone={Compass}
          manque="Aucune région n'est encore ouverte à l'exploration."
          action={{ libelle: "Voir les destinations", lien: "/explorer" }}
          contenuReel={
            <>
              <p className="dk-secondaire leading-relaxed">
                Le découpage par région se remplit au fur et à mesure que les
                lieux sont rattachés. En attendant, les destinations, les parcs
                et les plages sont déjà consultables un par un.
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
    titre: nom ? `${nom} — villes et villages` : "Villes et villages de Madagascar",
    description: detail
      ? `${lieux(detail.region.nb_destinations)} référencés dans la région ${nom} : ses villes, ses villages, et ce qu'il y a autour de chacun.`
      : undefined,
    url: `/villes?region=${encodeURIComponent(slug)}`,
  });

  if (etat === "absente") return <Introuvable quoi="Région inconnue" />;

  return (
    <div className="px-4 py-5">
      <Ariane crans={[{ nom: "Madagascar", to: "/villes" }, { nom: nom || "Région" }]} />

      <h1 className="dk-titre mt-2">{nom || "Région"}</h1>
      {detail && (
        <p className="dk-corps mt-2 max-w-[70ch] text-muted-foreground">
          {lieux(detail.region.nb_destinations)} référencés dans la région.
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
                      to={`/villes?region=${encodeURIComponent(detail.region.slug)}&ville=${encodeURIComponent(v.slug)}`}
                      nom={v.nom}
                      etiquette={genre(v.kind)}
                      resume={v.summary}
                      cover={v.cover_url}
                      credit={v.cover_credit}
                      icone={MapPin}
                      metas={[
                        lieux(v.nb_destinations) + " autour",
                        v.nb_etablissements > 0
                          ? pluriel(v.nb_etablissements, "établissement")
                          : null,
                        v.nb_recits > 0 ? pluriel(v.nb_recits, "récit") : null,
                      ]}
                    />
                  </li>
                ))}
              </ul>
              <BoutonPlus volee={villes} mot="ville" mots="villes" />
            </section>
          )}

          {detail.ailleurs.length > 0 && (
            <section className="mt-8">
              <h2 className="dk-etiquette">Ailleurs dans la région</h2>
              {/* ⚠ CE N'EST PAS UN FOURRE-TOUT : ce sont les lieux qu'aucune
                  ville ne peut accueillir — un massif, une île, un parc à
                  cheval sur plusieurs communes. Les taire les rendrait
                  inatteignables depuis la descente. */}
              <p className="dk-secondaire mt-1 max-w-[70ch]">
                Ces lieux ne dépendent d'aucune ville de la région.
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
              <BoutonPlus volee={ailleurs} mot="lieu" mots="lieux" />
            </section>
          )}

          {/* 🔴 UNE GRILLE VIDE N'EST PAS UN RÉSULTAT, C'EST UNE PANNE
              APPARENTE — le signalement d'Analamanga : rien à l'écran, et rien
              pour dire quoi faire. */}
          {detail.villes.length === 0 && detail.ailleurs.length === 0 && (
            <EmptyState
              className="mt-6"
              icone={Compass}
              manque={`Aucun lieu n'est encore rattaché à ${nom}.`}
              action={{ libelle: "Voir toutes les régions", lien: "/villes" }}
              contenuReel={
                <>
                  <p className="dk-secondaire leading-relaxed">
                    Le référentiel ne couvre pas encore cette région. Les
                    destinations, les parcs et les plages du pays restent
                    consultables un par un, et la carte montre ce qui est déjà
                    documenté autour.
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

/* ══ ③ CE QU'IL Y A AUTOUR D'UNE VILLE ════════════════════════════════════ */

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
    titre: v ? `${v.nom} — que voir autour` : "Villes et villages de Madagascar",
    description:
      v?.summary ??
      (v
        ? `Ce qu'il y a à voir autour de ${v.nom}, à quelle distance, et les adresses sur place.`
        : undefined),
    image: v?.cover_url ?? undefined,
    url: `/villes?ville=${encodeURIComponent(slug)}`,
  });

  if (etat === "absente") return <Introuvable quoi="Ville inconnue" />;

  return (
    <div className="px-4 py-5">
      <Ariane
        crans={[
          { nom: "Madagascar", to: "/villes" },
          ...(cranRegion
            ? [{ nom: cranRegion.nom, to: `/villes?region=${encodeURIComponent(cranRegion.slug)}` }]
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
            {lieux(detail.destinations.length)} à voir autour
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
                    // ⚠ ZÉRO KILOMÈTRE EST UNE VRAIE RÉPONSE : le lieu est dans
                    //   la ville même. « à 0 km » se lirait comme une donnée
                    //   manquante, ce qu'elle n'est pas.
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
          <BoutonPlus volee={dest} mot="lieu" mots="lieux" />
        </section>
      )}

      {etat === "ok" && detail && detail.destinations.length === 0 && (
        <EmptyState
          className="mt-6"
          icone={Compass}
          manque={`Rien n'est encore rattaché autour de ${v?.nom ?? "cette ville"}.`}
          action={
            cranRegion
              ? {
                  libelle: `Revenir à ${cranRegion.nom}`,
                  lien: `/villes?region=${encodeURIComponent(cranRegion.slug)}`,
                }
              : { libelle: "Voir toutes les régions", lien: "/villes" }
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
 * LA CARTE D'UN PALIER — région, ville ou lieu.
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
 * ⚠ `mots` porte le pluriel écrit en toutes lettres : « lieu » prend un x, et
 *   un `+ "s"` mécanique écrirait « lieus ».
 */
function BoutonPlus<T>({ volee, mot, mots }: { volee: Volee<T>; mot: string; mots: string }) {
  if (volee.reste === 0) return null;
  return (
    <div className="mt-4 flex justify-center">
      <button
        onClick={volee.plus}
        className="min-h-11 rounded-full border border-input px-6 text-sm font-semibold hover:border-primary hover:text-primary"
      >
        Voir {volee.reste > PAR_VOLEE ? `${PAR_VOLEE} ${mots}` : volee.reste > 1 ? mots : mot} de
        plus — {pluriel(volee.reste, "restant")}
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
        to="/villes"
        className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
      >
        Toutes les régions
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
 *   passer d'une région de 80 lieux à une région de 5 laisserait la volée à
 *   80 : l'écran afficherait tout d'un coup, et le « voir plus » disparaîtrait
 *   sans raison visible.
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
