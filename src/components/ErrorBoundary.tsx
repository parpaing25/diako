import { Component, type ErrorInfo, type ReactNode } from "react";

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
    // TODO Lot 0-bis : brancher Sentry ici. Aujourd'hui Fonenako n'a AUCUNE
    // collecte d'erreurs — un bug en production y passe inaperçu.
    console.error("[Diako] erreur non rattrapée :", error, info.componentStack);
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
