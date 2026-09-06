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

  // ── 0. THÈME, EN TOUT PREMIER ──────────────────────────────────────────
  // Tailwind est en darkMode:["class"] : sans cette ligne, la classe `dark`
  // n'est JAMAIS posée et les 40 lignes de palette sombre de index.css sont du
  // code mort. Pire : le squelette statique, lui, se peint bien en sombre via
  // prefers-color-scheme — l'utilisateur voyait donc un écran sombre suivi d'un
  // flash blanc violent à chaque visite. Doit s'exécuter AVANT le premier rendu.
  try {
    // 🔴 LE CHOIX DE L'UTILISATEUR PASSE AVANT LE SYSTEME. Ce bloc
    //    n'appliquait que `prefers-color-scheme` : qui avait choisi « Clair »
    //    dans /parametres voyait le theme du telephone s'imposer a chaque
    //    chargement, et l'ecouteur `change` le lui reprenait DEFINITIVEMENT des
    //    que le telephone basculait en mode nuit. Meme cle que ThemeContext
    //    (« dk_theme », valeurs clair | sombre | systeme).
    var choix = null;
    try { choix = localStorage.getItem("dk_theme"); } catch (e2) { choix = null; }
    var mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    var applique = function (sombre) {
      document.documentElement.classList.toggle("dark", !!sombre);
    };
    applique(choix === "sombre" || (choix !== "clair" && !!(mq && mq.matches)));
    // L'ecouteur ne sert QU'A qui suit le systeme : sinon il contredit un
    // reglage explicite.
    if (mq && mq.addEventListener && choix !== "clair" && choix !== "sombre") {
      mq.addEventListener("change", function (e) { applique(e.matches); });
    }
  } catch (e) {
    /* thème clair par défaut */
  }

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

  // ── 1 bis. LE FIL, DEMANDÉ AVANT REACT ────────────────────────────────
  // Mesuré le 05/09/2026 : la première requête Supabase partait à 1,5 s, une
  // fois le JS téléchargé et exécuté. Ce script tourne dès le début du HTML :
  // il lance LA MÊME requête que src/components/Feed.tsx (feed_filtre, mode
  // « tout », 8 ou 12 selon l'écran) et la laisse dans une promesse que le fil
  // consomme s'il démarre avec ces paramètres-là. Sinon elle est ignorée.
  // ⚠ Jamais pour un visiteur connecté (le fil peut dépendre du compte) : on
  //   regarde si le jeton Supabase est dans localStorage.
  // ⚠ La clé est la clé PUBLIQUE anon, la même que dans le bundle.
  try {
    var connecte = false;
    try { connecte = !!localStorage.getItem("sb-eifrwecaszzqrdwjjjbu-auth-token"); } catch (e) {}
    if (!connecte && location.pathname === "/" && typeof fetch === "function") {
      var CLE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZnJ3ZWNhc3p6cXJkd2pqamJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0NTM5OTYsImV4cCI6MjA3MDAyOTk5Nn0.Ks8epc1CiOyj7Y4AYGL9zRHHoZscQJ7_nWbqwMNcVMQ";
      var limite = window.innerWidth >= 1024 ? 12 : 8;
      window.__dkFilLimite = limite;
      window.__dkFil = fetch("https://eifrwecaszzqrdwjjjbu.supabase.co/rest/v1/rpc/feed_filtre", {
        method: "POST",
        headers: { apikey: CLE, Authorization: "Bearer " + CLE, "Content-Type": "application/json" },
        body: JSON.stringify({ p_mode: "tout", p_limite: limite })
      }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    }
  } catch (e) {
    window.__dkFil = null;
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
