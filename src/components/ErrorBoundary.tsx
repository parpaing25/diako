import { Component, type ErrorInfo, type ReactNode } from "react";
import { journaliser } from "@/lib/journalErreurs";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State {
  hasError: boolean;
}

/**
 * Filet anti-écran blanc.
 * ⚠ À monter avec key={pathname} autour des routes : sans cela, une erreur
 * sur une page fige TOUTE la navigation (l'état d'erreur ne se réinitialise
 * jamais). Piège vécu sur Fonenako.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Diako] erreur non rattrapée :", error, info.componentStack);

    // 🔴 DEFAUT CORRIGE. Cette methode ne faisait qu'un `console.error` et
    //    portait un TODO. Or `installerJournalErreurs` n'ecoute que
    //    `window.error` et `unhandledrejection` — et React 18 en production ne
    //    repropage PAS les erreurs de rendu vers `window.onerror`.
    //    La classe d'erreur la plus visible pour un visiteur — l'ecran qui
    //    disparait — etait donc la SEULE a n'arriver jamais au journal, alors
    //    que la table et ses droits existent depuis la migration 0017.
    //    Pire : les montages `fallback={<div />}` font disparaitre le composant
    //    en silence, sans aucune trace nulle part.
    void journaliser({
      message: error.message || "Erreur de rendu",
      pile: info.componentStack ?? undefined,
      source: "react",
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;

    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Quelque chose s'est mal passé</h1>
        <p className="mt-2 text-muted-foreground">
          La page n'a pas pu s'afficher. Votre connexion est peut-être instable.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 min-h-11 rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          Recharger
        </button>
      </div>
    );
  }
}
