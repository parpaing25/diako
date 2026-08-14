import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowLeft, LocateFixed, MapPin, Star, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ImageProgressive } from "@/components/ImageProgressive";
import { useSEO } from "@/hooks/useSEO";
import { ariary, CATEGORIES, unite, type Categorie } from "@/lib/etablissements";
import { cn } from "@/lib/utils";

/**
 * La carte — /carte
 *
 * OpenStreetMap via Leaflet : gratuit, sans clé, sans compte à surveiller.
 *
 * ⚠ CE QUE J'AI TROUVÉ EN LA CONSTRUISANT. Sur les 54 fiches publiées, AUCUNE
 *   n'a de coordonnées propres : toutes retombent sur le centroïde de leur
 *   lieu. Les décaler « pour faire joli » reviendrait à dire au voyageur qu'un
 *   hôtel est là où il n'est pas. On les REGROUPE donc par position, la
 *   pastille porte le nombre, et le panneau les liste toutes — et chaque fiche
 *   dit franchement si son point est exact ou seulement celui de la commune.
 *
 * ⚠ 3G. Le morceau Leaflet (~150 Ko) n'est chargé que par cette route, qui est
 *   en lazy(). Une seule requête, colonnes explicites, jamais select=*.
 */

interface PointCarte {
  id: string;
  slug: string;
  name: string;
  categories: Categorie[];
  cover_url: string | null;
  lat: number;
  lng: number;
  precision_geo: "exacte" | "lieu";
  geo_source: string | null;
  place_name: string | null;
  price_min_ar: number | null;
  price_min_unit: string | null;
  rating_avg: number;
  rating_count: number;
}

const CENTRE_MADAGASCAR: [number, number] = [-18.9, 46.9];

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

export default function Carte() {
  useSEO({
    titre: "Carte des hôtels et restaurants de Madagascar",
    description:
      "Trouvez sur la carte les hôtels, restaurants, agences et sites à visiter de Madagascar, avec leurs tarifs en ariary.",
    url: "https://diako.fonenako.mg/carte",
  });

  const navigate = useNavigate();
  const [params] = useSearchParams();
  const divCarte = useRef<HTMLDivElement>(null);
  const carte = useRef<L.Map | null>(null);
  const couche = useRef<L.LayerGroup | null>(null);
  const cibleRef = useRef<string | null>(params.get("focus"));

  const [points, setPoints] = useState<PointCarte[]>([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState<Categorie | "tout">(
    (params.get("cat") as Categorie) || "tout"
  );
  const [choisis, setChoisis] = useState<PointCarte[] | null>(null);

  // ── Une seule requête, tout Madagascar ────────────────────────────────
  useEffect(() => {
    void supabase
      .rpc("pages_carte", { p_categorie: null, p_limite: 600 })
      .then(({ data, error }) => {
        if (error) toast.error("La carte n'a pas pu être chargée.");
        setPoints((data as PointCarte[] | null) ?? []);
        setChargement(false);
      });
  }, []);

  const visibles = useMemo(
    () => (filtre === "tout" ? points : points.filter((p) => p.categories.includes(filtre))),
    [points, filtre]
  );

  // ── Initialisation, une seule fois ────────────────────────────────────
  useEffect(() => {
    if (!divCarte.current || carte.current) return;
    const m = L.map(divCarte.current, {
      center: CENTRE_MADAGASCAR,
      zoom: 6,
      zoomControl: false,
      attributionControl: true,
    });
    L.control.zoom({ position: "bottomright" }).addTo(m);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(m);
    couche.current = L.layerGroup().addTo(m);
    carte.current = m;
    return () => {
      m.remove();
      carte.current = null;
      couche.current = null;
    };
  }, []);

  // ── Les marqueurs, regroupés par position ─────────────────────────────
  useEffect(() => {
    const l = couche.current;
    const m = carte.current;
    if (!l || !m) return;
    l.clearLayers();

    const groupes = new Map<string, PointCarte[]>();
    visibles.forEach((p) => {
      const cle = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
      groupes.set(cle, [...(groupes.get(cle) ?? []), p]);
    });

    const cadre: [number, number][] = [];
    groupes.forEach((items) => {
      const { lat, lng } = items[0];
      cadre.push([lat, lng]);
      const n = items.length;
      const icone = L.divIcon({
        className: "",
        html:
          n > 1
            ? `<div class="dk-pin dk-pin--groupe">${n}</div>`
            : `<div class="dk-pin">${EMOJI[items[0].categories[0]] ?? "📍"}</div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      });
      L.marker([lat, lng], { icon: icone, title: n > 1 ? `${n} adresses` : items[0].name })
        .addTo(l)
        .on("click", () => setChoisis(items));
    });

    // /carte?focus=<slug> depuis une fiche : on se pose dessus, panneau ouvert.
    const cible = cibleRef.current;
    if (cible) {
      const p = visibles.find((x) => x.slug === cible);
      if (p) {
        cibleRef.current = null;
        m.setView([p.lat, p.lng], 14);
        setChoisis(groupes.get(`${p.lat.toFixed(4)},${p.lng.toFixed(4)}`) ?? [p]);
        return;
      }
    }
    if (cadre.length > 1)
      m.fitBounds(L.latLngBounds(cadre), { padding: [40, 40], maxZoom: 12 });
    else if (cadre.length === 1) m.setView(cadre[0], 12);
  }, [visibles]);

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

  return (
    <div className="fixed inset-0 z-10 flex flex-col bg-background pt-[var(--header-h,3.5rem)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
        <button
          onClick={() => navigate(-1)}
          aria-label="Retour"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <h1 className="mr-1 inline-flex items-center gap-1.5 font-semibold">
          <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
          Carte
        </h1>
        <button
          onClick={meLocaliser}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-input px-3 text-sm"
        >
          <LocateFixed className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Autour de moi</span>
        </button>

        <div className="-mx-3 w-[calc(100%+1.5rem)] overflow-x-auto px-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-1.5">
            {(["tout", ...CATEGORIES.map((c) => c.code)] as const).map((c) => {
              const actif = filtre === c;
              const n =
                c === "tout"
                  ? points.length
                  : points.filter((p) => p.categories.includes(c as Categorie)).length;
              if (c !== "tout" && n === 0) return null;
              return (
                <button
                  key={c}
                  onClick={() => {
                    setFiltre(c as Categorie | "tout");
                    setChoisis(null);
                  }}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition",
                    actif
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  )}
                >
                  {c === "tout"
                    ? "Tout"
                    : CATEGORIES.find((x) => x.code === c)?.pluriel ?? c}
                  <span className="ml-1 opacity-70">{n}</span>
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
        {!chargement && visibles.length === 0 && (
          <div className="absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded-full border border-border bg-card px-4 py-2 text-sm shadow">
            Aucune adresse pour ce filtre
          </div>
        )}

        {choisis && (
          <div className="absolute inset-x-0 bottom-[calc(4rem+var(--safe-b,0px))] z-[600] flex max-h-[58%] flex-col rounded-t-2xl border-t border-border bg-card shadow-2xl md:bottom-0">
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
              /* D'où vient le point : un relevé OpenStreetMap ne se discute pas
                 comme une épingle posée par le gérant. */
              choisis[0].geo_source && (
                <p className="border-b border-border bg-primary/5 px-4 py-1.5 text-xs text-muted-foreground">
                  Position relevée ·{" "}
                  {choisis[0].geo_source.startsWith("OSM") ||
                  choisis[0].geo_source.startsWith("Nominatim")
                    ? "source OpenStreetMap"
                    : choisis[0].geo_source}
                </p>
              )
            )}

            <ul className="divide-y divide-border overflow-y-auto overscroll-contain">
              {choisis.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/p/${p.slug}`}
                    className="flex items-center gap-3 p-3 hover:bg-muted/40"
                  >
                    <span className="h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                      {p.cover_url ? (
                        <ImageProgressive src={p.cover_url} alt="" ajustement="cover" />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-lg">
                          {EMOJI[p.categories[0]] ?? "📍"}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {p.categories
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
                          <span className="text-xs text-muted-foreground">Tarif non communiqué</span>
                        )}
                        {p.rating_count > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                            <Star
                              className="h-3 w-3 fill-amber-400 text-amber-400"
                              aria-hidden="true"
                            />
                            {p.rating_avg.toFixed(1)}
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
