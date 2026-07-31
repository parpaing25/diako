import { useSearchParams } from "react-router-dom";
import { MapPin, Search, SlidersHorizontal, Star, UtensilsCrossed } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { SearchBar } from "@/components/SearchBar";
import { BandeauApercu } from "@/components/BandeauApercu";
import { PlaceCard } from "@/components/PlaceCard";
import { PLACES, PLATS, RECHERCHES_EXEMPLE } from "@/data/apercu";

/**
 * Recherche — la fonctionnalité signature de Diako.
 *
 * Ce que montre cet écran : la « barre de réponse » demandée par Andry, c'est
 * à dire une réponse DIRECTE au-dessus des résultats, et non une liste brute.
 * Deux formes selon l'intention détectée :
 *   · un plat      → les restaurants qui le servent, AVEC le prix chez chacun
 *   · une catégorie + un lieu → le nombre d'établissements et le prix plancher
 *
 * Le moteur réel (résolution d'entités, tsvector, pg_trgm) arrive au Lot 3.
 */
export default function Recherche() {
  const [params] = useSearchParams();
  const q = params.get("q")?.trim() ?? "";
  useDocumentTitle(q ? `« ${q} »` : "Rechercher");

  const norm = q.toLowerCase();
  const plat = PLATS.find((p) => norm.includes(p.nom.toLowerCase().split(" ")[0]));
  const lieuTrouve = /ampefy|nosy|sainte|isalo|andasibe|ifaty|tana|antananarivo|morondava|antsirabe/i.exec(q)?.[0];

  return (
    <div className="px-4 py-5">
      <h1 className="sr-only">Rechercher sur Diako</h1>
      <SearchBar taille="hero" autoFocus={!q} />

      {!q ? (
        <div className="mt-8">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
            <Search className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-xl font-semibold">Posez votre question</h2>
          <p className="mt-2 max-w-prose text-muted-foreground">
            Diako répondra directement : les hôtels d'une destination avec leur
            prix plancher, les restaurants qui servent un plat précis avec le
            tarif chez chacun, les circuits d'une durée donnée.
          </p>

          <h3 className="mt-6 text-sm font-semibold">Exemples de recherches</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {RECHERCHES_EXEMPLE.map((ex) => (
              <a
                key={ex}
                href={`/recherche?q=${encodeURIComponent(ex)}`}
                className="inline-flex min-h-9 items-center rounded-full border border-border px-3 text-sm hover:bg-muted"
              >
                {ex}
              </a>
            ))}
          </div>

          <h3 className="mt-8 text-sm font-semibold">Chercher par plat</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {PLATS.map((p) => (
              <a
                key={p.nom}
                href={`/recherche?q=${encodeURIComponent(p.nom)}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm hover:bg-muted"
              >
                <span aria-hidden="true">{p.emoji}</span>
                {p.nom}
              </a>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-5">
          <BandeauApercu quoi="Voici la forme qu'aura la réponse. Les chiffres et les établissements ci-dessous sont fictifs." />

          {/* ── LA BARRE DE RÉPONSE ─────────────────────────────────────── */}
          <section
            aria-label="Réponse directe"
            className="overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.06]"
          >
            <div className="flex items-start gap-3 px-4 py-3.5">
              <span className="mt-0.5 text-2xl" aria-hidden="true">
                {plat ? plat.emoji : "🏨"}
              </span>
              <div className="min-w-0">
                <p className="font-semibold">
                  {plat
                    ? plat.nom
                    : `Hébergements${lieuTrouve ? ` à ${lieuTrouve}` : ""}`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {plat
                    ? "8 restaurants à Antananarivo, de 8 000 à 32 000 Ar le plat"
                    : `12 établissements${lieuTrouve ? ` à ${lieuTrouve}` : ""} — à partir de 45 000 Ar la nuit, par chambre`}
                </p>
              </div>
            </div>

            {/* Le prix du plat CHEZ CHACUN — c'est très exactement la demande :
                « chercher un plat, faire le tour de tous les restaurants qui
                l'ont, et le montrer dans la barre de réponse ». */}
            {plat && (
              <ul className="divide-y divide-border border-t border-border bg-background/60">
                {[
                  { nom: "Chez Mariette", prix: "12 000 Ar", note: 4.4, km: "1,2 km" },
                  { nom: "Hotely Fanantenana", prix: "8 000 Ar", note: 4.2, km: "2,8 km" },
                  { nom: "La Varangue", prix: "32 000 Ar", note: 4.8, km: "3,1 km" },
                ].map((r) => (
                  <li key={r.nom} className="flex items-center gap-3 px-4 py-2.5">
                    <UtensilsCrossed className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.nom}</span>
                    <span className="shrink-0 text-sm font-semibold text-primary">{r.prix}</span>
                    <span className="hidden shrink-0 items-center gap-0.5 text-xs text-muted-foreground sm:flex">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                      {r.note}
                    </span>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                      {r.km}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-2 border-t border-border bg-background/60 px-4 py-2.5">
              <SlidersHorizontal className="h-4 w-4 self-center text-muted-foreground" aria-hidden="true" />
              {(plat
                ? ["Ouvert maintenant", "À emporter", "Moins de 15 000 Ar"]
                : ["Piscine", "Vue lac", "Bungalow", "Moins de 100 000 Ar"]
              ).map((f) => (
                <span
                  key={f}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-xs"
                >
                  {f}
                </span>
              ))}
            </div>
          </section>

          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Autour d'Antananarivo — le périmètre sera toujours annoncé, jamais
            deviné en silence.
          </p>

          <h2 className="mt-7 text-lg font-semibold">Établissements</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {PLACES.map((p) => (
              <PlaceCard key={p.slug} place={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
