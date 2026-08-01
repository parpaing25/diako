import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Search, UtensilsCrossed } from "lucide-react";
import { suggerer, type Suggestion } from "@/lib/etablissements";
import { cn } from "@/lib/utils";

/**
 * Barre de recherche unique, utilisée dans l'en-tête ET en grand sur l'accueil.
 *
 * Elle navigue réellement — c'est le point qui avait tué la version précédente
 * de Diako, où la barre était un useState sans le moindre gestionnaire.
 *
 * ⭐ L'AUTOCOMPLÉTION interroge le référentiel dès la deuxième lettre et
 *    propose destinations ET plats dans la même liste. C'est elle qui fait que
 *    « majunga » mène à Mahajanga et « ravi-toto » au ravitoto : l'utilisateur
 *    n'a pas à connaître l'orthographe officielle, et c'est précisément à ça
 *    que servent les alias en base.
 *
 * Anti-rafale de 220 ms : sans lui, taper « ravitoto » lancerait huit requêtes
 * pour n'en garder qu'une — sur un forfait malgache, c'est du data jeté.
 */
export function SearchBar({
  taille = "header",
  className,
  autoFocus,
}: {
  taille?: "header" | "hero";
  className?: string;
  autoFocus?: boolean;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);
  const hero = taille === "hero";

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setSuggestions([]);
      return;
    }
    const minuteur = setTimeout(() => {
      void suggerer(t, 6)
        .then((s) => {
          setSuggestions(s);
          setOuvert(s.length > 0);
        })
        .catch(() => setSuggestions([]));
    }, 220);
    return () => clearTimeout(minuteur);
  }, [q]);

  // Fermer au clic extérieur : sans cela, la liste reste posée par-dessus le
  // contenu et intercepte les clics.
  useEffect(() => {
    if (!ouvert) return;
    const auClic = (e: MouseEvent) => {
      if (!conteneur.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", auClic);
    return () => document.removeEventListener("mousedown", auClic);
  }, [ouvert]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setOuvert(false);
    const t = q.trim();
    navigate(t ? `/recherche?q=${encodeURIComponent(t)}` : "/recherche");
  }

  function choisir(s: Suggestion) {
    setQ(s.libelle);
    setOuvert(false);
    navigate(`/recherche?q=${encodeURIComponent(s.libelle)}`);
  }

  return (
    <div ref={conteneur} className={cn("relative w-full", className)}>
      <form onSubmit={submit} role="search" className="w-full">
        <label htmlFor={`dk-search-${taille}`} className="sr-only">
          Rechercher un hôtel, un restaurant, un plat ou une destination
        </label>
        <div
          className={cn(
            "flex items-center gap-2 rounded-full bg-muted px-3 transition",
            "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background",
            hero ? "h-12 border border-border bg-background px-4 md:h-14" : "h-9"
          )}
        >
          <Search
            className={cn("shrink-0 text-muted-foreground", hero ? "h-5 w-5" : "h-4 w-4")}
            aria-hidden="true"
          />
          <input
            id={`dk-search-${taille}`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOuvert(true)}
            autoFocus={autoFocus}
            autoComplete="off"
            role="combobox"
            aria-expanded={ouvert}
            aria-controls={`dk-suggestions-${taille}`}
            placeholder={hero ? "Un hôtel, un plat, une destination…" : "Un hôtel, un plat…"}
            enterKeyHint="search"
            className={cn(
              "w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground",
              hero ? "text-base" : "text-sm"
            )}
          />
          {hero && (
            <button
              type="submit"
              className="shrink-0 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
            >
              Chercher
            </button>
          )}
        </div>
      </form>

      {ouvert && suggestions.length > 0 && (
        <ul
          id={`dk-suggestions-${taille}`}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-2xl border border-border bg-popover shadow-lg"
        >
          {suggestions.map((s) => (
            <li key={`${s.type}-${s.slug}`} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choisir(s)}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-muted"
              >
                {s.type === "lieu" ? (
                  <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <UtensilsCrossed className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.libelle}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {s.type === "lieu" ? (s.detail ?? "destination") : "plat"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
