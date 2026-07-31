import { useEffect } from "react";

const DEFAUT = "Diako — Voyage & tourisme à Madagascar";

/**
 * Titre de l'onglet par page.
 * Sans cela, toutes les routes d'une SPA s'annoncent pareil : onglets
 * indistinguables, historique du navigateur illisible, et aucun changement de
 * page perceptible pour un lecteur d'écran.
 */
export function useDocumentTitle(titre?: string) {
  useEffect(() => {
    document.title = titre ? `${titre} — Diako` : DEFAUT;
    return () => {
      document.title = DEFAUT;
    };
  }, [titre]);
}
