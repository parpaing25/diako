import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Compass, MapPin } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { FicheCard } from "@/components/FicheCard";
import {
  CATEGORIES,
  chargerDestinations,
  chargerLieu,
  chargerSaisons,
  chercherPages,
  type Lieu,
  type ResultatPage,
} from "@/lib/etablissements";
import { cn } from "@/lib/utils";

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
export default function Explorer() {
  const [params] = useSearchParams();
  const slug = params.get("lieu") ?? params.get("q");

  const [destinations, setDestinations] = useState<Lieu[]>([]);
  const [lieu, setLieu] = useState<Lieu | null>(null);
  const [saisons, setSaisons] = useState<
    { month: number; rating: string; reason: string | null }[]
  >([]);
  const [etabs, setEtabs] = useState<ResultatPage[]>([]);
  const [categorie, setCategorie] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  useDocumentTitle(lieu ? lieu.name_fr : "Explorer Madagascar");

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      if (!slug) {
        setLieu(null);
        setDestinations(await chargerDestinations(80));
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
  }, [slug, categorie]);

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
        <div className="flex h-40 items-center justify-center bg-gradient-to-br from-primary to-primary-soft md:h-56 md:rounded-2xl">
          <div className="px-6 text-center">
            <h1 className="text-2xl font-semibold text-white md:text-3xl">{lieu.name_fr}</h1>
            {lieu.region && <p className="mt-1 text-sm text-white/85">{lieu.region}</p>}
          </div>
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
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
        Les destinations du pays, avec leur saison et les établissements sur
        place.
      </p>

      {chargement ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="dk-skeleton h-32 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {destinations.map((d) => (
            <Link
              key={d.slug}
              to={`/explorer?lieu=${d.slug}`}
              className="group rounded-2xl border border-border p-4 transition hover:border-primary/40 hover:shadow-sm"
            >
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
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
