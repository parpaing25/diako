import { useEffect, useState } from "react";

const SEUIL = 768;

/**
 * Vrai en dessous de 768 px.
 *
 * On lit la largeur AVANT le premier rendu (et non dans un effet) : sinon le
 * fil desktop s'affiche une fraction de seconde sur téléphone avant de basculer
 * en plein écran, et l'écran clignote à chaque visite.
 */
export function useEstMobile(): boolean {
  const [mobile, setMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${SEUIL - 1}px)`).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${SEUIL - 1}px)`);
    const h = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener?.("change", h);
    return () => mq.removeEventListener?.("change", h);
  }, []);

  return mobile;
}
