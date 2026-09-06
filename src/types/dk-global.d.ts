export {};

declare global {
  interface Window {
    /** Posée par public/app-init.js : le fil (feed_filtre) demandé avant React.
     *  `null` une fois consommée ou si l'amorçage n'a pas eu lieu. */
    __dkFil?: Promise<unknown> | null;
    /** Le palier demandé par l'amorçage (8 ou 12) — le fil ne consomme la
     *  promesse que si c'est aussi le sien. */
    __dkFilLimite?: number;
  }
}
