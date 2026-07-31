import { useSearchParams } from "react-router-dom";
import { CalendarDays, Car, MapPin } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { BandeauApercu } from "@/components/BandeauApercu";
import { PlaceCard } from "@/components/PlaceCard";
import { CATEGORIES } from "@/lib/categories";
import { DESTINATIONS, PLACES } from "@/data/apercu";

/**
 * Explorer — la découverte par destination.
 *
 * Les lieux, régions et saisons affichés sont RÉELS (ils viendront du
 * référentiel `places` du Lot 1). Ce qui est fictif, ce sont les
 * établissements rattachés : aucun n'est encore référencé.
 */
export default function Explorer() {
  const [params] = useSearchParams();
  const slug = params.get("lieu");
  const dest = DESTINATIONS.find((d) => d.slug === slug);
  useDocumentTitle(dest ? dest.nom : "Explorer Madagascar");

  if (dest) {
    return (
      <div className="pb-6">
        <div
          className={`flex h-40 items-center justify-center bg-gradient-to-br ${dest.couleur} md:h-56 md:rounded-2xl`}
        >
          <span className="text-7xl" aria-hidden="true">
            {dest.emoji}
          </span>
        </div>

        <div className="px-4 pt-4">
          <p className="text-sm font-medium text-primary">{dest.region}</p>
          <h1 className="mt-0.5 text-2xl font-semibold">{dest.nom}</h1>

          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1">
              <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Idéal {dest.saison}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1">
              <Car className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Temps de route réel — Lot 1
            </span>
          </div>

          <div className="mt-5">
            <BandeauApercu quoi={`La fiche de ${dest.nom} montrera la saison mois par mois, comment s'y rendre et tous les établissements sur place.`} />
          </div>

          <h2 className="text-lg font-semibold">Où dormir et où manger</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {PLACES.map((p) => (
              <PlaceCard key={p.slug} place={p} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-5">
      <h1 className="text-2xl font-semibold">Explorer Madagascar</h1>
      <p className="mt-2 max-w-prose text-muted-foreground">
        Destination par destination : la meilleure saison, comment s'y rendre,
        le temps de route réel, et les adresses sur place.
      </p>

      <div className="mt-5">
        <BandeauApercu quoi="Les destinations et leurs saisons sont réelles ; aucun établissement n'y est encore rattaché." />
      </div>

      <h2 className="text-sm font-semibold">Par catégorie</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {CATEGORIES.filter((c) => c.key !== "all").map((c) => (
          <span
            key={c.key}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm"
          >
            <c.icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            {c.label}
          </span>
        ))}
      </div>

      <h2 className="mt-7 text-sm font-semibold">Destinations</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DESTINATIONS.map((d) => (
          <a
            key={d.slug}
            href={`/explorer?lieu=${d.slug}`}
            className="group overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-md"
          >
            <div className={`flex aspect-video items-center justify-center bg-gradient-to-br ${d.couleur}`}>
              <span className="text-5xl" aria-hidden="true">
                {d.emoji}
              </span>
            </div>
            <div className="p-3">
              <p className="font-semibold">{d.nom}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {d.region} · idéal {d.saison}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
