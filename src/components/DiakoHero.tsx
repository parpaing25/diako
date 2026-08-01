import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserData } from "@/contexts/UserDataContext";
import { SearchBar } from "@/components/SearchBar";
import { CATEGORIES } from "@/lib/categories";
import { chargerDestinations, type Lieu } from "@/lib/etablissements";

/**
 * Bandeau d'accueil — transposition directe de HeroSection de Fonenako.
 *
 * On reprend son langage visuel, qui fonctionne : salutation personnalisée,
 * recherche, carrousel horizontal, puis « stories » de catégories en pastilles
 * dégradées. Le contenu passe de l'immobilier au voyage.
 *
 * Le carrousel de destinations est alimenté par le référentiel `places` :
 * ce sont de vrais lieux, classés par le nombre de récits publiés. Les
 * vignettes mènent à la fiche de destination, qui dit honnêtement combien
 * d'établissements y sont rattachés — zéro compris.
 */
export function DiakoHero({
  categorie,
  onCategorie,
}: {
  categorie: string;
  onCategorie: (k: string) => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useUserData();

  const prenom = profile?.display_name?.split(" ")[0];

  const [destinations, setDestinations] = useState<Lieu[]>([]);
  useEffect(() => {
    void chargerDestinations(12).then(setDestinations).catch(() => undefined);
  }, []);

  return (
    <section className="dk-colonne px-4 pt-4">
      {/* ── Salutation + recherche ─────────────────────────────────────── */}
      <div className="rounded-3xl bg-gradient-to-br from-secondary to-secondary/40 px-5 py-6 md:px-8 md:py-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          {prenom ? `Diako · bonjour ${prenom}` : "Diako"}
        </p>
        <h1 className="mt-1 max-w-[22ch] text-2xl font-semibold leading-tight md:text-4xl md:leading-[1.15] xl:text-[2.75rem]">
          Diako — où dormir, où manger, avec qui partir à Madagascar
        </h1>
        <p className="mt-2 max-w-prose text-sm text-foreground/75 md:text-base">
          Les hôtels, les restaurants et les agences de voyage du pays, avec
          leurs vrais tarifs, leurs menus et leurs circuits.
        </p>

        <SearchBar taille="hero" className="mt-5 max-w-2xl" />

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate("/publier")}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Publier
          </button>
          {!user && (
            <button
              type="button"
              onClick={() => navigate("/auth")}
              className="inline-flex min-h-10 items-center rounded-full border border-border bg-background px-4 text-sm font-medium"
            >
              Créer mon compte
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate("/explorer")}
            className="inline-flex min-h-10 items-center rounded-full border border-border bg-background px-4 text-sm font-medium"
          >
            Explorer Madagascar
          </button>
        </div>
      </div>

      {/* ── Destinations (carrousel horizontal) ─────────────────────────
          Espace réservé même pendant le chargement : aucun décalage de mise en
          page quand la liste arrive. Les destinations sont classées par nombre
          de récits publiés — ce qui est vivant passe devant. */}
      <div className="mt-5">
        <div className="mb-2 flex items-center gap-1.5 px-0.5">
          <Flame className="h-4 w-4 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Destinations de Madagascar</h2>
        </div>

        <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {destinations.length === 0
            ? [0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="dk-skeleton h-[168px] w-[200px] shrink-0 rounded-xl md:w-[228px]"
                />
              ))
            : destinations.map((d) => (
                <button
                  key={d.slug}
                  onClick={() => navigate(`/explorer?lieu=${d.slug}`)}
                  className="group w-[200px] shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-card text-left transition-shadow hover:shadow-md md:w-[228px]"
                >
                  <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-primary/85 to-primary-soft">
                    <span className="px-3 text-center text-sm font-semibold text-white">
                      {d.name_fr}
                    </span>
                    {d.region && (
                      <span className="absolute left-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                        {d.region}
                      </span>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="line-clamp-1 text-sm font-semibold">{d.name_fr}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {d.nb_posts > 0
                        ? `${d.nb_posts} récit${d.nb_posts > 1 ? "s" : ""}`
                        : d.kind === "parc"
                          ? "Parc national"
                          : d.kind === "ile"
                            ? "Île"
                            : d.kind === "plage"
                              ? "Plage"
                              : "À découvrir"}
                    </p>
                  </div>
                </button>
              ))}
        </div>
      </div>

      {/* ── Catégories en pastilles (les « stories » de Fonenako) ───────── */}
      <div
        className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-2 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Catégories"
      >
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const actif = categorie === cat.key;
          return (
            <button
              key={cat.key}
              role="tab"
              aria-selected={actif}
              onClick={() => onCategorie(cat.key)}
              className={`flex shrink-0 flex-col items-center gap-1.5 transition-all duration-200 ${
                actif ? "scale-105" : "opacity-70 hover:opacity-100"
              }`}
            >
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-200 md:h-16 md:w-16 ${
                  actif
                    ? `bg-gradient-to-br ${cat.color} shadow-lg ring-2 ring-primary/30 ring-offset-2 ring-offset-background`
                    : "border border-border bg-card shadow-sm hover:shadow-md"
                }`}
              >
                <Icon
                  className={`h-6 w-6 md:h-7 md:w-7 ${actif ? "text-white" : "text-muted-foreground"}`}
                  aria-hidden="true"
                />
              </span>
              <span
                className={`text-[10px] font-medium md:text-xs ${
                  actif ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {cat.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
