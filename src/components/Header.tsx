import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { LogOut, Search, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserData } from "@/contexts/UserDataContext";
import { getAvatarUrl } from "@/lib/supabaseImage";

export function Header() {
  const { user, signOut } = useAuth();
  const { profile } = useUserData();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    // La recherche réelle (résolution d'entités + barre de réponse) arrive au
    // Lot 3. Ici on se contente de router : la barre n'est PAS un décor —
    // c'était le défaut n°1 du Diako précédent (un useState sans handler).
    navigate(term ? `/recherche?q=${encodeURIComponent(term)}` : "/recherche");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <Link to="/" className="text-xl font-bold tracking-tight text-primary">
          Diako
        </Link>

        <form onSubmit={submit} className="flex-1" role="search">
          <label htmlFor="dk-search" className="sr-only">
            Rechercher un hôtel, un restaurant, un plat, une destination
          </label>
          <div className="flex h-9 items-center gap-2 rounded-full bg-muted px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              id="dk-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Un hôtel, un plat, une destination…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              enterKeyHint="search"
            />
          </div>
        </form>

        {user ? (
          <div className="flex items-center gap-1">
            <Link
              to="/compte"
              aria-label="Mon compte"
              className="dk-tap grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-muted"
            >
              {profile?.avatar_url ? (
                <img
                  src={getAvatarUrl(profile.avatar_url, 36)}
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 object-cover"
                />
              ) : (
                <User className="h-4 w-4 text-muted-foreground" />
              )}
            </Link>
            <button
              onClick={() => void signOut()}
              aria-label="Se déconnecter"
              className="dk-tap hidden h-9 w-9 place-items-center rounded-full text-muted-foreground sm:grid"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Link
            to="/auth"
            className="flex h-9 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Connexion
          </Link>
        )}
      </div>
    </header>
  );
}
