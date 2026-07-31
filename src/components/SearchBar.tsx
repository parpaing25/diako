import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Barre de recherche unique, utilisée dans l'en-tête ET en grand sur l'accueil.
 *
 * Elle NAVIGUE réellement — c'est le point qui a tué la version précédente de
 * Diako, où la barre était un useState sans le moindre handler. Le moteur
 * n'existe pas encore, mais la requête est transmise et l'écran d'arrivée la
 * reprend au lieu de la jeter.
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
  const hero = taille === "hero";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = q.trim();
    navigate(t ? `/recherche?q=${encodeURIComponent(t)}` : "/recherche");
  }

  return (
    <form onSubmit={submit} role="search" className={cn("w-full", className)}>
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
          autoFocus={autoFocus}
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
  );
}
