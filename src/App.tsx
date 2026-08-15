import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { UserDataProvider } from "@/contexts/UserDataContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { SideNav } from "@/components/SideNav";
import { RightRail } from "@/components/RightRail";
import { Footer } from "@/components/Footer";
import { AgentDiako } from "@/components/AgentDiako";
import { InstallPrompt } from "@/components/InstallPrompt";
import { installerJournalErreurs } from "@/lib/journalErreurs";
import { trackView } from "@/lib/pageviews";

import Index from "./pages/Index";
import { useRevealFilet } from "@/hooks/useReveal";
const Auth = lazy(() => import("./pages/Auth"));
const Bienvenue = lazy(() => import("./pages/Bienvenue"));
const Compte = lazy(() => import("./pages/Compte"));
const Explorer = lazy(() => import("./pages/Explorer"));
const Recherche = lazy(() => import("./pages/Recherche"));
const Publier = lazy(() => import("./pages/Publier"));
const PagePro = lazy(() => import("./pages/PagePro"));
const EspacePro = lazy(() => import("./pages/EspacePro"));
const ProConsole = lazy(() => import("./pages/ProConsole"));
const Parametres = lazy(() => import("./pages/Parametres"));
const Favoris = lazy(() => import("./pages/Favoris"));
const Carte = lazy(() => import("./pages/Carte"));
const Destination = lazy(() => import("./pages/Destination"));
const Plat = lazy(() => import("./pages/Plat"));
const Messages = lazy(() => import("./pages/Messages"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Profil = lazy(() => import("./pages/Profil"));
const Post = lazy(() => import("./pages/Post"));
const Mentions = lazy(() => import("./pages/Mentions"));
const Confidentialite = lazy(() => import("./pages/Confidentialite"));
const Cgu = lazy(() => import("./pages/Cgu"));
/* ═══ LES ECRANS DU DESIGN FINAL ════════════════════════════════════════
   ⚠ TOUS EN `lazy()`. Ce sont neuf routes de plus : chargees d'emblee, elles
     alourdiraient le paquet initial que tout le monde telecharge, y compris
     ceux qui ne viennent que lire le fil sur une 3G.
   ⚠ CHACUNE EST BRANCHEE SUR UNE VRAIE TABLE (migrations 0032/0033). La regle
     du projet interdit une entree de navigation vers un ecran mort : ce qu'on
     y ecrit se garde, meme si les listes sont vides aujourd'hui. */
const Plats = lazy(() => import("./pages/Plats"));
const Gouts = lazy(() => import("./pages/Gouts"));
const Circuits = lazy(() => import("./pages/Circuits"));
const Circuit = lazy(() => import("./pages/Circuit"));
const Sites = lazy(() => import("./pages/Sites"));
const Site = lazy(() => import("./pages/Site"));
const Evenements = lazy(() => import("./pages/Evenements"));
const Projet = lazy(() => import("./pages/Projet"));
const Guides = lazy(() => import("./pages/Guides"));
const QuandPartir = lazy(() => import("./pages/QuandPartir"));
const YAller = lazy(() => import("./pages/YAller"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false, retry: 1 },
  },
});

function PageLoader() {
  return (
    <div className="space-y-3 px-4 py-6">
      <div className="dk-skeleton h-8 w-1/3" />
      <div className="dk-skeleton h-48 w-full" />
      <div className="dk-skeleton h-4 w-2/3" />
    </div>
  );
}

/** Audience anonyme, retour en haut, focus rendu au contenu à chaque page. */
function RouteEffects() {
  const { pathname } = useLocation();
  const [annonce, setAnnonce] = useState("");

  useEffect(() => {
    trackView(pathname);
    window.scrollTo({ top: 0 });
    document.getElementById("contenu")?.focus({ preventScroll: true });
    setAnnonce(document.title);
  }, [pathname]);

  return (
    <p aria-live="polite" aria-atomic="true" className="sr-only">
      {annonce}
    </p>
  );
}

function Shell() {
  const { pathname } = useLocation();
  useRevealFilet(pathname);
  // ⚠ La cle force React a remonter le conteneur a chaque changement d'adresse.
  //   Sans elle, l'animation d'entree ne joue qu'une fois, au premier
  //   chargement — c'est exactement pourquoi le site paraissait fige.
  const bare = pathname.startsWith("/auth") || pathname.startsWith("/bienvenue");

  const routes = (
    <div key={pathname} className="dk-page">
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/bienvenue" element={<Bienvenue />} />
      <Route path="/compte" element={<Compte />} />
      <Route path="/explorer" element={<Explorer />} />
      <Route path="/recherche" element={<Recherche />} />
      <Route path="/publier" element={<Publier />} />
      <Route path="/p/:slug" element={<PagePro />} />
      <Route path="/pro" element={<EspacePro />} />
      {/* Console de gestion : la garde de propriete est dans la page. */}
      <Route path="/pro/:slug" element={<ProConsole />} />
      <Route path="/parametres" element={<Parametres />} />
      <Route path="/favoris" element={<Favoris />} />
      <Route path="/carte" element={<Carte />} />
      {/* Les deux fiches du referentiel : c'est lui le fosse defensif du
          produit, il ne pouvait pas rester invisible. */}
      <Route path="/lieu/:slug" element={<Destination />} />
      <Route path="/plat/:slug" element={<Plat />} />

      {/* ── L'aventure culinaire — le differenciant du produit, et la seule
             brique sociale qui fonctionne avec un seul membre inscrit. ── */}
      <Route path="/plats" element={<Plats />} />
      <Route path="/gouts" element={<Gouts />} />

      {/* ── Voyager : circuits, sites et parcs, evenements ── */}
      <Route path="/circuits" element={<Circuits />} />
      <Route path="/circuit/:slug" element={<Circuit />} />
      <Route path="/sites" element={<Sites />} />
      <Route path="/site/:slug" element={<Site />} />
      <Route path="/evenements" element={<Evenements />} />

      {/* ── L'inverse de l'annonce : l'offre vient au voyageur. ── */}
      <Route path="/projet" element={<Projet />} />

      {/* ── Les guides : le trafic de recherche avant que l'annuaire soit
             fourni. Une seule page, deux vues, selon le slug. ── */}
      {/* ⚠ La page qui exploite le fosse defensif : 5 destinations x 12 mois
             avec leur RAISON. Personne d'autre ne publie le pourquoi. */}
      <Route path="/quand-partir" element={<QuandPartir />} />
      <Route path="/y-aller" element={<YAller />} />
      <Route path="/guides" element={<Guides />} />
      <Route path="/guides/:slug" element={<Guides />} />
      <Route path="/messages" element={<Messages />} />
      <Route path="/notifications" element={<Notifications />} />
      <Route path="/user/:id" element={<Profil />} />
      {/* Adresse propre d'une publication : partage et notifications en dependent. */}
      <Route path="/post/:id" element={<Post />} />
      <Route path="/mentions" element={<Mentions />} />
      <Route path="/confidentialite" element={<Confidentialite />} />
      <Route path="/cgu" element={<Cgu />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </div>
  );

  if (bare) {
    return (
      <>
        <RouteEffects />
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<PageLoader />}>{routes}</Suspense>
        </ErrorBoundary>
      </>
    );
  }

  return (
    <>
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Aller au contenu
      </a>

      <RouteEffects />

      <ErrorBoundary fallback={<div />}>
        <Header />
      </ErrorBoundary>

      {/* ══ LA COQUE — gabarit v4, une seule fois, les 23 routes en heritent ══
          Largeurs qui en decoulent, verifiees au pixel :
            1024 : coque 1000 = contenu 664 + 16 + rail droit 320
            1280 : coque 1248 = 256 + 16 + contenu 640 + 16 + 320
            1440 : coque 1408 = 256 + 16 + contenu 800 + 16 + 320
            1920 : coque 1850 = 256 + 16 + contenu 1242 + 16 + 320

          ⚠ CE QUI A CHANGE ET POURQUOI. La coque etait plafonnee a 1560 px avec
            une colonne de fil figee a 620 : sur un ecran de 1920, cela faisait
            628 px de vide, 33 % de la largeur. Le plafond passe a 1850 comme sur
            Fonenako — mais elargir SEUL aurait aggrave le probleme, en elargissant
            le vide autour d'une colonne qui, elle, ne bougeait pas. Les deux vont
            ensemble : la coque ici, la grille dans le fil. */}
      <div className="mx-auto flex w-full max-w-[1850px] flex-1 gap-4 px-0 lg:px-3 xl:px-4">
        <SideNav />
        <main
          id="contenu"
          tabIndex={-1}
          className="dk-has-bottomnav min-w-0 flex-1 outline-none xl:pb-0"
        >
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<PageLoader />}>{routes}</Suspense>
          </ErrorBoundary>
        </main>
        <RightRail />
      </div>

      <Footer />
      <BottomNav />
      {/* L'agent est disponible partout : c'est la porte d'entree du produit,
          pas une page a trouver. */}
      <ErrorBoundary fallback={<div />}>
        <AgentDiako />
      </ErrorBoundary>
      <ErrorBoundary fallback={<div />}>
        <InstallPrompt />
      </ErrorBoundary>
    </>
  );
}

// Une erreur qui n'arrive que sur un Android de 2019 a Toliara n'apparait
// jamais dans une console de developpeur. On l'enregistre, sans donnee
// personnelle et sans jamais casser le site si l'envoi echoue.
installerJournalErreurs();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <UserDataProvider>
              <Shell />
              <Toaster position="top-center" richColors />
            </UserDataProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
