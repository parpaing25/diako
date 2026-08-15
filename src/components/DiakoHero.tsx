import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, Map as MapIcon, Plus } from "lucide-react";
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
      <div className="dk-papier relative overflow-hidden rounded-3xl border border-border bg-secondary px-5 py-7 md:px-8 md:py-9">
        <div className="dk-tissage absolute inset-x-0 top-0" aria-hidden="true" />
        <p className="dk-etiquette">
          {prenom ? `Bonjour ${prenom}` : "Réseau de voyage malgache"}
        </p>
        {/* ⚠ Le titre disait « Diako — où dormir, où manger, avec qui partir » :
            un sommaire de rubriques, pas une promesse. Ce site n'est pas un
            annuaire, c'est ce que les gens rapportent de leurs voyages. */}
        <h1 className="dk-edito mt-2 max-w-[16ch] text-[1.75rem] md:text-[2.6rem] xl:text-[3rem]">
          Madagascar se raconte{" "}
          <em className="dk-souligne">par ceux qui y vont.</em>
        </h1>
        <p className="mt-3 max-w-prose text-sm text-foreground/75 md:text-base">
          Les hôtels, les tables et les agences du pays — avec les tarifs
          réellement payés, écrits par des voyageurs.
        </p>

        <SearchBar taille="hero" className="mt-5 max-w-2xl" />

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate("/publier")}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground shadow-sm transition hover:brightness-95"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Raconter un voyage
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
            className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-5 text-sm font-medium"
          >
            Explorer Madagascar
          </button>
          <button
            type="button"
            onClick={() => navigate("/carte")}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-background px-5 text-sm font-medium"
          >
            <MapIcon className="h-4 w-4" aria-hidden="true" />
            Voir la carte
          </button>
        </div>
      </div>

      {/* ── Destinations (carrousel horizontal) ─────────────────────────
          Espace réservé même pendant le chargement : aucun décalage de mise en
          page quand la liste arrive. Les destinations sont classées par nombre
          de récits publiés — ce qui est vivant passe devant. */}
      <div className="mt-5">
        <div className="mb-2 flex items-center gap-1.5 px-0.5">
          <Flame className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <h2 className="dk-etiquette">Régions actives cette semaine</h2>
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
                  onClick={() => navigate(`/lieu/${d.slug}`)}
                  className="group w-[200px] shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-card text-left transition-shadow hover:shadow-md md:w-[228px]"
                >
                  <div className="relative flex aspect-video items-center justify-center bg-primary/95">
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
