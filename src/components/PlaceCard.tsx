import { Link } from "react-router-dom";
import { MapPin, Star } from "lucide-react";

export interface PlaceApercu {
  slug: string;
  nom: string;
  categorie: string;
  lieu: string;
  note: number;
  avis: number;
  prixDepuis: string;
  unite: string;
  emoji: string;
  couleur: string;
  verifie?: boolean;
}

/**
 * Carte d'établissement — format compact, pour les carrousels et les résultats
 * de recherche. Le fil, lui, utilise PostCard en pleine largeur (deux formats
 * assumés, comme prévu au TDR).
 *
 * ⚠ Le prix porte TOUJOURS son unité (« la nuit », « le plat »). Un montant
 * sans unité rend toute comparaison fausse : c'est la règle §5.11 du TDR, née
 * du bricolage prix_vente / loyer_mensuel de Fonenako.
 */
export function PlaceCard({ place }: { place: PlaceApercu }) {
  return (
    <Link
      to={`/p/${place.slug}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-md"
    >
      <div
        className={`relative flex aspect-video items-center justify-center bg-gradient-to-br ${place.couleur}`}
      >
        <span className="text-5xl" aria-hidden="true">
          {place.emoji}
        </span>
        <span className="absolute left-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold capitalize text-white backdrop-blur-sm">
          {place.categorie}
        </span>
        {place.verifie && (
          <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
            ✓ vérifié
          </span>
        )}
      </div>

      <div className="p-3">
        <p className="line-clamp-1 font-semibold">{place.nom}</p>

        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" aria-hidden="true" />
          {place.lieu}
        </p>

        <div className="mt-2 flex items-end justify-between gap-2">
          <p className="flex items-center gap-1 text-xs">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
            <span className="font-semibold">{place.note.toFixed(1)}</span>
            <span className="text-muted-foreground">({place.avis})</span>
          </p>
          <p className="text-right">
            <span className="block text-[10px] leading-none text-muted-foreground">
              à partir de
            </span>
            <span className="text-sm font-bold text-primary">{place.prixDepuis}</span>
            <span className="block text-[10px] leading-none text-muted-foreground">
              {place.unite}
            </span>
          </p>
        </div>
      </div>
    </Link>
  );
}
