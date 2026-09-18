import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bus, Compass, MapPin, Plane, RefreshCw, Ship, Utensils } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRetour } from "@/hooks/useRetour";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { EtatErreur, Squelettes } from "@/components/Etats";
import { recitsDuLieu } from "@/lib/etablissements";
import { ProposerPhoto } from "@/components/ProposerPhoto";
import { ImageProgressive } from "@/components/ImageProgressive";
import { AdressesProches } from "@/components/AdressesProches";
import { BoutonPartager, CouvertureFiche, LigneAccueil } from "@/components/Arrivee";
import { SITE_URL, de, distanceArrondie, dureeLisible, lienCarte, venuDuSite } from "@/lib/arrivee";
import { libelleTypeCourt } from "@/lib/sites";
import { noterLieu } from "@/lib/affinites";
import { cn } from "@/lib/utils";

/**
 * LA FICHE D'UNE DESTINATION — /lieu/:slug (écran C1 de la maquette).
 *
 * ⚠ POURQUOI CET ÉCRAN COMPTE PLUS QUE LES AUTRES. Le référentiel des lieux
 *   — leur saisonnalité mois par mois, leurs accès avec des temps de route
 *   RÉELS — est le fossé défensif du produit (TDR §1.5) : personne d'autre ne
 *   l'a et personne ne le copie en une semaine.
 *
 * ⚠ C'EST UNE PAGE D'ARRIVÉE. Depuis le 19/09/2026, 30 publications Facebook
 *   renvoient vers 20 pages /lieu : on y arrive sans compte, sans historique,
 *   dans le navigateur intégré de Facebook, sur un Android d'entrée de gamme.
 *   Le premier écran doit donc dire ce qu'est Diako, montrer le lieu, et offrir
 *   « Où dormir / Où manger » sans défiler.
 *
 * ⚠ CE QUI EST HONNÊTE ICI. Peu de destinations ont leur saisonnalité ou leurs
 *   accès saisis. Les deux sections restent en place quand elles sont vides
 *   (la page ne change pas de forme selon la base) et le disent en une ligne,
 *   avec une action — plutôt que douze cases grises qui ressembleraient à
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

const LIBELLE_MODE: Record<string, string> = {
  goudron: "Route goudronnée",
  piste: "Piste",
  "4x4": "4×4",
  avion: "Avion",
  bateau: "Bateau",
  pirogue: "Pirogue",
  train: "Train",
};

interface Fiche {
  lieu: {
    /* ⚠ L'UUID, et pas seulement le slug : `dk_proposer_photo()` vise la ligne
       par son identifiant, et « À voir » cherche les sites par `place_id`. Il
       arrive de `fiche_destination`, qui rend `to_jsonb(p) - 'norm'`. */
    id: string;
    slug: string; name_fr: string; name_mg: string | null; kind: string;
    region: string | null; summary: string | null; why_go: string[] | null;
    lat: number | null; lng: number | null;
    /* ⚠ `fiche_destination` rend TOUTE colonne de `places` : licence et source
       de la photo arrivent donc aussi, sans migration. Déclarées optionnelles
       parce que rien dans le contrat ne les garantit. */
    cover_url: string | null; cover_credit: string | null;
    cover_licence?: string | null; cover_source?: string | null;
  };
  saisons: { mois: number; note: keyof typeof NOTE | null; raison: string | null }[];
  /* ⭐ CE QUI SE PASSE ICI (migration 0112). */
  evenements: {
    slug: string; titre: string; periode: string | null; mois: number[] | null;
    annuel: boolean; resume: string | null; affiche: string | null;
    credit: string | null; lieu_libre: string | null; source: string | null;
  }[];
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

type Recit = Awaited<ReturnType<typeof recitsDuLieu>>[number];

interface SiteAVoir {
  slug: string;
  name: string;
  kind: string;
  cover_url: string | null;
  /** Distance à vol d'oiseau, seulement pour les sites « autour ». */
  km?: number;
}

/**
 * 🔴 UNE PHOTO REPRISE D'UNE PUBLICATION FACEBOOK NE MONTRE PAS LE SITE.
 *    84 sites portent la « licence » « Publication Facebook — reprise avec
 *    attribution » (compté le 19/09/2026) : une chambre d'hôtel de Tamatave pour
 *    Nosy Volana, la voiture d'un loueur pour le monument du 29 mars 1947. Ce
 *    n'est pas une licence, et l'image trompe. En vignette, on pose le lamba.
 */
function vignetteHonnete(s: { cover_url: string | null; cover_licence?: string | null }): string | null {
  if (!s.cover_url) return null;
  if (s.cover_licence && /^publication facebook/i.test(s.cover_licence)) return null;
  return s.cover_url;
}

/** Rayon des sites « autour » quand aucun n'est rattaché au lieu. */
const SITES_RAYON_KM = 20;

function kmEntre(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** Le nombre de sites montrés dans « À voir ». Le reste est sur la carte. */
const SITES_MAX = 6;

/** La date du jour, locale, au format des colonnes `date` (AAAA-MM-JJ). */
function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Destination() {
  const { slug } = useParams<{ slug: string }>();
  const [f, setF] = useState<Fiche | null>(null);
  const [recits, setRecits] = useState<Recit[]>([]);
  const [etat, setEtat] = useState<"chargement" | "ok" | "absente" | "erreur">("chargement");
  const [sites, setSites] = useState<{ liste: SiteAVoir[]; total: number; erreur: boolean; autour?: boolean } | null>(null);
  /** Les événements dont la date de fin est passée. `null` = pas encore vérifié. */
  const [finis, setFinis] = useState<Set<string> | null>(null);
  /**
   * 🔴 ARRIVÉ DE FACEBOOK, IL N'Y A PAS D'HISTORIQUE. Le bouton « Retour »
   *    prenait 76 px au-dessus de la photo pour ramener… à l'annuaire, que le
   *    visiteur n'avait jamais vu. On ne le montre qu'à qui vient d'une page
   *    du site ; les autres lisent à sa place ce qu'est Diako.
   * ⚠ Lu une fois au montage : l'état de l'historique ne change pas pendant
   *   qu'on lit la page.
   */
  const [interne] = useState(venuDuSite);
  // ⚠ Seules les sections qui dépendent de `f` portent `.dk-reveal` : celles
  //   qui arrivent plus tard (sites, récits, adresses proches, événements
  //   vérifiés) ne seraient jamais observées et resteraient à opacity 0.
  useReveal(f);

  /**
   * 🔴 LE MÊME LIEU AVAIT DEUX ÉCRANS, ET UN SEUL SAVAIT SORTIR. Repli sur
   *    l'annuaire des destinations : c'est de là qu'on arrive presque toujours.
   */
  const retour = useRetour("/explorer");

  const charger = useCallback(async () => {
    if (!slug) return;
    setEtat("chargement");
    // ⚠ public/app-init.js a peut-être déjà demandé CETTE fiche, avant React
    //   (arrivée directe depuis Facebook). On la prend une seule fois ; un
    //   échec ou une autre page retombe sur l'appel normal.
    const w = window as unknown as { __dkFiche?: Promise<unknown> | null; __dkFicheCle?: string };
    const pre = w.__dkFicheCle === `lieu:${slug}` ? w.__dkFiche : null;
    w.__dkFiche = null;
    const deja = pre ? await pre.catch(() => null) : null;
    if (deja && typeof deja === "object" && "lieu" in deja) {
      setF(deja as unknown as Fiche);
      setEtat("ok");
      return;
    }
    const { data, error } = await supabase.rpc("fiche_destination", { p_slug: slug });
    if (error) return setEtat("erreur");
    if (!data) return setEtat("absente");
    setF(data as unknown as Fiche);
    setEtat("ok");
  }, [slug]);

  useEffect(() => {
    void charger();
  }, [charger]);

  // ⚠ Chargement SÉPARÉ de la fiche : les récits ne doivent pas retarder
  //   l'affichage du reste, et leur absence ne casse rien.
  useEffect(() => {
    if (!f?.lieu?.slug) return;
    // ⭐ Ouvrir une destination, c'est dire qu'elle compte : le fil la
    //   montrera d'abord (voir `affinites.ts`).
    noterLieu(f.lieu.slug, 2);
    noterLieu(f.lieu.name_fr, 2);
    void recitsDuLieu(f.lieu.slug, 6).then(setRecits).catch(() => undefined);
  }, [f?.lieu?.slug, f?.lieu?.name_fr]);

  /**
   * « À VOIR » — les sites rattachés au lieu.
   *
   * 🔴 2 447 SITES PUBLIÉS SONT RATTACHÉS À UN LIEU, et la fiche du lieu n'en
   *    montrait aucun. Le visiteur venu pour Andasibe ne voyait ni la réserve
   *    ni les cascades — qui avaient chacune leur fiche.
   * ⚠ Les sites AVEC photo d'abord (`nulls last`), puis par nom : l'ordre est
   *   total, la liste ne saute pas d'un chargement à l'autre.
   * ⚠ Le total vient de `count`, pas de la longueur du tableau reçu, qui est
   *   plafonné à six.
   */
  const lieuLat = f?.lieu?.lat ?? null;
  const lieuLng = f?.lieu?.lng ?? null;
  useEffect(() => {
    const id = f?.lieu?.id;
    if (!id) return;
    let vivant = true;
    setSites(null);
    /* 🔴 « AUCUN SITE RATTACHÉ » SUR UNE PAGE D'ARRIVÉE. /lieu/mer-d-emeraude
       (publication du 19/09) n'a aucun site rattaché, alors que le site « Mer
       d'Émeraude » existe à 6,8 km, rattaché à un autre lieu. On retombe alors
       sur les sites publiés les plus proches, par coordonnées, en le disant. */
    const autour = async (lat: number, lng: number) => {
      const d = 0.2; // ~22 km : le cadre de recherche, le rayon vient après
      const { data } = await supabase
        .from("attractions")
        .select("slug, name, kind, cover_url, cover_licence, lat, lng")
        .eq("is_published", true)
        .gte("lat", lat - d)
        .lte("lat", lat + d)
        .gte("lng", lng - d)
        .lte("lng", lng + d)
        .limit(80);
      const proches = ((data ?? []) as (SiteAVoir & { lat: number | null; lng: number | null; cover_licence: string | null })[])
        .filter((s) => s.lat != null && s.lng != null)
        .map((s) => ({
          slug: s.slug,
          name: s.name,
          kind: s.kind,
          cover_url: vignetteHonnete(s),
          km: kmEntre({ lat, lng }, { lat: s.lat as number, lng: s.lng as number }),
        }))
        .filter((s) => s.km <= SITES_RAYON_KM)
        .sort((a, b) => a.km - b.km);
      return proches;
    };
    void supabase
      .from("attractions")
      .select("slug, name, kind, cover_url, cover_licence", { count: "exact" })
      .eq("place_id", id)
      .eq("is_published", true)
      .order("cover_url", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true })
      .limit(SITES_MAX)
      .then(({ data, count, error }) => {
        if (!vivant) return;
        if (error) {
          setSites({ liste: [], total: 0, erreur: true });
          return;
        }
        const liste = ((data ?? []) as (SiteAVoir & { cover_licence: string | null })[])
          .map((s) => ({ slug: s.slug, name: s.name, kind: s.kind, cover_url: vignetteHonnete(s) }))
          // Photos honnêtes d'abord ; l'ordre reste stable (nom) à photo égale.
          .sort((a, b) => Number(!a.cover_url) - Number(!b.cover_url));
        if (liste.length === 0 && lieuLat != null && lieuLng != null) {
          void autour(lieuLat, lieuLng)
            .then((proches) => {
              if (!vivant) return;
              setSites({ liste: proches.slice(0, SITES_MAX), total: proches.length, erreur: false, autour: true });
            })
            .catch(() => {
              if (vivant) setSites({ liste: [], total: 0, erreur: false });
            });
          return;
        }
        setSites({ liste, total: count ?? liste.length, erreur: false });
      });
    return () => {
      vivant = false;
    };
  }, [f?.lieu?.id, lieuLat, lieuLng]);

  /**
   * ⚠ UN ÉVÉNEMENT TERMINÉ NE S'AFFICHE PLUS. `fiche_destination` ne rend pas
   *   la date de fin : on la lit à part, colonnes explicites, pour les seuls
   *   événements de la fiche. Un événement ANNUEL n'est jamais « terminé » : sa
   *   date de fin est celle de la dernière édition. En cas d'échec de la
   *   lecture, on montre tout plutôt que rien.
   */
  const evenements = f?.evenements;
  useEffect(() => {
    if (!evenements) return;
    if (evenements.length === 0) {
      setFinis(new Set());
      return;
    }
    let vivant = true;
    setFinis(null);
    void supabase
      .from("events")
      .select("slug, ends_on, yearly")
      .in(
        "slug",
        evenements.map((e) => e.slug)
      )
      .then(({ data, error }) => {
        if (!vivant) return;
        if (error || !data) {
          setFinis(new Set());
          return;
        }
        const jour = aujourdhui();
        setFinis(
          new Set(data.filter((e) => !e.yearly && e.ends_on && e.ends_on < jour).map((e) => e.slug))
        );
      });
    return () => {
      vivant = false;
    };
  }, [evenements]);

  useSEO({
    titre: f ? `${f.lieu.name_fr} — où dormir et où manger` : "Destination",
    // Une fiche inexistante rend HTTP 200 (repli SPA) : `noindex` évite le soft 404 (audit 05/09/2026).
    noindex: etat === "absente",
    // ⚠ Plus de prix « à partir de » ici : un prix ne voyage jamais sans sa date.
    description: f
      ? f.lieu.summary ??
        `${f.lieu.name_fr}${f.lieu.region ? ` (${f.lieu.region})` : ""} — la fiche du lieu sur Diako.`
      : undefined,
    image: f?.lieu.cover_url ?? undefined,
    type: f ? "article" : "website",
    url: slug ? `/lieu/${slug}` : undefined,
  });

  /**
   * La pastille « N récits — les lire » mène au bloc VISIBLE : sous 1920 px il
   * est dans la colonne principale, au-delà dans la troisième colonne. Deux
   * identifiants, un seul affiché à la fois ; le lien `#recits` reste le repli.
   */
  const allerAuxRecits = (e: MouseEvent<HTMLAnchorElement>) => {
    const cible = ["recits", "recits-colonne"]
      .map((id) => document.getElementById(id))
      .find((el) => el !== null && el.offsetParent !== null);
    if (!cible) return;
    e.preventDefault();
    cible.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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

  const nom = f.lieu.name_fr;
  const gps = f.lieu.lat != null && f.lieu.lng != null ? { lat: f.lieu.lat, lng: f.lieu.lng } : null;
  const saisonsRenseignees = f.saisons.filter((s) => s.note);
  const moisCourant = f.saisons[new Date().getMonth()];
  // ⚠ Un tableau jsonb peut porter un `null` égaré : on ne garde que du texte.
  const raisons = (f.lieu.why_go ?? [])
    .filter((r): r is string => typeof r === "string")
    .map((r) => r.trim())
    .filter(Boolean);
  const evenementsVisibles = finis ? f.evenements.filter((ev) => !finis.has(ev.slug)) : [];
  const lienPublier = `/publier?lieu=${encodeURIComponent(f.lieu.slug)}`;

  /**
   * « Où dormir / Où manger ».
   *
   * 🔴 QUAND LE COMPTE EXACT VAUT ZÉRO, LE BOUTON MÈNE AUTOUR. Le compte ne
   *    prend que les adresses RATTACHÉES au lieu : 15 lieux sur 20 de la série
   *    affichaient « (0) » avec des hôtels à quelques kilomètres. « Où dormir
   *    (0) » disait « rien ici » ; « Où dormir autour » ouvre la carte centrée
   *    sur le lieu, filtrée sur la bonne famille.
   * ⚠ Rendu DEUX fois — colonne principale sous `xl`, colonne des repères à
   *   partir de `xl` — et jamais visible deux fois à la même largeur.
   */
  const boutonsDormirManger = (className: string) => {
    const bouton = (
      n: number,
      famille: "dormir" | "manger",
      cat: "hotel" | "restaurant",
      mot: string,
      Icone: typeof MapPin,
      plein: boolean
    ) => {
      const lienAutour = n === 0 && gps ? lienCarte(gps.lat, gps.lng, [famille]) : null;
      const autour = lienAutour !== null;
      const lien = lienAutour ?? `/recherche?q=${encodeURIComponent(nom)}&cat=${cat}`;
      return (
        <Link
          to={lien}
          className={cn(
            "inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full px-3 text-center text-sm font-semibold leading-tight",
            n > 0
              ? plein
                ? "bg-primary text-primary-foreground"
                : "border border-primary text-primary"
              : autour
                ? "border border-primary text-primary"
                : "border border-input text-muted-foreground"
          )}
        >
          <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
          {autour ? `${mot} autour` : `${mot} (${n})`}
        </Link>
      );
    };
    return (
      <div className={className}>
        {bouton(f.nb_ou_dormir, "dormir", "hotel", "Où dormir", MapPin, true)}
        {bouton(f.nb_ou_manger, "manger", "restaurant", "Où manger", Utensils, false)}
      </div>
    );
  };

  /* ── Blocs rendus à deux endroits (colonne principale sous `large`, troisième
        colonne à partir de `large`). Un seul est visible à une largeur donnée. */

  const blocAlentours = () =>
    f.enfants.length > 0 ? (
      <section>
        <h2 className="dk-etiquette">Aux alentours</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {f.enfants.map((e) => (
            <li key={e.slug}>
              <Link
                to={`/lieu/${e.slug}`}
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border px-3 text-sm hover:border-primary hover:text-primary"
              >
                <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                {e.nom}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  const blocRaconter = () => (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h2 className="dk-etiquette">Raconter</h2>
      <p className="dk-secondaire mt-2 leading-relaxed">
        Vous connaissez {nom} ? Un récit, un tarif relevé, une route praticable :
        c'est ce qui construit la fiche.
      </p>
      {/* ⭐ LE LIEU PART AVEC LE LIEN : un récit publié sans `place_id` n'est
             atteignable ni depuis la fiche du lieu, ni par la carte, ni par
             « près de moi ». */}
      <Link
        to={lienPublier}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-input text-sm font-semibold"
      >
        Publier un récit
      </Link>

      {/* ⭐ LA PHOTO SE DEMANDE ICI, À CÔTÉ DU RÉCIT : la plupart des
             destinations n'ont aucune couverture, et les gens qui y sont allés
             sont la seule source qui reste. */}
      <ProposerPhoto
        className="mt-4 border-t border-border pt-4"
        cibleType="destination"
        cible={f.lieu.id}
        nom={nom}
      />
    </div>
  );

  const carteRecit = (r: Recit, largeur: string) => (
    <Link to={`/post/${r.id}`} className="dk-carte group block h-full">
      {r.media[0]?.url && (
        <span className="mb-2 block aspect-[16/10] overflow-hidden rounded-xl bg-muted">
          <ImageProgressive src={r.media[0].url} alt="" ajustement="cover" largeurAffichee={largeur} />
        </span>
      )}
      <span className="dk-secondaire block">
        {r.auteur || "Un voyageur"} · {new Date(r.created_at).toLocaleDateString("fr-FR")}
      </span>
      <span className="mt-0.5 line-clamp-3 block text-sm group-hover:text-primary">
        {r.body?.trim() || "(photo)"}
      </span>
    </Link>
  );

  return (
    /* ═══ GABARIT G3 — DOSSIER ÉDITORIAL ══════════════════════════════════
       620 sections + 340 repères + 250 « autour » à 1920.
       ⚠ Sous 1920, la troisième colonne n'existe pas : tout ce qu'elle porte
         (récits, alentours, raconter) est AUSSI rendu dans la colonne
         principale, masqué à `large`. Avant, les récits étaient invisibles
         sous 1920 px — c'est-à-dire sur tous les téléphones. */
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

        {/* ── La photo, bord à bord ; sans photo, un bandeau de lamba ───── */}
        <CouvertureFiche
          src={f.lieu.cover_url}
          alt={`${nom} — ${f.lieu.region ?? "Madagascar"}`}
          credit={f.lieu.cover_credit}
          licence={f.lieu.cover_licence}
          source={f.lieu.cover_source}
        />

        {/* ── Identité ─────────────────────────────────────────────────── */}
        <p className="dk-etiquette">
          {f.lieu.region ?? f.lieu.kind}
          {f.acces[0]?.km ? ` · à ${f.acces[0].km} km ${de(f.acces[0].depuis)}` : ""}
        </p>
        <h1 className="dk-titre mt-1">{f.lieu.name_fr}</h1>
        {f.lieu.name_mg && f.lieu.name_mg !== f.lieu.name_fr && (
          <p className="dk-secondaire mt-0.5">{f.lieu.name_mg}</p>
        )}

        {/* ── Partager, puis les pastilles — une seule rangée ──────────── */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <BoutonPartager url={`${SITE_URL}/lieu/${f.lieu.slug}`} texte={`${nom} sur Diako`} />
          {f.nb_recits > 0 && (
            <a
              href="#recits"
              onClick={allerAuxRecits}
              className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              {f.nb_recits} récit{f.nb_recits > 1 ? "s" : ""} — les lire
            </a>
          )}
          {/* ⚠ La pastille « dès … Ar/nuit » a été RETIRÉE (18/09/2026) : un
              prix ne voyage jamais sans son unité, sa base et sa date. */}
          {f.nb_pages > 0 && (
            <Link
              to={`/recherche?q=${encodeURIComponent(nom)}`}
              className="inline-flex min-h-11 items-center rounded-full bg-secondary px-4 text-sm font-semibold hover:text-primary"
            >
              {f.nb_pages} adresse{f.nb_pages > 1 ? "s" : ""}
            </Link>
          )}
        </div>

        {/* ── Où dormir / Où manger — dès le premier écran du téléphone ── */}
        {boutonsDormirManger("mt-3 grid grid-cols-2 gap-2 xl:hidden")}

        {f.lieu.summary && <p className="dk-corps mt-4 max-w-prose">{f.lieu.summary}</p>}

        {/* ── Pourquoi y aller — `why_go` était chargé et jamais affiché ── */}
        {raisons.length > 0 && (
          <section className="mt-4">
            <h2 className="dk-etiquette">Pourquoi y aller</h2>
            <ul className="mt-2 space-y-1.5">
              {raisons.map((r) => (
                <li key={r} className="flex gap-2 text-sm">
                  <span aria-hidden="true" className="text-primary">·</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── À voir : les sites rattachés au lieu ─────────────────────── */}
        <section className="mt-6">
          <h2 className="dk-etiquette">
            {sites?.autour ? "À voir autour" : "À voir"}
            {sites && sites.total > 0 ? ` (${sites.total})` : ""}
          </h2>
          {sites?.autour && sites.liste.length > 0 && (
            <p className="dk-secondaire mt-1">
              Les sites les plus proches de {nom}, à vol d'oiseau, dans un rayon de {SITES_RAYON_KM} km.
            </p>
          )}
          {sites === null ? (
            <div className="mt-2 grid grid-cols-2 gap-3" aria-busy="true">
              <div className="dk-skeleton aspect-[4/3] rounded-2xl" />
              <div className="dk-skeleton aspect-[4/3] rounded-2xl" />
            </div>
          ) : sites.liste.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {sites.erreur
                ? "Les sites à visiter n'ont pas pu être chargés."
                : `Aucun site à visiter n'est encore rattaché à ${nom}.`}{" "}
              <Link
                to="/sites"
                className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
              >
                Parcourir les sites de Madagascar
              </Link>
            </p>
          ) : (
            <>
              <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {sites.liste.map((s) => (
                  <li key={s.slug}>
                    <Link
                      to={`/site/${s.slug}`}
                      className="group block h-full overflow-hidden rounded-2xl border border-border bg-card hover:border-primary"
                    >
                      {/* ⚠ En vignette, pas de crédit dans la carte : il est
                          sous la photo, sur la page du site. */}
                      {s.cover_url ? (
                        <span className="block aspect-[4/3] bg-muted">
                          <ImageProgressive
                            src={s.cover_url}
                            alt=""
                            ajustement="cover"
                            largeurAffichee="(min-width:640px) 200px, 46vw"
                          />
                        </span>
                      ) : (
                        <span className="dk-lamba block aspect-[4/3]" aria-hidden="true" />
                      )}
                      <span className="block p-2.5">
                        <span className="line-clamp-2 block text-sm font-semibold leading-snug group-hover:text-primary">
                          {s.name}
                        </span>
                        <span className="dk-secondaire mt-0.5 block">
                          {libelleTypeCourt(s.kind)}
                          {s.km != null ? ` · ${distanceArrondie(s.km)}` : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {sites.total > sites.liste.length && gps && (
                <Link
                  to={lienCarte(gps.lat, gps.lng, ["plage", "nature", "sommet", "culture"])}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-input text-sm font-semibold hover:border-primary hover:text-primary"
                >
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  Les {sites.total} sites sur la carte
                </Link>
              )}
            </>
          )}
        </section>

        {/* ── ILS Y SONT ALLÉS — colonne principale, sous 1920 px ─────────
            ⚠ CE BLOC EST LA RAISON D'ÊTRE DU SITE : il vient de quelqu'un qui
              y est allé. Bandeau à défilement horizontal sur téléphone, grille
              de deux à `xl`, troisième colonne à `large`. */}
        {recits.length > 0 && (
          <section id="recits" className="mt-6 scroll-mt-20 large:hidden">
            <h2 className="dk-etiquette">Ils y sont allés</h2>
            <ul className="-mx-4 mt-2 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 xl:mx-0 xl:grid xl:grid-cols-2 xl:overflow-visible xl:px-0 xl:pb-0">
              {recits.map((r) => (
                <li
                  key={r.id}
                  className="w-[78%] shrink-0 snap-start rounded-2xl border border-border bg-card p-3 sm:w-[45%] xl:w-auto"
                >
                  {carteRecit(r, "(min-width:1280px) 300px, 78vw")}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Les adresses les plus proches ────────────────────────────── */}
        {gps && <AdressesProches lat={gps.lat} lng={gps.lng} nom={nom} />}

        {/* ── Ce qui s'y passe ─────────────────────────────────────────────
            ⚠ Le crédit de l'affiche est affiché : ces images viennent de
              Commons, en CC BY ou CC BY-SA, qui exigent de nommer l'auteur. */}
        {evenementsVisibles.length > 0 && (
          <section className="mt-6">
            <h2 className="dk-etiquette">Ce qui s'y passe</h2>
            <ul className="mt-2 space-y-3">
              {evenementsVisibles.map((ev) => (
                <li
                  key={ev.slug}
                  className="overflow-hidden rounded-2xl border border-border bg-card sm:flex"
                >
                  {ev.affiche && (
                    <div className="relative aspect-[16/9] shrink-0 bg-secondary sm:aspect-square sm:w-36">
                      <ImageProgressive
                        src={ev.affiche}
                        alt=""
                        ajustement="cover"
                        largeurAffichee="(min-width:640px) 144px, 92vw"
                      />
                      {ev.credit && (
                        <span className="pointer-events-none absolute bottom-1 right-1 max-w-[92%] truncate rounded bg-black/55 px-1 py-0.5 text-xs text-white/85">
                          {ev.credit}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="min-w-0 p-3">
                    {/* ⚠ La période telle que la source la donne — jamais une
                        date recalculée. */}
                    {ev.periode && (
                      <p className="dk-etiquette inline-flex items-center gap-1.5">
                        {ev.annuel && <RefreshCw className="h-3 w-3" aria-hidden="true" />}
                        {ev.periode}
                      </p>
                    )}
                    <h3 className="mt-0.5 font-bold leading-tight">{ev.titre}</h3>
                    {ev.resume && (
                      <p className="dk-corps mt-1 line-clamp-3 text-muted-foreground">{ev.resume}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Link
              to="/evenements"
              className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
            >
              Tout le calendrier
            </Link>
          </section>
        )}

        {/* ── Y aller — toujours présent ───────────────────────────────────
            ⚠ Chaque trajet est un BILLET : la durée RÉELLE en grand (250 km
              font 6 h ici, pas 3), le talon pour le mode et l'état de la route.
            ⚠ Le prix d'un trajet n'est pas affiché : la base ne dit pas QUAND
              il a été relevé, et un prix ne voyage jamais sans sa date. */}
        <section className="dk-reveal mt-6">
          <h2 className="dk-etiquette">Y aller</h2>
          {f.acces.length > 0 ? (
            <ul className="mt-2 space-y-3">
              {f.acces.map((a, i) => {
                const Icone = ICONE_MODE[a.mode] ?? Bus;
                const mode = LIBELLE_MODE[a.mode] ?? a.mode;
                const duree = dureeLisible(a.heures);
                const km = a.km != null ? `${a.km} km` : null;
                const talon = [
                  a.etat_route,
                  a.toute_annee === false ? "pas toute l'année" : null,
                  a.depart ? `départ : ${a.depart}` : null,
                  a.operateurs?.length ? a.operateurs.join(", ") : null,
                ].filter((x): x is string => Boolean(x));
                return (
                  <li key={i} className="dk-ticket">
                    <p className="dk-etiquette">
                      {a.depuis} → {nom}
                    </p>
                    <div className="mt-1.5 flex items-baseline justify-between gap-3">
                      <p className="text-3xl font-bold leading-none tabular-nums">{duree ?? km ?? mode}</p>
                      {duree && km && (
                        <p className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">{km}</p>
                      )}
                    </div>
                    {duree && <p className="dk-secondaire mt-1">Temps de route réel</p>}
                    <div className="dk-ticket__talon">
                      <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
                        <Icone className="h-4 w-4 text-primary" aria-hidden="true" />
                        {mode}
                      </p>
                      {talon.length > 0 && <p className="dk-secondaire mt-0.5">{talon.join(" · ")}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Pas encore de trajet relevé pour {nom}.{" "}
              <Link
                to="/y-aller"
                className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
              >
                Les temps de route réels à Madagascar
              </Link>
            </p>
          )}
        </section>

        {/* ── Quand y aller — toujours présent, une ligne quand c'est vide ── */}
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
            <p className="mt-1 text-sm text-muted-foreground">
              Pas encore renseigné —{" "}
              <Link
                to={lienPublier}
                className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
              >
                racontez-y un voyage
              </Link>
            </p>
          )}
        </section>

        {/* ── Ce que porte la troisième colonne, sous 1920 px ───────────── */}
        <div className="mt-6 space-y-6 large:hidden">
          {blocAlentours()}
          {blocRaconter()}
        </div>
      </div>

      {/* ── COLONNE « REPÈRES » : ce qu'on fait de cette page ──────────────
          ⚠ Les deux actions montent ICI à partir de `xl`, collées pendant
            toute la lecture. Sous `xl`, elles sont sous les pastilles. */}
      <aside className="mt-6 shrink-0 space-y-3 xl:sticky xl:top-20 xl:mt-0 xl:w-[340px]">
        {boutonsDormirManger("hidden grid-cols-2 gap-2 xl:grid")}

        {gps && (
          <Link
            to={lienCarte(gps.lat, gps.lng)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-input text-sm font-semibold"
          >
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Voir sur la carte
          </Link>
        )}

        {/* ⚠ Le référentiel des plats, lui, est complet — il donne toujours
            quelque chose à lire. 95 plats et 254 orthographes, recomptés le
            18/09/2026. */}
        <div className="rounded-2xl border border-accent-strong/25 bg-accent/[0.07] p-4">
          <p className="dk-etiquette text-accent-strong">Manger ici</p>
          <p className="dk-secondaire mt-2 leading-relaxed">
            95 plats malgaches sont référencés, avec leurs 254 orthographes.
            Cherchez celui que vous voulez goûter.
          </p>
          <Link
            to="/plats"
            className="mt-3 inline-flex min-h-11 items-center rounded-full bg-accent-strong px-4 text-sm font-semibold text-accent-foreground"
          >
            Ouvrir l'atlas des plats
          </Link>
        </div>
      </aside>

      {/* ── COLONNE « AUTOUR » — n'apparaît qu'à 1920 ──────────────────── */}
      <aside className="mt-6 hidden shrink-0 space-y-3 large:sticky large:top-20 large:mt-0 large:block large:w-[250px]">
        {blocAlentours()}

        {recits.length > 0 && (
          <section id="recits-colonne" className="scroll-mt-20 rounded-2xl border border-border bg-card p-4">
            <h2 className="dk-etiquette">Ils y sont allés</h2>
            <ul className="mt-3 space-y-3">
              {recits.map((r) => (
                <li key={r.id}>{carteRecit(r, "250px")}</li>
              ))}
            </ul>
          </section>
        )}

        {blocRaconter()}
      </aside>
    </div>
  );
}
