import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRetour } from "@/hooks/useRetour";
import { Link, useSearchParams } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowLeft, Info, LocateFixed, MapPin, Star, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ImageProgressive } from "@/components/ImageProgressive";
import { useSEO } from "@/hooks/useSEO";
import { ariary, CATEGORIES, unite, type Categorie } from "@/lib/etablissements";
import {
  composition,
  degradeGrappe,
  FAMILLES,
  habillage,
  resumeComposition,
  svgFamille,
  totalComposition,
  type Composition,
  type Famille,
} from "@/lib/carte";
import { cn } from "@/lib/utils";

/**
 * La carte — /carte
 *
 * OpenStreetMap via Leaflet : gratuit, sans clé, sans compte à surveiller.
 *
 * 🔴 CE QUE CETTE VERSION CORRIGE (signalé par le propriétaire, capture à
 *    l'appui : « la carte n'est pas belle à voir du tout »).
 *
 *    ① LES FILTRES DISPARAISSAIENT À L'OUVERTURE. Ils comptaient leurs points
 *      dans `points`, VIDE en vue d'ensemble puisqu'on y sert des grappes, et
 *      la ligne « si 0, ne pas afficher » les effaçait donc tous. Au niveau du
 *      pays — la vue par défaut — il ne restait aucun filtre. Ils comptent
 *      maintenant dans `familles_zone`, que le serveur calcule pour la zone
 *      regardée, à tous les niveaux de zoom.
 *
 *    ② LE FILTRE NE FILTRAIT QUE LES 800 POINTS DÉJÀ REÇUS. `p_categorie`
 *      existait côté serveur depuis toujours et n'était jamais passé : cocher
 *      « Restaurants » cherchait parmi 800 points arbitraires sur 5 705. On
 *      passe désormais `p_familles`, et c'est Postgres qui filtre.
 *
 *    ③ TOUT AVAIT LA MÊME PASTILLE TURQUOISE. Une grappe ne disait pas ce
 *      qu'elle contenait, une épingle ne disait pas ce qu'elle était. Les
 *      grappes sont maintenant des ANNEAUX DE COMPOSITION, les épingles portent
 *      l'icône et la couleur de leur famille, et la légende les nomme.
 *
 * ⚠ CE QUI N'A PAS CHANGÉ, ET NE DOIT PAS. Sur les fiches sans coordonnées
 *   propres, le point reste celui du lieu : le panneau le dit en toutes lettres
 *   plutôt que de laisser croire que c'est la porte d'entrée.
 *
 * ⚠ 3G. Le morceau Leaflet (~150 Ko) n'est chargé que par cette route, qui est
 *   en lazy(). UNE seule requête par déplacement — la légende voyage avec les
 *   points, elle ne coûte pas d'aller-retour de plus.
 */

interface PointCarte {
  /** `page` = etablissement, `site` = parc, sommet, plage, patrimoine. */
  genre: "page" | "site";
  id: string;
  slug: string;
  name: string;
  categories: Categorie[];
  cover_url: string | null;
  lat: number;
  lng: number;
  precision_geo: "exacte" | "lieu";
  place_name: string | null;
  price_min_ar: number | null;
  price_min_unit: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  /** Combien de points existent DANS LA ZONE, avant la troncature. Sert a
   *  ecrire « 800 sur 1 240 ici », jamais a laisser croire que c'est tout. */
  total_zone: number;
  /** Décidée par le serveur (`dk_famille_carte`), jamais recalculée ici. */
  famille: Famille;
  familles_zone: unknown;
}

/**
 * ⚠ LE CADRE DU PAYS, PAS UN CENTRE ET UN ZOOM. « centre + zoom 6 » dépend de
 *   la hauteur du conteneur : la barre de filtres ayant pris une deuxième
 *   ligne, le Sud de Madagascar passait sous la barre de navigation — le pays
 *   était coupé à l'ouverture, et le compteur annonçait 5 270 points au lieu
 *   des 5 705 puisque le reste était hors cadre. `fitBounds` s'adapte à la
 *   place réellement disponible, sur téléphone comme sur grand écran.
 */
const CADRE_MADAGASCAR = L.latLngBounds([-25.8, 43.0], [-11.7, 50.8]);

/** ⚠ Le niveau à partir duquel on montre les adresses une par une. En dessous,
 *  ce sont des GRAPPES : à l'échelle d'une région, un chiffre est lisible,
 *  cinq cents épingles superposées ne le sont pas. */
const ZOOM_DETAIL = 11;

interface Grappe {
  lat: number;
  lng: number;
  n: number;
  n_sites: number;
  exemple: string;
  total_zone: number;
  familles: unknown;
  familles_zone: unknown;
}

/** Les pictos du panneau de détail, par code brut — plus fins que la famille
 *  quand on regarde UNE fiche : on y lit « cascade », pas « nature ». */
const EMOJI: Record<string, string> = {
  reserve: "🌿",
  parc: "🌳",
  sommet: "⛰️",
  plage: "🏖️",
  patrimoine: "🏛️",
  site: "💧",
  point_de_vue: "👁️",
  cascade: "💦",
  grotte: "🕳️",
  musee: "🖼️",
  parc_animalier: "🦎",
  oeuvre: "🗿",
  source: "♨️",
  aire: "🧺",
  hotel: "🛏️",
  restaurant: "🍽️",
  agence_voyage: "🧭",
  guide: "🥾",
  transporteur: "🚐",
  location_vehicule: "🚗",
  site_attraction: "📍",
  organisateur_evenement: "🎉",
};

const nombre = (n: number) => n.toLocaleString("fr-FR");

export default function Carte() {
  useSEO({
    titre: "Carte des hôtels, restaurants et sites de Madagascar",
    description:
      "Trouvez sur la carte les hôtels, restaurants, plages, parcs et sites à visiter de Madagascar, avec leurs tarifs en ariary.",
    url: "https://diako.fonenako.mg/carte",
  });

  const retour = useRetour("/");
  const [params] = useSearchParams();
  const divCarte = useRef<HTMLDivElement>(null);
  const carte = useRef<L.Map | null>(null);
  const couche = useRef<L.LayerGroup | null>(null);
  const cibleRef = useRef<string | null>(params.get("focus"));

  const [points, setPoints] = useState<PointCarte[]>([]);
  const [chargement, setChargement] = useState(true);
  const [choisis, setChoisis] = useState<PointCarte[] | null>(null);
  const [legendeOuverte, setLegendeOuverte] = useState(false);

  /**
   * Les familles cochées. Vide = tout.
   *
   * ⚠ C'EST UN ENSEMBLE, PAS UN CHOIX UNIQUE. « Où dormir » et « Où manger »
   *   ensemble est la question la plus courante d'un voyageur qui prépare une
   *   étape ; l'ancien filtre à choix unique l'obligeait à regarder deux fois.
   */
  const [actives, setActives] = useState<Set<Famille>>(() => {
    const c = params.get("familles");
    const connues = new Set(FAMILLES.map((f) => f.code as string));
    return new Set(
      (c ? c.split(",") : []).filter((x) => connues.has(x)) as Famille[]
    );
  });

  const [totalZone, setTotalZone] = useState(0);
  const [grappes, setGrappes] = useState<Grappe[]>([]);
  /** Ce que la zone contient par famille, AVANT filtrage — la légende. */
  const [zone, setZone] = useState<Composition>({});
  // ⚠ Garde-fou de concurrence : deux deplacements rapides rendaient parfois
  //   l'ancienne zone PAR-DESSUS la nouvelle. On ne garde que la derniere.
  const versionZone = useRef(0);
  /** Le diamètre maximal d'une pastille, déduit de la case de la grille au
   *  moment de la requête — voir `chargerZone`. */
  const tailleMax = useRef(52);

  /**
   * ⚠ UNE RÉFÉRENCE, PAS UNE DÉPENDANCE. `chargerZone` est branchée sur
   *   `moveend` UNE FOIS, à l'initialisation ; si elle changeait à chaque
   *   cochage de filtre, il faudrait redémonter la carte entière pour
   *   rebrancher l'écouteur — l'écran clignoterait et perdrait son cadrage.
   *   On lit donc le filtre courant dans une ref au moment de la requête.
   */
  const activesRef = useRef(actives);
  useEffect(() => {
    activesRef.current = actives;
  }, [actives]);

  /**
   * 🔴 LA CARTE CHARGE CE QU'ON REGARDE.
   *
   *    Avant, une seule requete demandait 600 fiches pour tout Madagascar — sur
   *    3 302 publiees, et sans AUCUN des 2 429 sites. Plus des deux tiers de
   *    l'annuaire n'apparaissaient nulle part, et rien a l'ecran ne le disait :
   *    un visiteur en concluait qu'il n'y a rien a Morondava.
   *
   * ⚠ ON ANNONCE CE QU'ON CACHE. `total_zone` compte AVANT la troncature :
   *   l'ecran ecrit « 800 sur 1 240 ici — zoomez » plutot que de laisser croire
   *   que la carte est complete. Une troncature muette se lit comme une absence.
   */
  const chargerZone = useCallback(async () => {
    const m = carte.current;
    if (!m) return;
    const mien = ++versionZone.current;
    const b = m.getBounds();
    const zoom = m.getZoom();
    const choix = [...activesRef.current];
    /**
     * ⚠ ON OMET L'ARGUMENT, ON NE PASSE PAS `null`. Côté base, `p_familles`
     *   vaut `DEFAULT NULL` et `null` veut dire « toutes les familles » — mais
     *   `types.ts` est GÉNÉRÉ, et le générateur déclare un argument à défaut
     *   `p_familles?: string[]` : optionnel, jamais nullable. Lui passer `null`
     *   ne compile pas. C'est le correctif déjà acté pour les 53 arguments
     *   concernés (docs/A-APPLIQUER.md) : omettre plutôt que forcer un type.
     * ⚠ ET SURTOUT PAS UN TABLEAU VIDE : `famille = any('{}')` ne correspond à
     *   AUCUNE famille et rendrait une carte vide, sans rien pour l'expliquer.
     */
    const filtre = choix.length > 0 ? { p_familles: choix } : {};

    // 🔴 EN DESSOUS DE ZOOM_DETAIL, ON NE DESSINE PAS DES ÉPINGLES. À
    //    l'ouverture la carte cadre tout Madagascar : elle posait 800 `divIcon`
    //    d'un coup, ce qui fige l'écran plusieurs secondes sur un téléphone —
    //    l'utilisateur voit une carte vide et conclut qu'elle ne charge pas.
    //    Elle chargeait, elle peinait. Et 800 épingles sur 1 600 km se
    //    superposent en bouillie : personne ne lit ça.
    if (zoom < ZOOM_DETAIL) {
      /**
       * 🔴 LA GRILLE SE COMPTE EN PIXELS D'ÉCRAN, PAS EN CASES FIXES. Elle
       *    était à « 40 cases en travers » quelle que soit la largeur : sur
       *    1 173 px, une case faisait 29 px pour des pastilles de 30 à 64 —
       *    elles se recouvraient donc TOUJOURS, et Madagascar disparaissait
       *    sous un mur de pastilles collées. Vérifié en capture.
       *
       * ⚠ 58 PX PAR CASE, POUR UNE PASTILLE PLAFONNÉE À 52. Réglé en regardant
       *   le rendu, pas au jugé : à 78 px le pays n'avait plus que quatorze
       *   pastilles et la géographie disparaissait — on ne voyait plus que le
       *   pays est peuplé le long des routes. À 58, l'axe Tana-Antsirabe et
       *   les côtes se lisent, et rien ne se touche encore.
       * ⚠ LE PLANCHER ET LE PLAFOND COMPTENT AUTANT. Sur un téléphone de
       *   390 px la division donnerait 7 cases, et c'est bien le minimum : en
       *   dessous, le pays entier tomberait dans trois pastilles géantes qui ne
       *   disent plus où sont les choses. Au-delà de 26, on repart vers le mur
       *   de pastilles collées sur un très grand écran.
       */
      const largeurPx = Math.max(m.getSize().x, 320);
      const cases = Math.min(26, Math.max(7, Math.round(largeurPx / 58)));
      const pas = Math.max((b.getEast() - b.getWest()) / cases, 0.02);
      /**
       * 🔴 LA PASTILLE NE PEUT PLUS DÉPASSER SA CASE. Le plafond était un
       *    nombre écrit à part (52) que rien ne reliait à la largeur d'une
       *    case : sur un téléphone de 390 px, la case tombe à 56 px et les plus
       *    grosses pastilles se touchaient — vu en capture. Déduit de la case,
       *    l'écart est garanti à toutes les tailles d'écran, et il n'y a plus
       *    deux nombres à garder d'accord.
       */
      tailleMax.current = Math.min(52, Math.floor(largeurPx / cases) - 7);
      const { data, error } = await supabase.rpc("carte_grappes", {
        p_sud: b.getSouth(),
        p_ouest: b.getWest(),
        p_nord: b.getNorth(),
        p_est: b.getEast(),
        p_pas: pas,
        ...filtre,
      });
      if (mien !== versionZone.current) return;
      if (error) {
        toast.error("La carte n'a pas pu être chargée.");
        setChargement(false);
        return;
      }
      const g = (data as unknown as Grappe[] | null) ?? [];
      setGrappes(g);
      setPoints([]);
      setTotalZone(g[0]?.total_zone ?? 0);
      // ⚠ La légende vient du serveur, PAS d'une somme des grappes reçues :
      //   celles-ci sont plafonnées à 400 cases, et la somme mentirait dès
      //   qu'une zone dense en compte davantage.
      setZone(composition(g[0]?.familles_zone));
      setChargement(false);
      return;
    }

    const { data, error } = await supabase.rpc("carte_zone", {
      p_sud: b.getSouth(),
      p_ouest: b.getWest(),
      p_nord: b.getNorth(),
      p_est: b.getEast(),
      p_limite: 800,
      ...filtre,
    });
    if (mien !== versionZone.current) return;
    if (error) {
      toast.error("La carte n'a pas pu être chargée.");
      setChargement(false);
      return;
    }
    const l = (data as unknown as PointCarte[] | null) ?? [];
    setGrappes([]);
    setPoints(l);
    setTotalZone(l[0]?.total_zone ?? 0);
    setZone(composition(l[0]?.familles_zone));
    setChargement(false);
  }, []);

  // ── Initialisation, une seule fois ────────────────────────────────────
  useEffect(() => {
    if (!divCarte.current || carte.current) return;
    const m = L.map(divCarte.current, {
      zoomControl: false,
      attributionControl: true,
    });
    m.fitBounds(CADRE_MADAGASCAR, { padding: [12, 12] });
    L.control.zoom({ position: "bottomright" }).addTo(m);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(m);
    couche.current = L.layerGroup().addTo(m);
    carte.current = m;

    // ⚠ ON ATTEND QUE LE GESTE SE TERMINE. Recharger a chaque image d'un
    //   deplacement declencherait des dizaines de requetes par seconde ;
    //   `moveend` ne part qu'une fois la main levee, et les 250 ms de repos
    //   absorbent l'enchainement zoom + recentrage.
    let minuteur: number | undefined;
    const surDeplacement = () => {
      window.clearTimeout(minuteur);
      minuteur = window.setTimeout(() => void chargerZone(), 250);
    };
    m.on("moveend", surDeplacement);
    void chargerZone();
    return () => {
      window.clearTimeout(minuteur);
      m.off("moveend", surDeplacement);
      m.remove();
      carte.current = null;
      couche.current = null;
    };
  }, [chargerZone]);

  /**
   * 🔴 COCHER UN FILTRE REDEMANDE AU SERVEUR. C'est tout le point du correctif :
   *    filtrer les 800 points déjà reçus laissait 1 072 restaurants hors de vue
   *    sans que rien ne le dise. On saute le tout premier passage, que
   *    l'initialisation a déjà lancé.
   */
  const premierRendu = useRef(true);
  useEffect(() => {
    if (premierRendu.current) {
      premierRendu.current = false;
      return;
    }
    setChoisis(null);
    setChargement(true);
    void chargerZone();
  }, [actives, chargerZone]);

  const basculer = (code: Famille) =>
    setActives((avant) => {
      const suite = new Set(avant);
      if (suite.has(code)) suite.delete(code);
      else suite.add(code);
      return suite;
    });

  // ── Les marqueurs, regroupés par position ─────────────────────────────
  useEffect(() => {
    const l = couche.current;
    const m = carte.current;
    if (!l || !m) return;
    l.clearLayers();

    // ── Vue d'ensemble : des GRAPPES qui disent ce qu'elles contiennent ──
    if (grappes.length) {
      grappes.forEach((g) => {
        const compo = composition(g.familles);
        // ⚠ La pastille grossit avec le nombre, mais en RACINE : proportionnelle,
        //   une grappe de 1 163 ferait 40 fois le diamètre d'une grappe de 1 et
        //   masquerait la moitié du pays.
        // ⚠ LE PLAFOND VIENT DE LA GRILLE (`tailleMax`), il n'est pas écrit
        //   ici : c'est ce qui garantit qu'une pastille ne déborde jamais sur
        //   sa voisine, du téléphone au grand écran.
        const taille = Math.min(Math.round(26 + Math.sqrt(g.n) * 1.9), tailleMax.current);
        const texte = g.n > 999 ? `${Math.round(g.n / 100) / 10}k` : `${g.n}`;
        const resume = resumeComposition(compo);
        const icone = L.divIcon({
          className: "",
          // ⚠ L'ANNEAU EST LE FOND, LE CŒUR EST UN DISQUE CLAIR PAR-DESSUS :
          //   le nombre reste lisible quelle que soit la composition, alors
          //   qu'écrit à même le dégradé il tomberait tantôt sur du corail,
          //   tantôt sur du bleu foncé.
          html:
            `<div class="dk-grappe" style="width:${taille}px;height:${taille}px;` +
            `background:${degradeGrappe(compo)}">` +
            `<span class="dk-grappe__coeur">${texte}</span></div>`,
          iconSize: [taille, taille],
          iconAnchor: [taille / 2, taille / 2],
        });
        L.marker([g.lat, g.lng], {
          icon: icone,
          title: resume ? `${nombre(g.n)} ici — ${resume}` : `${nombre(g.n)} ici`,
        })
          .on("click", () => {
            // Un clic sur une grappe RAPPROCHE : c'est le seul geste qui a du
            // sens, l'ouvrir en liste afficherait mille lignes.
            m.setView([g.lat, g.lng], Math.max(m.getZoom() + 3, ZOOM_DETAIL));
          })
          .addTo(l);
      });
      return;
    }

    const groupes = new Map<string, PointCarte[]>();
    points.forEach((p) => {
      const cle = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
      groupes.set(cle, [...(groupes.get(cle) ?? []), p]);
    });

    const cadre: [number, number][] = [];
    groupes.forEach((items) => {
      const { lat, lng } = items[0];
      cadre.push([lat, lng]);
      const n = items.length;
      // ⚠ LA COULEUR D'UN GROUPE EST CELLE DE SA FAMILLE MAJORITAIRE, et le
      //   compte est écrit dessus. Prendre celle du premier élément ferait
      //   changer la couleur au gré de l'ordre de tri du serveur.
      const compo = composition(
        items.reduce<Record<string, number>>((acc, p) => {
          acc[p.famille] = (acc[p.famille] ?? 0) + 1;
          return acc;
        }, {})
      );
      const dominante =
        FAMILLES.filter((f) => (compo[f.code] ?? 0) > 0).sort(
          (a, b) => (compo[b.code] ?? 0) - (compo[a.code] ?? 0)
        )[0] ?? habillage(items[0].famille);

      const icone = L.divIcon({
        className: "",
        html:
          `<div class="dk-pin dk-pin--famille" style="--dk-pin:${dominante.couleur}">` +
          (n > 1
            ? `<span class="dk-pin__n">${n}</span>`
            : `<span class="dk-pin__i">${svgFamille(items[0].famille, 17)}</span>`) +
          `</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      L.marker([lat, lng], {
        icon: icone,
        title:
          n > 1
            ? `${n} ici — ${resumeComposition(compo, 2)}`
            : `${items[0].name} · ${dominante.label.toLowerCase()}`,
      })
        .addTo(l)
        .on("click", () => setChoisis(items));
    });

    // /carte?focus=<slug> depuis une fiche : on se pose dessus, panneau ouvert.
    const cible = cibleRef.current;
    if (cible) {
      const p = points.find((x) => x.slug === cible);
      if (p) {
        cibleRef.current = null;
        m.setView([p.lat, p.lng], 14);
        setChoisis(groupes.get(`${p.lat.toFixed(4)},${p.lng.toFixed(4)}`) ?? [p]);
      }
    }
  }, [points, grappes]);

  const meLocaliser = () => {
    if (!navigator.geolocation) return toast.error("Géolocalisation indisponible.");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const m = carte.current;
        if (!m) return;
        m.setView([coords.latitude, coords.longitude], 12);
        L.circleMarker([coords.latitude, coords.longitude], {
          radius: 8,
          color: "#0F5C5A",
          fillColor: "#0F5C5A",
          fillOpacity: 0.9,
        })
          .addTo(m)
          .bindTooltip("Vous êtes ici");
      },
      () => toast.error("Position introuvable. Autorisez la localisation."),
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const totalLegende = useMemo(() => totalComposition(zone), [zone]);

  return (
    <div className="fixed inset-0 z-10 flex flex-col bg-background pt-[var(--header-h,3.5rem)]">
      <div className="border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            onClick={retour}
            aria-label="Retour"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <h1 className="inline-flex items-center gap-1.5 font-semibold">
            <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
            Carte
          </h1>
          {totalLegende > 0 && (
            <p className="hidden text-xs text-muted-foreground sm:block">
              {nombre(totalLegende)} points dans cette vue
            </p>
          )}

          <button
            onClick={() => setLegendeOuverte((x) => !x)}
            aria-expanded={legendeOuverte}
            className={cn(
              "ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition",
              legendeOuverte
                ? "border-primary bg-primary/10 text-primary"
                : "border-input hover:border-primary hover:text-primary"
            )}
          >
            <Info className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Légende</span>
          </button>
          <button
            onClick={meLocaliser}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-input px-3 text-sm hover:border-primary hover:text-primary"
          >
            <LocateFixed className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Autour de moi</span>
          </button>
        </div>

        {/* ── LES FILTRES, QUI SONT AUSSI LA LÉGENDE ─────────────────────
            🔴 ILS NE DISPARAISSENT PLUS. Leurs compteurs viennent de
               `familles_zone`, calculé par le serveur pour la zone regardée —
               à tous les niveaux de zoom, y compris celui de l'ouverture où
               `points` est vide. C'est le défaut qui rendait la carte muette.
            ⚠ CHAQUE CASE PORTE SA COULEUR ET SON ICÔNE : c'est ce qui permet
              de relier une épingle bleue à « Où dormir » sans autre explication.
            ⚠ UNE FAMILLE ABSENTE DE LA VUE RESTE AFFICHÉE, GRISÉE ET DÉSACTIVÉE,
              plutôt que retirée : une case qui s'évapore quand on déplace la
              carte fait douter de ce qu'on vient de lire. */}
        <div className="-mx-3 mt-2 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max items-center gap-1.5">
            <button
              onClick={() => setActives(new Set())}
              aria-pressed={actives.size === 0}
              className={cn(
                "h-8 shrink-0 rounded-full px-3 text-xs font-semibold transition",
                actives.size === 0
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              Tout
              {totalLegende > 0 && (
                <span className="ml-1 opacity-70">{nombre(totalLegende)}</span>
              )}
            </button>

            {FAMILLES.map((f) => {
              const n = zone[f.code] ?? 0;
              const actif = actives.has(f.code);
              const vide = n === 0;
              return (
                <button
                  key={f.code}
                  onClick={() => basculer(f.code)}
                  disabled={vide && !actif}
                  aria-pressed={actif}
                  title={vide ? `${f.label} — rien dans cette vue` : f.detail}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border pl-1 pr-3 text-xs font-semibold transition",
                    actif
                      ? "border-transparent text-white shadow-sm"
                      : vide
                        ? "border-border text-muted-foreground/50"
                        : "border-border bg-card hover:border-foreground/30"
                  )}
                  style={actif ? { backgroundColor: f.couleur } : undefined}
                >
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white"
                    style={{ backgroundColor: actif ? "rgba(0,0,0,.22)" : f.couleur }}
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: svgFamille(f.code, 14) }}
                  />
                  {f.label}
                  <span className={cn("tabular-nums", actif ? "opacity-80" : "opacity-60")}>
                    {nombre(n)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={divCarte} className="absolute inset-0" />

        {chargement && (
          <div className="absolute inset-0 z-[500] grid place-items-center bg-background/60">
            <p className="rounded-full border border-border bg-card px-4 py-2 text-sm shadow">
              Chargement des adresses…
            </p>
          </div>
        )}

        {/* ⚠ « Rien ici » DOIT DISTINGUER une zone vide d'un filtre trop
            étroit : le second se répare en un clic, et il faut le dire. */}
        {!chargement && points.length === 0 && grappes.length === 0 && (
          <div className="absolute left-1/2 top-3 z-[500] w-max max-w-[92%] -translate-x-1/2 rounded-2xl border border-border bg-card px-4 py-2 text-center text-sm shadow">
            {actives.size > 0 && totalLegende > 0 ? (
              <>
                <p className="font-semibold">Rien de ce type dans cette vue</p>
                <button
                  onClick={() => setActives(new Set())}
                  className="mt-1 text-xs font-semibold text-primary underline underline-offset-4"
                >
                  Afficher les {nombre(totalLegende)} points de la zone
                </button>
              </>
            ) : (
              <p>Aucune adresse dans cette zone</p>
            )}
          </div>
        )}

        {/* 🔴 LA CARTE DIT CE QU'ELLE NE MONTRE PAS. Elle chargeait 600 fiches
            pour tout Madagascar — sur 5 731 points publiés — et rien ne le
            signalait : un visiteur en concluait qu'il n'y a rien à Morondava.
            Une troncature muette se lit comme une absence.
            ⚠ DEUX MESSAGES, PARCE QUE LES DEUX VUES NE CACHENT PAS LA MEME
              CHOSE. En grappes, RIEN n'est caché — tout est compté, simplement
              regroupé ; dire « 0 affichés sur 5 731 » serait faux et alarmant.
              En vue détaillée, la troncature est réelle et doit être annoncée. */}
        {!chargement && grappes.length > 0 && (
          <div className="absolute left-1/2 top-3 z-[500] max-w-[92%] -translate-x-1/2 rounded-full border border-border bg-card/95 px-4 py-1.5 text-center text-xs shadow backdrop-blur">
            {nombre(totalZone)} {actives.size > 0 ? "points filtrés" : "adresses et sites"} ici —
            zoomez pour les voir un par un
          </div>
        )}
        {!chargement && grappes.length === 0 && totalZone > points.length && (
          <div className="absolute left-1/2 top-3 z-[500] max-w-[92%] -translate-x-1/2 rounded-full border border-border bg-card/95 px-4 py-1.5 text-center text-xs shadow backdrop-blur">
            {nombre(points.length)} affichés sur {nombre(totalZone)} ici — zoomez pour voir
            les autres
          </div>
        )}

        {/* ── LA LÉGENDE DÉPLIÉE ────────────────────────────────────────
            ⚠ ELLE EXPLIQUE CE QUE LES FILTRES NE PEUVENT PAS DIRE : ce que
              recouvre chaque famille, et surtout ce que signifie l'anneau
              d'une grappe. Repliée par défaut — dépliée, elle mangerait le
              tiers d'un écran de 390 px. */}
        {legendeOuverte && (
          /* ⚠ `xl:bottom-3` ET NON `md:` : la barre de navigation du bas est
              `xl:hidden`, donc PRÉSENTE jusqu'à 1 280 px. Se caler sur `md`
              ferait passer le bas de la légende dessous entre 768 et 1 280 —
              exactement ce qui se voyait en capture. */
          <div className="absolute bottom-[calc(4.5rem+var(--safe-b,0px))] left-3 z-[600] max-h-[calc(100%-6.5rem)] w-[min(20rem,calc(100%-1.5rem))] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card/97 p-4 shadow-2xl backdrop-blur xl:bottom-3 xl:max-h-[calc(100%-1.5rem)]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold">Lire la carte</p>
                <p className="dk-secondaire mt-0.5">
                  {nombre(totalLegende)} points dans la vue actuelle.
                </p>
              </div>
              <button
                onClick={() => setLegendeOuverte(false)}
                aria-label="Fermer la légende"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-muted"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <ul className="mt-3 space-y-2">
              {FAMILLES.map((f) => (
                <li key={f.code} className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-white"
                    style={{ backgroundColor: f.couleur }}
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: svgFamille(f.code, 14) }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold">{f.label}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {nombre(zone[f.code] ?? 0)}
                      </span>
                    </span>
                    <span className="dk-secondaire block leading-snug">{f.detail}</span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-center gap-3 border-t border-border pt-3">
              <span
                className="dk-grappe shrink-0"
                style={{
                  width: 42,
                  height: 42,
                  background: degradeGrappe({ manger: 6, dormir: 3, nature: 2, plage: 1 }),
                }}
                aria-hidden="true"
              >
                <span className="dk-grappe__coeur">12</span>
              </span>
              <p className="dk-secondaire leading-snug">
                Une pastille regroupe les points trop proches pour être
                distingués. <strong className="font-semibold">Son anneau montre
                ce qu'elle contient</strong> — cliquez pour vous rapprocher.
              </p>
            </div>
          </div>
        )}

        {choisis && (
          /* 🔴 `xl:bottom-0`, ET C'EST UNE CORRECTION. Ce panneau était en
              `md:bottom-0` alors que la barre de navigation est `xl:hidden` :
              entre 768 et 1 280 px, ses quatre premiers centimètres passaient
              DERRIÈRE la barre — le premier établissement de la liste était
              masqué, sur toute une plage de tailles de fenêtre. */
          <div className="absolute inset-x-0 bottom-[calc(4rem+var(--safe-b,0px))] z-[600] flex max-h-[58%] flex-col rounded-t-2xl border-t border-border bg-card shadow-2xl xl:bottom-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <p className="text-sm font-semibold">
                {choisis.length} adresse{choisis.length > 1 ? "s" : ""}
                {choisis[0].place_name && ` · ${choisis[0].place_name}`}
              </p>
              <button
                onClick={() => setChoisis(null)}
                aria-label="Fermer"
                className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Dire la vérité sur la précision plutôt que de laisser croire que
                le point est celui de la porte d'entrée. */}
            {choisis[0].precision_geo === "lieu" ? (
              <p className="border-b border-border bg-secondary/50 px-4 py-1.5 text-xs text-muted-foreground">
                Position approchée : le point est celui de la commune, pas de
                l'établissement.
              </p>
            ) : (
              /* ⚠ La provenance exacte du releve n'est plus remontee par
                 `carte_zone` (elle melange etablissements et sites, qui n'ont
                 pas la meme colonne). On dit ce qu'on sait : le point est
                 exact. Le detail de la source est sur la fiche. */
              <p className="border-b border-border bg-primary/5 px-4 py-1.5 text-xs text-muted-foreground">
                Position relevée sur le terrain ou dans OpenStreetMap.
              </p>
            )}

            <ul className="divide-y divide-border overflow-y-auto overscroll-contain">
              {choisis.map((p) => {
                const h = habillage(p.famille);
                return (
                  <li key={p.id}>
                    <Link
                      to={p.genre === "site" ? `/site/${p.slug}` : `/p/${p.slug}`}
                      className="flex items-center gap-3 p-3 hover:bg-muted/40"
                    >
                      <span className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                        {p.cover_url ? (
                          <ImageProgressive src={p.cover_url} alt="" ajustement="cover" />
                        ) : (
                          <span className="grid h-full w-full place-items-center text-lg">
                            {EMOJI[p.categories[0]] ?? "📍"}
                          </span>
                        )}
                        {/* La pastille de famille relie la ligne à l'épingle
                            qu'on vient de toucher sur la carte. */}
                        <span
                          className="absolute bottom-1 left-1 grid h-5 w-5 place-items-center rounded-full text-white ring-2 ring-card"
                          style={{ backgroundColor: h.couleur }}
                          aria-hidden="true"
                          dangerouslySetInnerHTML={{ __html: svgFamille(p.famille, 12) }}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{p.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {p.genre === "site"
                            ? h.label
                            : p.categories
                                .map((c) => CATEGORIES.find((x) => x.code === c)?.label ?? c)
                                .join(" · ")}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-sm">
                          {p.price_min_ar != null ? (
                            <span className="font-semibold text-primary">
                              {ariary(p.price_min_ar)}{" "}
                              <span className="text-xs font-normal text-muted-foreground">
                                {unite(p.price_min_unit)}
                              </span>
                            </span>
                          ) : (
                            p.genre === "page" && (
                              <span className="text-xs text-muted-foreground">
                                Tarif non communiqué
                              </span>
                            )
                          )}
                          {(p.rating_count ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                              <Star
                                className="h-3 w-3 fill-amber-400 text-amber-400"
                                aria-hidden="true"
                              />
                              {(p.rating_avg ?? 0).toFixed(1)}
                            </span>
                          )}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
