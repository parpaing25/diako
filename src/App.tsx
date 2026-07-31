import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { UserDataProvider } from "@/contexts/UserDataContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { trackView } from "@/lib/pageviews";

// Seul l'accueil est importé en dur : tout le reste est chargé à la demande,
// pour tenir la cible de < 200 Ko sur le bundle initial.
import Index from "./pages/Index";
const Auth = lazy(() => import("./pages/Auth"));
const Bienvenue = lazy(() => import("./pages/Bienvenue"));
const Compte = lazy(() => import("./pages/Compte"));
const Bientot = lazy(() => import("./pages/Bientot"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Anti-egress : on ne refait pas une requête parce qu'un onglet a repris
      // le focus. Le rafraîchissement se fait explicitement là où il compte.
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/** Squelette de chargement — jamais de spinner, jamais d'écran blanc. */
function PageLoader() {
  return (
    <div className="mx-auto max-w-xl space-y-3 px-4 py-6">
      <div className="dk-skeleton h-6 w-1/3" />
      <div className="dk-skeleton h-40 w-full" />
      <div className="dk-skeleton h-4 w-2/3" />
    </div>
  );
}

/** Compte les visites (anonyme, fire-and-forget) et remonte en haut. */
function RouteEffects() {
  const { pathname } = useLocation();
  useEffect(() => {
    trackView(pathname);
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

function Shell() {
  const { pathname } = useLocation();
  // Écrans « nus » : pas de coquille autour de l'authentification.
  const bare = pathname.startsWith("/auth") || pathname.startsWith("/bienvenue");

  return (
    <>
      <RouteEffects />
      {!bare && (
        <ErrorBoundary fallback={<div />}>
          <Header />
        </ErrorBoundary>
      )}

      <main className={bare ? "" : "dk-has-bottomnav md:pb-0"}>
        {/* ⚠ key={pathname} : sans cela, une erreur sur une page fige toute la
            navigation, l'état d'erreur n'étant jamais réinitialisé. */}
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/bienvenue" element={<Bienvenue />} />
              <Route path="/compte" element={<Compte />} />
              <Route path="/explorer" element={<Bientot titre="Explorer" lot="Lot 3" />} />
              <Route path="/recherche" element={<Bientot titre="Recherche" lot="Lot 3" />} />
              <Route path="/publier" element={<Bientot titre="Publier" lot="Lot 4" />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      {!bare && <BottomNav />}
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <UserDataProvider>
            <Shell />
            <Toaster position="top-center" richColors />
          </UserDataProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
