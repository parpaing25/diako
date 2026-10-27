/* Page hors connexion : revenir au site dès que le réseau revient.
   ⚠ Doit être PRÉCACHÉ avec offline.html (vite.config.ts, includeAssets) :
   sans réseau, un script non caché ne se charge pas, et la page perdrait son
   rechargement automatique sans rien dire. Le bouton « Réessayer » reste le
   filet : il ne dépend d'aucun JavaScript. */
window.addEventListener("online", function () {
  window.location.replace("/");
});
