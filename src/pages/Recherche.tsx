import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MapPin, Search, SlidersHorizontal, Star, UtensilsCrossed } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { SearchBar } from "@/components/SearchBar";
import { FicheCard } from "@/components/FicheCard";
import {
  ariary,
  CATEGORIES,
  chargerDestinations,
  chargerPlats,
  chercherPages,
  recitsParLieu,
  resoudreLieu,
  resoudrePlat,
  restaurantsParPlat,
  unite,
  type Lieu,
  type Plat,
  type ResultatPage,
} from "@/lib/etablissements";
import { cn } from "@/lib/utils";

/**
 * Recherche — la fonctionnalité signature de Diako.
 *
 * ⚠ CE QUI A CHANGÉ : cet écran ne faisait AUCUNE requête. Il exécutait deux
 *   expressions régulières sur la chaîne saisie, puis affichait « 12
 *   établissements — à partir de 45 000 Ar » et trois restaurants écrits en
 *   dur. « hotel Tulear » ne trouvait rien parce que « tulear » ne figurait
 *   pas dans la liste codée en dur des lieux.
 *
 * Désormais tout passe par la base :
 *   · le terme est résolu contre le référentiel — « majunga » trouve
 *     Mahajanga, « ravi-toto » trouve le ravitoto, « nosi be » aussi ;
 *   · la barre de réponse donne des chiffres calculés, jamais fabriqués ;
 *   · les filtres sont des BOUTONS qui filtrent réellement (c'étaient des
 *     <span> : l'apparence d'un filtre actif, aucun effet) ;
 *   · les 28 récits publiés remontent enfin, parce qu'ils sont rattachés au
 *     référentiel des lieux.
 */

const BUDGETS = [
  { label: "Moins de 50 000 Ar", valeur: 50000 },
  { label: "Moins de 100 000 Ar", valeur: 100000 },
  { label: "Moins de 200 000 Ar", valeur: 200000 },
];

/**
 * Les équipements les plus demandés, en filtres directs.
 *
 * Ce sont exactement les contraintes qu'un voyageur pose à voix haute :
 * « avec piscine », « avec wifi », « adapté aux familles ». Le référentiel en
 * compte plus de soixante-dix — on met en avant ceux qui décident vraiment
 * d'un choix, le reste passe par l'agent.
 */
const EQUIPEMENTS_COURANTS = [
  { code: "piscine", label: "Piscine" },
  { code: "piscine-chauffee", label: "Piscine chauffée" },
  { code: "wifi", label: "Wi-Fi" },
  { code: "restaurant-sur-place", label: "Restaurant" },
  { code: "vue-lac", label: "Vue sur le lac" },
  { code: "famille", label: "Familles" },
  { code: "eau-chaude", label: "Eau chaude" },
];

interface Recit {
  id: string;
  body: string | null;
  place: string | null;
  created_at: string;
}

export default function Recherche() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q")?.trim() ?? "";
  const categorie = params.get("cat");
  const budget = params.get("max") ? Number(params.get("max")) : null;
  const equipements = params.get("eq")?.split(",").filter(Boolean) ?? [];

  useDocumentTitle(q ? `« ${q} »` : "Rechercher");

  const [lieu, setLieu] = useState<{ id: string; slug: string; name_fr: string } | null>(null);
  const [plat, setPlat] = useState<{ id: string; slug: string; name_fr: string } | null>(null);
  const [fiches, setFiches] = useState<ResultatPage[]>([]);
  const [tables, setTables] = useState<
    Awaited<ReturnType<typeof restaurantsParPlat>>
  >([]);
  const [recits, setRecits] = useState<Recit[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(false);

  // Suggestions d'accueil : tirées du référentiel réel, plus jamais d'un
  // fichier d'exemples.
  const [destinations, setDestinations] = useState<Lieu[]>([]);
  const [plats, setPlats] = useState<Plat[]>([]);

  useEffect(() => {
    if (q) return;
    void Promise.all([chargerDestinations(12), chargerPlats(18)])
      .then(([d, p]) => {
        setDestinations(d);
        setPlats(p);
      })
      .catch(() => setErreur(true));
  }, [q]);

  const lancer = useCallback(async () => {
    if (!q) return;
    setChargement(true);
    setErreur(false);
    try {
      // On résout d'abord l'intention : un lieu, un plat, ou les deux.
      // « ravitoto à Majunga » doit être compris comme les deux à la fois.
      const [lieux, platsTrouves] = await Promise.all([resoudreLieu(q, 1), resoudrePlat(q, 1)]);
      const l = lieux[0] ?? null;
      const p = platsTrouves[0] ?? null;
      setLieu(l);
      setPlat(p);

      const [pages, restos, posts] = await Promise.all([
        chercherPages({
          lieu: l?.slug ?? null,
          categorie,
          prixMax: budget,
          plat: p?.slug ?? null,
          equipements: equipements.length ? equipements : null,
          limite: 24,
        }),
        p ? restaurantsParPlat(p.slug, l?.slug ?? null, 12) : Promise.resolve([]),
        l ? recitsParLieu(l.id, 6) : Promise.resolve([]),
      ]);
      setFiches(pages);
      setTables(restos);
      setRecits(posts as Recit[]);
    } catch {
      setErreur(true);
    } finally {
      setChargement(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, categorie, budget, params.get("eq")]);

  useEffect(() => {
    void lancer();
  }, [lancer]);

  /** Bascule un filtre dans l'URL : partageable, et le retour arrière marche. */
  function basculer(cle: string, valeur: string | null) {
    const suivant = new URLSearchParams(params);
    if (valeur === null || suivant.get(cle) === valeur) suivant.delete(cle);
    else suivant.set(cle, valeur);
    setParams(suivant, { replace: true });
  }

  /** Les équipements s'ACCUMULENT : « piscine » ET « wifi », pas l'un ou l'autre. */
  function basculerEquipement(code: string) {
    const suivant = new URLSearchParams(params);
    const liste = equipements.includes(code)
      ? equipements.filter((e) => e !== code)
      : [...equipements, code];
    if (liste.length) suivant.set("eq", liste.join(","));
    else suivant.delete("eq");
    setParams(suivant, { replace: true });
  }

  /* ── Écran d'accueil de la recherche ─────────────────────────────────── */
  if (!q) {
    return (
      <div className="px-4 py-5">
        <h1 className="sr-only">Rechercher sur Diako</h1>
        <SearchBar taille="hero" autoFocus />

        <div className="mt-8">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
            <Search className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-xl font-semibold">Où dormir, où manger, avec qui partir</h2>
          <p className="mt-2 max-w-prose text-muted-foreground">
            Tapez une destination — <em>Majunga</em>, <em>Tuléar</em>,{" "}
            <em>Sainte-Marie</em> — ou un plat. L'orthographe n'a pas
            d'importance : <em>Majunga</em> et <em>Mahajanga</em> mènent au même
            endroit, comme <em>ravitoto</em> et <em>ravi-toto</em>.
          </p>

          {destinations.length > 0 && (
            <>
              <h3 className="mt-8 text-sm font-semibold">Destinations</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {destinations.map((d) => (
                  <Link
                    key={d.slug}
                    to={`/recherche?q=${encodeURIComponent(d.name_fr)}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm hover:bg-muted"
                  >
                    <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    {d.name_fr}
                    {d.nb_posts > 0 && (
                      <span className="text-xs text-muted-foreground">{d.nb_posts}</span>
                    )}
                  </Link>
                ))}
              </div>
            </>
          )}

          {plats.length > 0 && (
            <>
              <h3 className="mt-8 text-sm font-semibold">Chercher par plat</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {plats.map((p) => (
                  <Link
                    key={p.slug}
                    to={`/recherche?q=${encodeURIComponent(p.name_fr)}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm hover:bg-muted"
                  >
                    <UtensilsCrossed className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                    {p.name_fr}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ── Résultats ───────────────────────────────────────────────────────── */
  const rien = !chargement && fiches.length === 0 && tables.length === 0;

  return (
    <div className="px-4 py-5">
      <h1 className="sr-only">Résultats pour « {q} »</h1>
      <SearchBar taille="hero" />

      <div className="mt-5">
        {/* ── LA BARRE DE RÉPONSE ───────────────────────────────────────── */}
        <section
          aria-label="Réponse directe"
          className="overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.06]"
        >
          <div className="flex items-start gap-3 px-4 py-3.5">
            <span className="mt-0.5 text-2xl" aria-hidden="true">
              {plat ? "🍽️" : "🏨"}
            </span>
            <div className="min-w-0">
              <p className="font-semibold">
                {plat?.name_fr ?? (lieu ? lieu.name_fr : `« ${q} »`)}
                {plat && lieu && ` à ${lieu.name_fr}`}
              </p>
              <p className="text-sm text-muted-foreground">
                {chargement
                  ? "Recherche en cours…"
                  : plat
                    ? tables.length > 0
                      ? `${tables.length} ${tables.length > 1 ? "établissements le servent" : "établissement le sert"}, de ${ariary(
                          Math.min(...tables.map((t) => t.price_ar ?? Infinity))
                        )} à ${ariary(Math.max(...tables.map((t) => t.price_ar ?? 0)))}`
                      : "Aucun établissement ne l'a encore inscrit à sa carte."
                    : fiches.length > 0
                      ? `${fiches.length} établissement${fiches.length > 1 ? "s" : ""}${
                          lieu ? ` à ${lieu.name_fr}` : ""
                        }${
                          fiches.some((f) => f.price_min_ar)
                            ? ` — à partir de ${ariary(
                                Math.min(
                                  ...fiches.filter((f) => f.price_min_ar).map((f) => f.price_min_ar!)
                                )
                              )} ${unite(fiches.find((f) => f.price_min_ar)?.price_min_unit)}`
                            : ""
                        }`
                      : lieu
                        ? `Aucun établissement référencé à ${lieu.name_fr} pour l'instant.`
                        : "Aucune destination ni aucun plat ne correspond."}
              </p>
            </div>
          </div>

          {/* Le prix du plat CHEZ CHACUN — la demande d'origine, mot pour mot :
              « chercher un plat, faire le tour de tous les restaurants qui
              l'ont, et le montrer dans la barre de réponse ». */}
          {tables.length > 0 && (
            <ul className="divide-y divide-border border-t border-border bg-background/60">
              {tables.map((r) => (
                <li key={`${r.page_id}-${r.nom_sur_la_carte}`}>
                  <Link
                    to={`/p/${r.page_slug}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50"
                  >
                    <UtensilsCrossed className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.page_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.nom_sur_la_carte}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-primary">
                      {ariary(r.price_ar)}
                    </span>
                    {r.rating_count > 0 && (
                      <span className="hidden shrink-0 items-center gap-0.5 text-xs text-muted-foreground sm:flex">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                        {r.rating_avg.toFixed(1)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/* Filtres RÉELS : des boutons, focusables, qui modifient l'URL. */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border bg-background/60 px-4 py-2.5">
            <SlidersHorizontal
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            {CATEGORIES.slice(0, 4).map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => basculer("cat", c.code)}
                aria-pressed={categorie === c.code}
                className={cn(
                  "min-h-8 rounded-full border px-2.5 text-xs transition",
                  categorie === c.code
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted"
                )}
              >
                {c.label}
              </button>
            ))}
            {BUDGETS.map((b) => (
              <button
                key={b.valeur}
                type="button"
                onClick={() => basculer("max", String(b.valeur))}
                aria-pressed={budget === b.valeur}
                className={cn(
                  "min-h-8 rounded-full border px-2.5 text-xs transition",
                  budget === b.valeur
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted"
                )}
              >
                {b.label}
              </button>
            ))}
            {EQUIPEMENTS_COURANTS.map((e) => (
              <button
                key={e.code}
                type="button"
                onClick={() => basculerEquipement(e.code)}
                aria-pressed={equipements.includes(e.code)}
                className={cn(
                  "min-h-8 rounded-full border px-2.5 text-xs transition",
                  equipements.includes(e.code)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted"
                )}
              >
                {e.label}
              </button>
            ))}
          </div>
        </section>

        {lieu && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Périmètre : {lieu.name_fr} et ses environs — annoncé, jamais deviné en
            silence.
          </p>
        )}

        {erreur && (
          <div className="mt-5 rounded-2xl border border-border p-5 text-center">
            <p className="font-medium">La recherche n'a pas abouti</p>
            <button
              onClick={() => void lancer()}
              className="mt-3 min-h-10 rounded-full border border-input px-5 text-sm font-medium"
            >
              Réessayer
            </button>
          </div>
        )}

        {chargement && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="dk-skeleton h-64 rounded-2xl" />
            ))}
          </div>
        )}

        {fiches.length > 0 && (
          <>
            <h2 className="mt-7 text-lg font-semibold">Établissements</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {fiches.map((f) => (
                <FicheCard key={f.id} fiche={f} platCherche={!!plat} />
              ))}
            </div>
          </>
        )}

        {/* Les récits publiés. C'est le seul contenu réel du site aujourd'hui,
            et il était introuvable : la recherche n'interrogeait jamais posts. */}
        {recits.length > 0 && (
          <>
            <h2 className="mt-8 text-lg font-semibold">
              Récits de voyageurs{lieu ? ` à ${lieu.name_fr}` : ""}
            </h2>
            <ul className="mt-3 divide-y divide-border rounded-2xl border border-border">
              {recits.map((r) => (
                <li key={r.id}>
                  <Link to={`/post/${r.id}`} className="block px-4 py-3 hover:bg-muted/50">
                    <p className="line-clamp-2 text-sm">{r.body ?? "Publication photo"}</p>
                    {r.place && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" aria-hidden="true" />
                        {r.place}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        {rien && !erreur && (
          <div className="mt-6 rounded-2xl border border-dashed border-border px-5 py-10 text-center">
            <p className="font-medium">
              {lieu || plat
                ? "Rien de référencé ici pour l'instant"
                : "Aucun résultat"}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {lieu || plat
                ? "Les établissements arrivent au fur et à mesure qu'ils créent leur page. Si vous en tenez un, la vôtre prend cinq minutes."
                : "Essayez une destination (Majunga, Tuléar, Nosy Be) ou un plat (ravitoto, romazava)."}
            </p>
            {(lieu || plat) && (
              <Link
                to="/pro"
                className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
              >
                Inscrire mon établissement
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
