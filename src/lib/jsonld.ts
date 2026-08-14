// ============================================================================
// Données structurées schema.org — constructeurs purs, couverts par des tests.
//
// TRANSCRIPTION du module éprouvé de Fonenako, retypé pour le voyage. On garde
// ses deux principes, qui viennent d'erreurs réellement commises là-bas :
//
//  ① AUCUNE CLÉ VIDE N'EST ÉMISE. Un `priceRange: ""` ou un `telephone: null`
//     n'aide personne et fait échouer la validation de Google.
//
//  ② LE TYPE DIT LA VÉRITÉ. Sur le projet frère, un `RentalCarListing`
//     (location de VOITURE) avait été posé sur des annonces de location
//     immobilière. Ici : un hôtel est un `LodgingBusiness`, un restaurant un
//     `Restaurant`, une agence une `TravelAgency`, un circuit un `TouristTrip`.
//     Quand schema.org n'a pas de type juste, on prend le plus proche HONNÊTE
//     plutôt qu'un type flatteur et faux.
//
// Pourquoi ça compte ici plus qu'ailleurs : Diako est un ANNUAIRE. Sans
// balisage, Google affiche une ligne bleue ; avec, il affiche la note, la
// fourchette de prix et le fil d'Ariane. C'est la différence entre exister et
// être trouvé.
// ============================================================================

export const SITE = 'https://diako.fonenako.mg';

type Bloc = Record<string, unknown>;

/** Retire les clés nulles, vides ou à tableau vide, en profondeur. */
function propre<T extends Bloc>(o: T): T {
  const r: Bloc = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    r[k] = v;
  }
  return r as T;
}

export interface FichePourJsonLd {
  slug: string;
  name: string;
  categories: string[];
  short_desc?: string | null;
  long_desc?: string | null;
  address?: string | null;
  landmark?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  cover_url?: string | null;
  gallery?: string[] | null;
  price_min_ar?: number | null;
  price_min_unit?: string | null;
  price_level?: number | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  place?: { name: string; region?: string | null } | null;
  amenities?: { code: string; label: string }[] | null;
  cuisines?: string[] | null;
  hours?: { jour: number; ouvre: string | null; ferme: string | null; ferme_journee: boolean }[] | null;
}

/**
 * Le type schema.org d'un établissement.
 *
 * L'ordre compte : un écolodge est souvent hôtel ET restaurant, et
 * `LodgingBusiness` est alors le bon type principal — c'est ce qu'on vient y
 * chercher. Le reste est décrit par `servesCuisine` et `amenityFeature`.
 */
export function typeSchema(categories: string[]): string {
  if (categories.includes('hotel')) return 'LodgingBusiness';
  if (categories.includes('restaurant')) return 'Restaurant';
  if (categories.includes('agence_voyage')) return 'TravelAgency';
  if (categories.includes('site_attraction')) return 'TouristAttraction';
  if (categories.includes('location_vehicule')) return 'AutoRental';
  // Guide, transporteur, événementiel : pas de type dédié dans schema.org.
  // `LocalBusiness` est le plus proche honnête.
  return 'LocalBusiness';
}

const JOURS_SCHEMA = [
  'https://schema.org/Sunday',
  'https://schema.org/Monday',
  'https://schema.org/Tuesday',
  'https://schema.org/Wednesday',
  'https://schema.org/Thursday',
  'https://schema.org/Friday',
  'https://schema.org/Saturday',
];

/** Le JSON-LD d'une fiche d'établissement. */
export function construireFicheJsonLd(f: FichePourJsonLd): Bloc {
  const url = `${SITE}/p/${f.slug}`;
  const images = [f.cover_url, ...(f.gallery ?? [])].filter(Boolean).slice(0, 8) as string[];

  const bloc: Bloc = propre({
    '@context': 'https://schema.org',
    '@type': typeSchema(f.categories),
    '@id': url,
    url,
    name: f.name,
    description: f.short_desc || f.long_desc || null,
    image: images,
    telephone: f.phone,
    email: f.email,
    sameAs: f.website ? [f.website] : [],
  });

  if (f.address || f.place) {
    bloc.address = propre({
      '@type': 'PostalAddress',
      streetAddress: f.address,
      addressLocality: f.place?.name,
      addressRegion: f.place?.region,
      addressCountry: 'MG',
    });
  }

  if (typeof f.lat === 'number' && typeof f.lng === 'number') {
    bloc.geo = { '@type': 'GeoCoordinates', latitude: f.lat, longitude: f.lng };
  }

  // priceRange est le seul champ « prix » que schema.org accepte sur un
  // établissement. On y met la fourchette symbolique, jamais un montant :
  // un prix sur l'établissement lui-même serait faux dès la saison suivante.
  if (f.price_level) bloc.priceRange = '€'.repeat(Math.min(4, Math.max(1, f.price_level)));
  else if (f.price_min_ar) bloc.priceRange = `à partir de ${Math.round(f.price_min_ar)} MGA`;

  // ⚠ AggregateRating UNIQUEMENT s'il existe de vrais avis. Google pénalise
  //   une note sans avis, et surtout : ce serait mentir.
  if (f.rating_count && f.rating_count > 0 && f.rating_avg) {
    bloc.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: f.rating_avg,
      reviewCount: f.rating_count,
      bestRating: 5,
      worstRating: 1,
    };
  }

  if (f.amenities?.length) {
    bloc.amenityFeature = f.amenities.map((a) => ({
      '@type': 'LocationFeatureSpecification',
      name: a.label,
      value: true,
    }));
  }

  if (f.cuisines?.length) bloc.servesCuisine = f.cuisines;

  if (f.hours?.length) {
    bloc.openingHoursSpecification = f.hours
      .filter((h) => !h.ferme_journee && h.ouvre && h.ferme)
      .map((h) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: JOURS_SCHEMA[h.jour],
        opens: h.ouvre,
        closes: h.ferme,
      }));
  }

  return bloc;
}

export interface ChambrePourJsonLd {
  name: string;
  description?: string | null;
  max_adults?: number | null;
  base_price_ar: number;
  price_unit: string;
}

/**
 * Les chambres d'un hôtel, en offres rattachées à la fiche.
 * C'est ce qui permet à Google d'afficher « à partir de X » sur un hôtel.
 */
export function construireOffresChambres(slug: string, chambres: ChambrePourJsonLd[]): Bloc | null {
  if (!chambres.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'OfferCatalog',
    '@id': `${SITE}/p/${slug}#chambres`,
    name: 'Chambres',
    itemListElement: chambres.map((c) => ({
      '@type': 'Offer',
      name: c.name,
      price: c.base_price_ar,
      priceCurrency: 'MGA',
      availability: 'https://schema.org/InStock',
      itemOffered: propre({
        '@type': 'HotelRoom',
        name: c.name,
        description: c.description,
        occupancy: c.max_adults
          ? { '@type': 'QuantitativeValue', maxValue: c.max_adults, unitCode: 'C62' }
          : null,
      }),
    })),
  };
}

export interface CircuitPourJsonLd {
  slug: string;
  title: string;
  summary?: string | null;
  duration_days: number;
  photos?: string[] | null;
  days?: { jour: number; titre: string }[] | null;
  prices?: { base_pax: number; price_ar: number }[] | null;
}

/** Un circuit d'agence : `TouristTrip`, avec son itinéraire jour par jour. */
export function construireCircuitJsonLd(pageSlug: string, c: CircuitPourJsonLd): Bloc {
  const url = `${SITE}/p/${pageSlug}#${c.slug}`;
  const bloc: Bloc = propre({
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    '@id': url,
    name: c.title,
    description: c.summary,
    image: (c.photos ?? []).slice(0, 6),
  });

  if (c.days?.length) {
    bloc.itinerary = {
      '@type': 'ItemList',
      numberOfItems: c.days.length,
      itemListElement: c.days.map((j) => ({
        '@type': 'ListItem',
        position: j.jour,
        item: { '@type': 'Place', name: j.titre },
      })),
    };
  }

  if (c.prices?.length) {
    const mini = Math.min(...c.prices.map((p) => p.price_ar));
    bloc.offers = {
      '@type': 'Offer',
      price: mini,
      priceCurrency: 'MGA',
      availability: 'https://schema.org/InStock',
      url,
    };
  }

  return bloc;
}

export interface DestinationPourJsonLd {
  slug: string;
  name: string;
  summary?: string | null;
  region?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** Une destination : `TouristDestination`, le type prévu pour ça. */
export function construireDestinationJsonLd(d: DestinationPourJsonLd): Bloc {
  const bloc: Bloc = propre({
    '@context': 'https://schema.org',
    '@type': 'TouristDestination',
    '@id': `${SITE}/explorer?lieu=${d.slug}`,
    name: d.name,
    description: d.summary,
    address: d.region
      ? { '@type': 'PostalAddress', addressRegion: d.region, addressCountry: 'MG' }
      : { '@type': 'PostalAddress', addressCountry: 'MG' },
  });
  if (typeof d.lat === 'number' && typeof d.lng === 'number') {
    bloc.geo = { '@type': 'GeoCoordinates', latitude: d.lat, longitude: d.lng };
  }
  return bloc;
}

export interface MailleFilAriane {
  nom: string;
  /** La dernière maille — la page courante — n'en porte pas. */
  url?: string;
}

/**
 * Fil d'Ariane. C'est le résultat enrichi le plus sûr : Google remplace l'URL
 * brute sous le titre par le chemin lisible, sur à peu près tous les sites.
 */
export function construireFilAriane(mailles: MailleFilAriane[]): Bloc {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: mailles.map((m, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: m.nom,
      ...(m.url ? { item: m.url.startsWith('http') ? m.url : `${SITE}${m.url}` } : {}),
    })),
  };
}

/** Accueil › {Destination} › {Établissement}. */
export function filArianeFiche(f: FichePourJsonLd): Bloc {
  const mailles: MailleFilAriane[] = [{ nom: 'Accueil', url: '/' }];
  if (f.place?.name) {
    mailles.push({ nom: f.place.name, url: `/recherche?q=${encodeURIComponent(f.place.name)}` });
  }
  mailles.push({ nom: f.name });
  return construireFilAriane(mailles);
}

/** Questions/réponses — résultat enrichi FAQ. */
export function construireFAQ(qr: { question: string; reponse: string }[]): Bloc {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qr.map((x) => ({
      '@type': 'Question',
      name: x.question,
      acceptedAnswer: { '@type': 'Answer', text: x.reponse },
    })),
  };
}

/**
 * Pose (ou remplace) un bloc JSON-LD identifié dans le <head>.
 * L'identifiant est distinct par bloc : on n'écrase jamais le JSON-LD global
 * du site posé par index.html.
 */
export function poserJsonLd(id: string, donnees: Bloc | null): void {
  if (typeof document === 'undefined') return;
  const existant = document.getElementById(id);
  if (!donnees) {
    existant?.remove();
    return;
  }
  const script =
    (existant as HTMLScriptElement | null) ??
    (() => {
      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.id = id;
      document.head.appendChild(s);
      return s;
    })();
  script.textContent = JSON.stringify(donnees);
}

/** Minuscules, accents retirés, tirets — la même règle que les slugs en base. */
export function slug(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
