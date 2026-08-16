import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Menu, MessageCircle, Moon, Sun, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserData } from "@/contexts/UserDataContext";
import { useTheme } from "@/contexts/ThemeContext";
import { getAvatarUrl } from "@/lib/supabaseImage";
import { MenuCompte } from "@/components/MenuCompte";
import { SearchBar } from "@/components/SearchBar";
import { MenuMobile } from "@/components/MenuMobile";
import { RetourEntete } from "@/components/RetourEntete";
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
  const [panneau, setPanneau] = useState<"messages" | "notifs" | "compte" | null>(null);
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
        {/* ⚠ MÊME COQUE QUE LE CONTENU : 1850 px centrés, mêmes marges. Sans
            `max-w`, l'entête s'étalait sur toute la largeur pendant que le
            contenu s'arrêtait à 1850 — le logo se décalait de la barre de
            navigation, et l'écart grandissait avec l'écran. */}
        <div className="mx-auto flex h-14 w-full max-w-[1850px] items-center gap-2 px-3 md:gap-3 xl:px-4">
          <button
            onClick={() => setMenu(true)}
            aria-label="Ouvrir le menu"
            /* ⚠ DISPARAÎT AU MÊME SEUIL QUE L'ARRIVÉE DU RAIL GAUCHE. À
               `lg:hidden` il s'effaçait dès 1024 alors que la barre latérale
               n'apparaît qu'à 1280 : entre les deux, plus aucun accès au menu
               complet. */
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted xl:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>

          {/* ⚠ AVANT LE LOGO, comme partout ailleurs : le retour se cherche en
              haut à gauche. Il ne s'affiche que s'il y a réellement une page
              derrière — voir RetourEntete. */}
          <RetourEntete />

          {/* ⚠ Le vrai logo, et non plus le nom en typographie. Servi en WebP
              de 5,6 Ko : le fichier d'origine fait 1920 px pour 494 Ko, soit
              onze secondes de 3G pour une image de 36 px de haut.
              `dark:invert` : le tracé est une encre unie, il se retourne
              proprement en blanc sur fond de nuit. */}
          <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="Diako, accueil">
            <picture>
              <source srcSet="/media/diako-marque-96.webp" type="image/webp" />
              <img
                src="/media/diako-marque-96.png"
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 transition-transform duration-300 hover:rotate-[-6deg] hover:scale-110 dark:invert"
              />
            </picture>
            <span className="hidden leading-none sm:block">
              <span className="dk-edito block text-[1.3rem] font-semibold tracking-tight text-primary">
                Diako
              </span>
              <span className="dk-etiquette block text-[0.55rem] leading-none">
                Madagasikara
              </span>
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
                    <span className="dk-badge-pulse absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent-strong px-1 text-[10px] font-bold text-accent-foreground">
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
                    <span className="dk-badge-pulse absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent-strong px-1 text-[10px] font-bold text-accent-foreground">
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
              {/* ⚠ L'AVATAR OUVRE UN MENU, il ne navigue plus. Un clic direct
                  vers /compte obligeait a charger tout l'espace compte pour se
                  deconnecter ou changer un reglage — deux ecrans sur une 3G
                  pour un geste d'un seul. */}
              <div className="relative">
                <button
                  onClick={() => setPanneau((p) => (p === "compte" ? null : "compte"))}
                  aria-label="Mon compte"
                  aria-expanded={panneau === "compte"}
                  aria-haspopup="menu"
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
                </button>
                <MenuCompte ouvert={panneau === "compte"} onFermer={() => setPanneau(null)} />
              </div>
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
