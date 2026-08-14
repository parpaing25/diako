import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LA CARTE À CÔTÉ DES RÉSULTATS — écran W2 de la maquette, à partir de `xl`.
 *
 * ⚠ POURQUOI ELLE VAUT LA PEINE. Chercher un hôtel, c'est deux questions à la
 *   fois : combien, et OÙ. Sans carte, la deuxième se règle en ouvrant douze
 *   onglets. Le survol relie les deux listes : la souris passe sur une ligne,
 *   l'épingle se lève ; elle passe sur une épingle, la ligne s'encadre.
 *
 * ⚠ CE QUE CETTE CARTE NE FERA PAS. Elle ne décale pas les points qui se
 *   superposent. Sur 40 fiches à Ampefy, 7 ont une position propre : les 33
 *   autres portent le centre de la commune et tombent exactement au même
 *   endroit. Les éparpiller « pour que ça respire » dirait au voyageur qu'un
 *   hôtel est là où il n'est pas. On les REGROUPE, la pastille porte le
 *   nombre, et l'encart du bas annonce combien de points sont approchés.
 *
 * ⚠ POURQUOI `xl` ET NON `lg`. À 1024 px, une fois la barre de gauche déduite,
 *   la carte laissait 410 px aux lignes de résultats — leur colonne de prix
 *   alignée, qui est toute leur raison d'être, ne tenait plus.
 *
 * ⚠ LEAFLET N'EST CHARGÉ QU'ICI. Le composant est importé en `lazy()` et n'est
 *   monté qu'au-dessus de `xl` : un téléphone en 3G ne télécharge jamais les
 *   ~150 Ko de la bibliothèque pour un panneau qu'il ne verra pas.
 */

export interface PointResultat {
  slug: string;
  name: string;
  categories: string[];
  lat: number | null;
  lng: number | null;
  precision_geo: string | null;
}

const EMOJI: Record<string, string> = {
  hotel: "🛏️",
  restaurant: "🍽️",
  agence_voyage: "🧭",
  guide: "🥾",
  transporteur: "🚐",
  location_vehicule: "🚗",
  site_attraction: "📍",
  organisateur_evenement: "🎉",
};

/** Le cadre courant de la carte, tel qu'on le passe dans l'URL. */
export interface Cadre {
  sud: number;
  ouest: number;
  nord: number;
  est: number;
}

export default function CarteResultats({
  points,
  surligne,
  onSurvol,
  onChoisir,
  onChercherIci,
  cadreInitial,
}: {
  points: PointResultat[];
  /** Slug de la ligne survolée dans la liste. */
  surligne?: string | null;
  onSurvol?: (slug: string | null) => void;
  onChoisir?: (slug: string) => void;
  /** « Rechercher dans cette zone » — rend le cadre visible. */
  onChercherIci?: (cadre: Cadre) => void;
  cadreInitial?: Cadre | null;
}) {
  const divCarte = useRef<HTMLDivElement>(null);
  const carte = useRef<L.Map | null>(null);
  const couche = useRef<L.LayerGroup | null>(null);
  /** slug → marqueur, pour lever la bonne épingle sans redessiner la carte. */
  const epingles = useRef<Map<string, L.Marker>>(new Map());
  /**
   * ⚠ LEAFLET NE DIT PAS QUI A BOUGÉ LA CARTE. `fitBounds` et `invalidateSize`
   *   émettent le MÊME `moveend` qu'un glisser de souris. Sans ce compteur,
   *   « Rechercher dans cette zone » apparaissait tout seul au chargement, sur
   *   un cadre que personne n'avait choisi — et un clic dessus aurait figé la
   *   recherche sur un cadrage automatique.
   */
  const deplacementsAIgnorer = useRef(0);
  const [bouge, setBouge] = useState(false);

  const situes = useMemo(
    () => points.filter((p) => p.lat != null && p.lng != null),
    [points]
  );
  const approches = situes.filter((p) => p.precision_geo !== "exacte").length;

  // ── Initialisation, une seule fois ──────────────────────────────────────
  useEffect(() => {
    if (!divCarte.current || carte.current) return;
    const m = L.map(divCarte.current, {
      center: [-18.9, 46.9],
      zoom: 6,
      zoomControl: false,
      // ⚠ Le zoom à la molette est COUPÉ. La carte occupe la moitié droite
      //   d'une page qui défile : molette au-dessus d'elle, on veut faire
      //   descendre la liste, pas dézoomer Madagascar.
      scrollWheelZoom: false,
      attributionControl: true,
    });
    L.control.zoom({ position: "topright" }).addTo(m);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(m);
    couche.current = L.layerGroup().addTo(m);
    m.on("moveend zoomend", () => {
      if (deplacementsAIgnorer.current > 0) {
        deplacementsAIgnorer.current -= 1;
        return;
      }
      setBouge(true);
    });
    carte.current = m;

    // ⚠ LE PIÈGE CLASSIQUE DE LEAFLET. Il mesure son conteneur une fois, au
    //   montage. Ce panneau naît dans une colonne flex dont la largeur se fixe
    //   au même rendu : la carte se dessine alors sur une taille périmée et
    //   laisse une bande grise. Un observateur de taille recalcule — et le
    //   recadrage qui s'ensuit ne compte pas comme un geste de l'utilisateur.
    const observateur = new ResizeObserver(() => {
      deplacementsAIgnorer.current += 1;
      m.invalidateSize();
    });
    observateur.observe(divCarte.current);

    // Capturé maintenant : au démontage, `epingles.current` peut déjà pointer
    // ailleurs, et on viderait la mauvaise table.
    const table = epingles.current;
    return () => {
      observateur.disconnect();
      m.remove();
      carte.current = null;
      couche.current = null;
      table.clear();
    };
  }, []);

  // ── Les épingles, regroupées par position ───────────────────────────────
  useEffect(() => {
    const l = couche.current;
    const m = carte.current;
    if (!l || !m) return;
    l.clearLayers();
    epingles.current.clear();

    const groupes = new Map<string, PointResultat[]>();
    situes.forEach((p) => {
      const cle = `${p.lat!.toFixed(4)},${p.lng!.toFixed(4)}`;
      groupes.set(cle, [...(groupes.get(cle) ?? []), p]);
    });

    const cadre: [number, number][] = [];
    groupes.forEach((items) => {
      const { lat, lng } = items[0];
      cadre.push([lat!, lng!]);
      const n = items.length;
      const marqueur = L.marker([lat!, lng!], {
        icon: L.divIcon({
          className: "",
          html:
            n > 1
              ? `<div class="dk-pin dk-pin--groupe">${n}</div>`
              : `<div class="dk-pin">${EMOJI[items[0].categories?.[0] ?? ""] ?? "📍"}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
        title: n > 1 ? `${n} adresses au même point` : items[0].name,
      })
        .addTo(l)
        .on("mouseover", () => onSurvol?.(items[0].slug))
        .on("mouseout", () => onSurvol?.(null))
        .on("click", () => onChoisir?.(items[0].slug));
      // Chaque fiche du groupe pointe sur le MÊME marqueur : survoler
      // n'importe laquelle de la liste lève la pastille commune.
      items.forEach((p) => epingles.current.set(p.slug, marqueur));
    });

    // Le cadrage qui suit est le nôtre, pas celui du visiteur.
    deplacementsAIgnorer.current += 1;
    if (cadreInitial) {
      m.fitBounds(
        L.latLngBounds(
          [cadreInitial.sud, cadreInitial.ouest],
          [cadreInitial.nord, cadreInitial.est]
        ),
        { padding: [20, 20] }
      );
    } else if (cadre.length > 1) {
      m.fitBounds(L.latLngBounds(cadre), { padding: [40, 40], maxZoom: 13 });
    } else if (cadre.length === 1) {
      m.setView(cadre[0], 13);
    } else {
      deplacementsAIgnorer.current -= 1; // rien n'a bougé, rien à ignorer
    }
    setBouge(false);
    // `cadreInitial` volontairement hors dépendances : il ne sert qu'au premier
    // cadrage, le relire à chaque rendu ramènerait la carte en arrière.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [situes]);

  // ── Le survol venu de la liste ──────────────────────────────────────────
  useEffect(() => {
    epingles.current.forEach((marqueur, slug) => {
      const el = marqueur.getElement();
      if (el) el.classList.toggle("dk-pin-actif", slug === surligne);
    });
  }, [surligne]);

  return (
    <div className="sticky top-20 hidden h-[calc(100dvh-6.5rem)] w-[38%] max-w-[520px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border xl:flex">
      <div ref={divCarte} className="min-h-0 flex-1" aria-label="Carte des résultats" />

      {/* « Rechercher dans cette zone » — n'apparaît qu'après un déplacement,
          sinon c'est un bouton qui ne fait rien. */}
      {bouge && onChercherIci && (
        <button
          onClick={() => {
            const m = carte.current;
            if (!m) return;
            const b = m.getBounds();
            onChercherIci({
              sud: b.getSouth(),
              ouest: b.getWest(),
              nord: b.getNorth(),
              est: b.getEast(),
            });
            setBouge(false);
          }}
          className="dk-reveal absolute left-1/2 top-3 z-[500] inline-flex min-h-10 -translate-x-1/2 items-center gap-2 rounded-full bg-card px-4 text-sm font-semibold shadow-lg ring-1 ring-border"
        >
          <Crosshair className="h-4 w-4 text-primary" aria-hidden="true" />
          Rechercher dans cette zone
        </button>
      )}

      {/* ⚠ L'AVEU, sous la carte et pas caché dans une infobulle : sans lui,
          une grappe de 33 pastilles au même endroit passe pour 33 hôtels
          réellement voisins. */}
      <p
        className={cn(
          "shrink-0 border-t border-border bg-card px-3 py-2 text-xs leading-relaxed text-muted-foreground",
          situes.length === 0 && "text-center"
        )}
      >
        {situes.length === 0 ? (
          "Aucun résultat n'a de position connue."
        ) : (
          <>
            <MapPin className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
            {situes.length} point{situes.length > 1 ? "s" : ""} sur {points.length} résultat
            {points.length > 1 ? "s" : ""}
            {approches > 0 && (
              <>
                {" · "}
                <span className="font-medium text-foreground">{approches}</span> au centre de la
                commune, pas à l'adresse exacte
              </>
            )}
          </>
        )}
      </p>
    </div>
  );
}
