import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, LocateFixed, MapPin, Star } from "lucide-react";
import {
  autourDeMoi,
  demanderPosition,
  distanceLisible,
  lieuLePlusProche,
  oublierPosition,
  positionEnMemoire,
  type EtablissementProche,
  type LieuProche,
} from "@/lib/geo";
import { ariary, CATEGORIES, unite } from "@/lib/etablissements";
import { cn } from "@/lib/utils";

const RAYONS = [
  { km: 5, label: "5 km" },
  { km: 25, label: "25 km" },
  { km: 100, label: "100 km" },
];

/**
 * « Ce qu'il y a autour de moi. »
 *
 * La question d'un voyageur sur place n'est pas « quels hôtels existe-t-il à
 * Madagascar » mais « qu'est-ce qu'il y a ICI, maintenant ». Le calcul se fait
 * en base sur les vraies coordonnées, et rend une distance — pas une
 * approximation de ville.
 *
 * ⚠ Le refus de géolocalisation est un résultat NORMAL. On ne redemande pas,
 *   on n'affiche pas d'avertissement culpabilisant : le site marche sans, et
 *   la recherche par destination reste à un clic.
 */
export function AutourDeMoi({ compact = false }: { compact?: boolean }) {
  const [etat, setEtat] = useState<"repos" | "recherche" | "ok" | "refus" | "vide">(
    positionEnMemoire() ? "repos" : "repos"
  );
  const [lieu, setLieu] = useState<LieuProche | null>(null);
  const [etabs, setEtabs] = useState<EtablissementProche[]>([]);
  const [rayon, setRayon] = useState(25);
  const [categorie, setCategorie] = useState<string | null>(null);

  const chercher = useCallback(
    async (km = rayon, cat = categorie) => {
      setEtat("recherche");
      const p = await demanderPosition();
      if (!p) {
        setEtat("refus");
        return;
      }
      try {
        const [l, e] = await Promise.all([
          lieuLePlusProche(p),
          autourDeMoi(p, { rayonKm: km, categorie: cat, limite: 12 }),
        ]);
        setLieu(l);
        setEtabs(e);
        setEtat(e.length ? "ok" : "vide");
      } catch {
        setEtat("vide");
      }
    },
    [rayon, categorie]
  );

  if (etat === "repos") {
    return (
      <button
        onClick={() => void chercher()}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-input font-medium",
          compact ? "min-h-9 px-3 text-sm" : "min-h-11 px-5"
        )}
      >
        <LocateFixed className="h-4 w-4 text-primary" aria-hidden="true" />
        Autour de moi
      </button>
    );
  }

  if (etat === "recherche") {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Je regarde où vous êtes…
      </div>
    );
  }

  if (etat === "refus") {
    return (
      <div className="rounded-2xl border border-border p-4">
        <p className="text-sm font-medium">Position non partagée</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Pas de souci : tapez une destination dans la recherche, ça marche
          aussi bien. Vous pouvez autoriser la position plus tard dans les
          réglages de votre navigateur.
        </p>
        <button
          onClick={() => {
            oublierPosition();
            setEtat("repos");
          }}
          className="mt-3 min-h-10 rounded-full border border-input px-4 text-sm font-medium"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <section aria-labelledby="titre-autour" className="rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="titre-autour" className="font-semibold">
            {lieu ? `Vous êtes vers ${lieu.nom}` : "Autour de vous"}
          </h2>
          {lieu && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {lieu.region ? `${lieu.region} · ` : ""}
              {distanceLisible(lieu.distance_km)} du centre
              {lieu.nb_etablissements > 0 && ` · ${lieu.nb_etablissements} établissements référencés`}
            </p>
          )}
        </div>
        <button
          onClick={() => {
            oublierPosition();
            setEtat("repos");
            setEtabs([]);
            setLieu(null);
          }}
          className="shrink-0 text-xs text-muted-foreground underline underline-offset-4"
        >
          Changer
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {RAYONS.map((r) => (
          <button
            key={r.km}
            onClick={() => {
              setRayon(r.km);
              void chercher(r.km, categorie);
            }}
            aria-pressed={rayon === r.km}
            className={cn(
              "min-h-8 rounded-full border px-2.5 text-xs transition",
              rayon === r.km
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted"
            )}
          >
            {r.label}
          </button>
        ))}
        {["hotel", "restaurant"].map((c) => (
          <button
            key={c}
            onClick={() => {
              const suivant = categorie === c ? null : c;
              setCategorie(suivant);
              void chercher(rayon, suivant);
            }}
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

      {etat === "vide" ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Rien de référencé à moins de {rayon} km. Essayez un rayon plus large —
          Diako commence tout juste à couvrir Madagascar.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {etabs.map((e) => (
            <li key={e.id}>
              <Link to={`/p/${e.slug}`} className="flex items-start gap-3 py-2.5 hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {e.place_name && (
                      <span className="inline-flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" aria-hidden="true" />
                        {e.place_name}
                      </span>
                    )}
                    {e.price_min_ar != null && (
                      <span>
                        dès {ariary(e.price_min_ar)} {unite(e.price_min_unit)}
                      </span>
                    )}
                    {e.rating_count > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                        {e.rating_avg.toFixed(1)}
                      </span>
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-medium text-primary">
                  {/* Une fiche sans coordonnées ne peut pas être classée par
                      distance : on le dit plutôt que d'inventer un chiffre. */}
                  {e.distance_km != null ? distanceLisible(e.distance_km) : "à situer"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
