import { useEffect } from "react";

/** Pas encore vu : ni "1" (l'apparition joue) ni "2" (vu, sans animation). */
const PAS_VU = ".dk-reveal:not([data-vu])";

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
/**
 * 🔴 LE PIÈGE DE LA DÉPENDANCE — lire avant d'appeler ce hook.
 *
 *    Passer `liste.length` NE SUFFIT PAS. Filtrer une liste de 24 éléments et
 *    en obtenir 24 autres ne change pas la longueur : l'effet ne se relance
 *    pas. Or React a créé de NOUVEAUX nœuds (les clés ont changé), sans
 *    `data-vu` — et `.dk-reveal` part à `opacity: 0`. La page paraît VIDE,
 *    sans la moindre erreur.
 *
 *    Constaté en production sur /sites : filtrer par région n'affichait plus
 *    rien alors que la requête rendait bien 24 résultats.
 *
 * ⚠ PASSER LE TABLEAU, pas sa taille. Sa référence change à chaque `setState`,
 *   donc l'effet se relance à chaque arrivée de données — ce qui est
 *   exactement la condition voulue.
 */
export function useReveal(dependance?: unknown) {
  useEffect(() => {
    const doux = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const cibles = document.querySelectorAll<HTMLElement>(PAS_VU);
    if (!cibles.length) return;

    // Sans observateur (navigateur ancien) ou si l'utilisateur a demandé moins
    // d'animations : on montre tout, tout de suite. Jamais de contenu caché.
    // "2" et non "1" : vu, SANS apparition — rien ne rejoue si la préférence
    // change en cours de visite.
    if (!doux || typeof IntersectionObserver === "undefined") {
      cibles.forEach((el) => el.setAttribute("data-vu", "2"));
      return;
    }

    const obs = new IntersectionObserver(
      (entrees) => {
        /* 🔴 LE RANG SE COMPTE DANS LE LOT QUI ENTRE ENSEMBLE (25/10/2026),
           plus dans l'ordre du document. Avant, chaque élément recevait
           `i % 5` à l'observation : une carte qui entrait SEULE au défilement
           attendait quand même le délai de son rang, jusqu'à 240 ms. Trois
           cartes qui arrivent ensemble se posent toujours l'une après
           l'autre (0, 60, 120 ms) ; une carte seule part tout de suite.
           ⚠ `--rang` (propriété CSS), plus `style.transitionDelay` : ce délai
             en ligne n'était jamais retiré et retardait le survol de la carte
             pour toute la visite (mesuré : 240 ms au rang 4, rapport B §5.3).
             La variable ne sert qu'à l'animation, et useRevealFilet l'efface
             à sa fin. */
        entrees
          .filter((e) => e.isIntersecting)
          .forEach((e, i) => {
            const el = e.target as HTMLElement;
            el.style.setProperty("--rang", String(Math.min(i, 4)));
            el.setAttribute("data-vu", "1");
            obs.unobserve(el);
          });
      },
      // 12 % de marge basse : l'élément se pose juste avant d'être lu, pas
      // pendant qu'on le regarde déjà.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.01 }
    );

    cibles.forEach((el) => obs.observe(el));
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
  /* ⭐ LA FIN DE L'APPARITION, ÉCOUTÉE UNE FOIS POUR TOUTE L'APPLICATION
     (recette B bis, 25/10/2026). Une animation CSS REPART quand un ancêtre
     repasse de `display: none` à visible (onglet, accordéon, panneau
     `hidden xl:block` au redimensionnement) : l'élément se recachait puis
     réapparaissait. Une fois l'apparition finie — ou annulée parce que
     l'élément a été caché en route — il passe à `data-vu="2"`, qui n'anime
     plus rien. On ne retire PAS la classe `dk-reveal` : React la remettrait
     au rendu suivant, sans `data-vu`, donc cachée. */
  useEffect(() => {
    const fin = (ev: AnimationEvent) => {
      if (ev.animationName !== "dk-apparait") return;
      const el = ev.target;
      if (!(el instanceof HTMLElement) || !el.classList.contains("dk-reveal")) return;
      el.setAttribute("data-vu", "2");
      el.style.removeProperty("--rang");
    };
    document.addEventListener("animationend", fin);
    document.addEventListener("animationcancel", fin);
    return () => {
      document.removeEventListener("animationend", fin);
      document.removeEventListener("animationcancel", fin);
    };
  }, []);

  useEffect(() => {
    const balayer = () => {
      const doux = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      document
        .querySelectorAll<HTMLElement>(PAS_VU)
        .forEach((el) => {
          // Seulement ce qui est deja dans l'ecran ou au-dessus : ce qui est
          // plus bas reste a l'observateur, qui fera son travail au moment ou
          // on y arrive.
          if (el.getBoundingClientRect().top < window.innerHeight * 1.2)
            el.setAttribute("data-vu", doux ? "1" : "2");
        });
    };

    /* 🔴 UN SEUL BALAYAGE À 700 ms NE SUFFISAIT PAS, et le défaut était en
     *    ligne : sur /post/<id>, la carte du récit arrivait APRÈS le filet et
     *    restait à `opacity: 0` pour toujours — texte présent dans le DOM,
     *    écran vide, aucune erreur. Vérifié le 03/09/2026 sur le build
     *    déployé : `getComputedStyle(article).opacity === "0"`.
     *
     *    C'était une COURSE, gagnée sur une fibre et perdue sur une connexion
     *    malgache : plus la donnée met de temps à venir, plus la page reste
     *    blanche. Le filet surveille donc les ajouts au DOM pendant les
     *    premières secondes qui suivent un changement d'adresse.
     *
     * ⚠ Le coût : une observation de mutations, bornée à 6 secondes et
     *   regroupée par image (`requestAnimationFrame`). Sur un fil de 50
     *   cartes, le balayage ne touche que ce qui n'a pas encore `data-vu`.
     */
    const premier = window.setTimeout(balayer, 700);

    let prevu = 0;
    const observateur =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            if (prevu) return;
            prevu = window.requestAnimationFrame(() => {
              prevu = 0;
              balayer();
            });
          });
    observateur?.observe(document.body, { childList: true, subtree: true });

    // Six secondes couvrent une arrivée tardive sans surveiller la page à vie.
    const fin = window.setTimeout(() => observateur?.disconnect(), 6000);

    return () => {
      window.clearTimeout(premier);
      window.clearTimeout(fin);
      if (prevu) window.cancelAnimationFrame(prevu);
      observateur?.disconnect();
    };
  }, [cle]);
}
