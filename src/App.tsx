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
import { trackView } from "@/lib/pageviews";

import Index from "./pages/Index";
const Auth = lazy(() => import("./pages/Auth"));
const Bienvenue = lazy(() => import("./pages/Bienvenue"));
const Compte = lazy(() => import("./pages/Compte"));
const Explorer = lazy(() => import("./pages/Explorer"));
const Recherche = lazy(() => import("./pages/Recherche"));
const Publier = lazy(() => import("./pages/Publier"));
const PagePro = lazy(() => import("./pages/PagePro"));
const EspacePro = lazy(() => import("./pages/EspacePro"));
const Parametres = lazy(() => import("./pages/Parametres"));
const Favoris = lazy(() => import("./pages/Favoris"));
const Messages = lazy(() => import("./pages/Messages"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Profil = lazy(() => import("./pages/Profil"));
const Mentions = lazy(() => import("./pages/Mentions"));
const Confidentialite = lazy(() => import("./pages/Confidentialite"));
const Cgu = lazy(() => import("./pages/Cgu"));
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
  const bare = pathname.startsWith("/auth") || pathname.startsWith("/bienvenue");

  const routes = (
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
      <Route path="/parametres" element={<Parametres />} />
      <Route path="/favoris" element={<Favoris />} />
      <Route path="/messages" element={<Messages />} />
      <Route path="/notifications" element={<Notifications />} />
      <Route path="/user/:id" element={<Profil />} />
      <Route path="/mentions" element={<Mentions />} />
      <Route path="/confidentialite" element={<Confidentialite />} />
      <Route path="/cgu" element={<Cgu />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
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

      <div className="flex w-full flex-1 gap-6 px-0 xl:gap-8 xl:px-6 2xl:px-10">
        <SideNav />
        <main
          id="contenu"
          tabIndex={-1}
          className="dk-has-bottomnav min-w-0 flex-1 outline-none lg:pb-0"
        >
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<PageLoader />}>{routes}</Suspense>
          </ErrorBoundary>
        </main>
        <RightRail />
      </div>

      <Footer />
      <BottomNav />
    </>
  );
}

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
