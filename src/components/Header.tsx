import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Menu, MessageCircle, Moon, Sun, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserData } from "@/contexts/UserDataContext";
import { useTheme } from "@/contexts/ThemeContext";
import { getAvatarUrl } from "@/lib/supabaseImage";
import { SearchBar } from "@/components/SearchBar";
import { MenuMobile } from "@/components/MenuMobile";
import { compterNonLues } from "@/lib/api";
import {
  compterMessagesNonLus,
  PanneauMessages,
  PanneauNotifications,
} from "@/components/PanneauxEntete";

export function Header() {
  const { user } = useAuth();
  const { profile } = useUserData();
  const { effectif, setTheme } = useTheme();
  const [menu, setMenu] = useState(false);
  const [nonLues, setNonLues] = useState(0);
  const [msgNonLus, setMsgNonLus] = useState(0);
  // Un seul panneau ouvert a la fois : deux volets superposes se recouvrent.
  const [panneau, setPanneau] = useState<"messages" | "notifs" | null>(null);
  const fermerMenu = useCallback(() => setMenu(false), []);

  // Rafraichissement au FOCUS, jamais en temps reel : un canal ouvert en
  // permanence coute ~500 Ko/h de battements de coeur, pour un compteur.
  const rafraichir = useCallback(() => {
    if (!user) { setNonLues(0); return; }
    void compterNonLues().then(setNonLues).catch(() => {});
    void compterMessagesNonLus().then(setMsgNonLus).catch(() => {});
  }, [user]);

  useEffect(() => {
    rafraichir();
    const raz = () => setNonLues(0);
    window.addEventListener("focus", rafraichir);
    window.addEventListener("dk:notifs-lues", raz);
    return () => {
      window.removeEventListener("focus", rafraichir);
      window.removeEventListener("dk:notifs-lues", raz);
    };
  }, [rafraichir]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        {/* La frise tissée — un rappel du lamba, en dégradés CSS : elle situe
            le site en deux pixels, sans une image à télécharger. */}
        <div className="dk-tissage" aria-hidden="true" />
        <div className="flex h-14 w-full items-center gap-2 px-3 md:gap-3 md:px-4 xl:px-6 2xl:px-10">
          <button
            onClick={() => setMenu(true)}
            aria-label="Ouvrir le menu"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>

          {/* « Diako » en romain, « MADAGASIKARA » en petites capitales
              espacées : le nom dit le pays sans une ligne de plus. */}
          <Link to="/" className="shrink-0 leading-none">
            <span className="dk-edito block text-[1.35rem] font-semibold tracking-tight text-primary">
              Diako
            </span>
            <span className="dk-etiquette hidden text-[0.55rem] leading-none sm:block">
              Madagasikara
            </span>
          </Link>

          <div className="min-w-0 flex-1">
            <SearchBar taille="header" />
          </div>

          <button
            onClick={() => setTheme(effectif === "sombre" ? "clair" : "sombre")}
            aria-label={`Passer en mode ${effectif === "sombre" ? "clair" : "sombre"}`}
            className="hidden h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted sm:grid"
          >
            {effectif === "sombre" ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          {user ? (
            <div className="flex shrink-0 items-center gap-1">
              {/* On OUVRE un apercu, on ne change pas de page : verifier qu'il
                  n'y a rien coutait jusqu'ici deux chargements sur une 3G. */}
              <div className="relative">
                <button
                  onClick={() => setPanneau((p) => (p === "messages" ? null : "messages"))}
                  aria-label={msgNonLus > 0 ? `Messages (${msgNonLus} non lus)` : "Messages"}
                  aria-expanded={panneau === "messages"}
                  className="relative grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted"
                >
                  <MessageCircle className="h-5 w-5" aria-hidden="true" />
                  {msgNonLus > 0 && (
                    <span className="dk-badge-pulse absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                      {msgNonLus > 9 ? "9+" : msgNonLus}
                    </span>
                  )}
                </button>
                <PanneauMessages
                  ouvert={panneau === "messages"}
                  onFermer={() => setPanneau(null)}
                />
              </div>

              <div className="relative">
                <button
                  onClick={() => setPanneau((p) => (p === "notifs" ? null : "notifs"))}
                  aria-label={nonLues > 0 ? `Notifications (${nonLues} non lues)` : "Notifications"}
                  aria-expanded={panneau === "notifs"}
                  className="relative grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted"
                >
                  <Bell className="h-5 w-5" aria-hidden="true" />
                  {nonLues > 0 && (
                    <span className="dk-badge-pulse absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                      {nonLues > 9 ? "9+" : nonLues}
                    </span>
                  )}
                </button>
                <PanneauNotifications
                  ouvert={panneau === "notifs"}
                  onFermer={() => setPanneau(null)}
                  onLues={() => setNonLues(0)}
                />
              </div>
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
            </div>
          ) : (
            <Link
              to="/auth"
              className="flex h-9 shrink-0 items-center rounded-full bg-primary px-3.5 text-sm font-medium text-primary-foreground md:px-4"
            >
              Connexion
            </Link>
          )}
        </div>
      </header>

      <MenuMobile ouvert={menu} fermer={fermerMenu} />
    </>
  );
}
