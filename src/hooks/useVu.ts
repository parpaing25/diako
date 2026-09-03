import { useEffect, type RefObject } from "react";
import { noterVu } from "@/lib/affinites";

/**
 * Marque une publication comme VUE quand elle est restée à l'écran une
 * seconde. Un défilement rapide qui la traverse ne compte pas : on ne veut
 * reculer que ce qui a réellement été regardé.
 */
export function useVu(ref: RefObject<HTMLElement>, id: string, actif = true): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !actif || typeof IntersectionObserver === "undefined") return;
    let minuteur: number | null = null;
    const obs = new IntersectionObserver(
      (entrees) => {
        const visible = entrees[0]?.isIntersecting;
        if (visible && minuteur === null) {
          minuteur = window.setTimeout(() => {
            noterVu(id);
            obs.disconnect();
          }, 1000);
        } else if (!visible && minuteur !== null) {
          window.clearTimeout(minuteur);
          minuteur = null;
        }
      },
      { threshold: 0.6 }
    );
    obs.observe(el);
    return () => {
      if (minuteur !== null) window.clearTimeout(minuteur);
      obs.disconnect();
    };
  }, [ref, id, actif]);
}
