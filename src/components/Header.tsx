import { Link } from "react-router-dom";
import { LogOut, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserData } from "@/contexts/UserDataContext";
import { getAvatarUrl } from "@/lib/supabaseImage";
import { SearchBar } from "@/components/SearchBar";

export function Header() {
  const { user, signOut } = useAuth();
  const { profile } = useUserData();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      {/* Même largeur que la coquille : sans cela le logo et le bouton flottent
          224 px à côté du contenu, et la page paraît décousue sur grand écran. */}
      <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-3 px-4">
        <Link
          to="/"
          className="shrink-0 rounded text-xl font-bold tracking-tight text-primary"
        >
          Diako
        </Link>

        <div className="min-w-0 flex-1">
          <SearchBar taille="header" />
        </div>

        {user ? (
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/compte"
              aria-label="Mon compte"
              className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-muted"
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
                <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              )}
            </Link>
            <button
              onClick={() => void signOut()}
              aria-label="Se déconnecter"
              className="hidden h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted sm:grid"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
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
