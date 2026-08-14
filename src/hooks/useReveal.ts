import { useEffect } from "react";

/**
 * Le contenu qui se pose en arrivant à l'écran.
 *
 * ⚠ POURQUOI UN OBSERVATEUR ET NON UNE ANIMATION AU MONTAGE. Une animation
 *   posée au montage joue pour TOUTE la liste d'un coup, y compris les vingt
 *   éléments qui sont hors de l'écran : au moment où l'on descend, tout est
 *   déjà fini et le fil paraît figé. L'IntersectionObserver ne déclenche
 *   qu'au moment où l'élément entre réellement dans le champ.
 *
 * ⚠ UNE SEULE INSTANCE POUR TOUTE LA PAGE, pas une par carte. Sur un fil de
 *   cinquante publications, cinquante observateurs coûtent cher sur un Android
 *   d'entrée de gamme — et c'est exactement le matériel visé.
 *
 * Chaque élément est libéré dès qu'il a été vu : l'animation ne rejoue pas
 * quand on remonte, ce qui serait du clignotement, pas de la finition.
 */
export function useReveal(dependance?: unknown) {
  useEffect(() => {
    const doux = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const cibles = document.querySelectorAll<HTMLElement>('.dk-reveal:not([data-vu="1"])');
    if (!cibles.length) return;

    // Sans observateur (navigateur ancien) ou si l'utilisateur a demandé moins
    // d'animations : on montre tout, tout de suite. Jamais de contenu caché.
    if (!doux || typeof IntersectionObserver === "undefined") {
      cibles.forEach((el) => el.setAttribute("data-vu", "1"));
      return;
    }

    const obs = new IntersectionObserver(
      (entrees) => {
        entrees.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          // Le décalage se calcule par rapport aux frères visibles en même
          // temps : trois cartes qui arrivent ensemble se posent l'une après
          // l'autre, pas toutes d'un bloc.
          const rang = Number(el.dataset.rang ?? 0);
          el.style.transitionDelay = `${Math.min(rang, 4) * 60}ms`;
          el.setAttribute("data-vu", "1");
          obs.unobserve(el);
        });
      },
      // 12 % de marge basse : l'élément se pose juste avant d'être lu, pas
      // pendant qu'on le regarde déjà.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.01 }
    );

    cibles.forEach((el, i) => {
      el.dataset.rang = String(i % 5);
      obs.observe(el);
    });
    return () => obs.disconnect();
  }, [dependance]);
}

/**
 * FILET DE SÉCURITÉ, à monter une seule fois au niveau de l'application.
 *
 * ⚠ POURQUOI IL EXISTE. `.dk-reveal` part à `opacity: 0`. Si une page affiche
 *   une carte sans appeler useReveal — ce que j'ai fait sur /post en posant
 *   cette couche — son contenu reste INVISIBLE pour toujours, sans la moindre
 *   erreur pour le signaler. Un défaut d'affichage silencieux est le pire
 *   genre : personne ne le remarque avant un utilisateur.
 *
 * Ce balayage passe après chaque changement d'adresse et révèle tout ce qui
 * traîne encore. Il coûte une requête DOM par navigation.
 */
export function useRevealFilet(cle: unknown) {
  useEffect(() => {
    const t = window.setTimeout(() => {
      document
        .querySelectorAll<HTMLElement>('.dk-reveal:not([data-vu="1"])')
        .forEach((el) => {
          // Seulement ce qui est deja dans l'ecran ou au-dessus : ce qui est
          // plus bas reste a l'observateur, qui fera son travail au moment ou
          // on y arrive.
          if (el.getBoundingClientRect().top < window.innerHeight * 1.2)
            el.setAttribute("data-vu", "1");
        });
    }, 700);
    return () => window.clearTimeout(t);
  }, [cle]);
}
