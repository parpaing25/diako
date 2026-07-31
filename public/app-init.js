/* ===========================================================================
   DIAKO — amorçage hors React.
   Deux responsabilités, dans cet ordre :
     1. appliquer le CSS de l'app (émis en <link rel=preload> par le plugin
        Vite « dk-preload-css ») => le premier rendu n'attend jamais le CSS ;
     2. enregistrer le service worker de façon RETARDÉE, pour que le précache
        ne concurrence jamais l'affichage.
   Aucun import, aucune dépendance : ce fichier doit rester minuscule.
   =========================================================================== */
(function () {
  "use strict";

  // ── 1. CSS non bloquant ────────────────────────────────────────────────
  // Le build remplace <link rel=stylesheet> par <link id="dk-css" rel=preload>.
  // On le repasse en vraie feuille de style : le téléchargement a déjà démarré
  // (preload), l'application est instantanée et n'a jamais bloqué le rendu.
  function applyCss() {
    var link = document.getElementById("dk-css");
    if (link && link.rel === "preload") {
      link.rel = "stylesheet";
    }
  }
  applyCss();
  // Filet : si le <link> n'est pas encore dans le DOM au moment où ce script
  // s'exécute (ordre de parsing), on retente une fois le document prêt.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyCss, { once: true });
  }

  // ── 2. Service worker, en différé ──────────────────────────────────────
  // Jamais sur localhost (le SW masque les changements pendant le dev).
  var isLocal =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname === "";

  if ("serviceWorker" in navigator && !isLocal) {
    var register = function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {
        /* silencieux : l'absence de SW ne doit jamais casser le site */
      });
    };
    var schedule = function () {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(register, { timeout: 6000 });
      } else {
        setTimeout(register, 3000);
      }
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
  }
})();
