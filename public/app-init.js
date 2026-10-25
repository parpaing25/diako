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
  // 🔴 EN GET, SANS AUCUN EN-TÊTE (25/10/2026). En POST avec `apikey`,
  //    `Authorization` et `Content-Type: application/json`, la requête n'était
  //    pas « simple » : le navigateur envoyait d'abord un préambule OPTIONS, un
  //    aller-retour de plus AVANT les données du fil, donc avant la photo du
  //    premier récit — l'élément LCP de l'accueil. Mesuré le 25/10/2026 : 54 à
  //    252 ms de préambule (Lighthouse, quatre passes en ligne). PostgREST sert
  //    la même réponse en GET (11 854 o, identiques octet pour octet le
  //    25/10/2026), la clé passant en paramètre comme pour /lieu plus bas.
  try {
    var connecte = false;
    try { connecte = !!localStorage.getItem("sb-eifrwecaszzqrdwjjjbu-auth-token"); } catch (e) {}
    if (!connecte && location.pathname === "/" && typeof fetch === "function") {
      var CLE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZnJ3ZWNhc3p6cXJkd2pqamJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0NTM5OTYsImV4cCI6MjA3MDAyOTk5Nn0.Ks8epc1CiOyj7Y4AYGL9zRHHoZscQJ7_nWbqwMNcVMQ";
      var limite = window.innerWidth >= 1024 ? 12 : 8;
      window.__dkFilLimite = limite;
      window.__dkFil = fetch(
        "https://eifrwecaszzqrdwjjjbu.supabase.co/rest/v1/rpc/feed_filtre?p_mode=tout&p_limite=" + limite + "&apikey=" + CLE
      ).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
      window.__dkFil.then(prechargerPhotoDuFil);
    }
  } catch (e) {
    window.__dkFil = null;
  }

  // ── 1 bis (suite). LA PHOTO DU PREMIER RÉCIT, SANS ATTENDRE REACT ──────
  // 🔴 C'EST ELLE, L'ÉLÉMENT LCP DE L'ACCUEIL AU TÉLÉPHONE (Lighthouse,
  //    25/10/2026 : `article > div.mx-4 > div.relative > img`, 4,2 à 5,4 s pour
  //    une cible de 2,5 s, dont 2,6 à 2,8 s d'ATTENTE avant même sa requête).
  //    Son adresse n'est connue qu'avec les données du fil ; React, lui, n'est
  //    prêt qu'une fois ~230 Ko de JS téléchargés et exécutés — sur un Android
  //    d'entrée de gamme en 3G, bien après. On la précharge donc dès que le fil
  //    répond, avec EXACTEMENT le srcset et le sizes que posera `ImageProgressive`
  //    dans `EntreeFil` : un préchargement qui ne correspond pas à l'image
  //    affichée est téléchargé une seconde fois.
  // ⚠ CE QUI EST RECOPIÉ ICI, ET D'OÙ : le gabarit (`gabarit`,
  //   src/lib/gabaritPhotos.ts : une photo ou trois et plus = pleine colonne,
  //   deux = duo, une vidéo = carrousel, non préchargé), les largeurs RÉELLES
  //   des variantes (`jeuDeTailles`, src/lib/imageThumb.ts, plafond 1600) et
  //   les créneaux (`LARGEUR_PLEINE`, `LARGEUR_DUO`, src/components/EntreeFil.tsx).
  //   Changer l'un de ces trois fichiers, c'est changer ce bloc le même jour.
  // ⚠ RIEN SI L'ON N'EST PAS SÛR DE LA PREMIÈRE PHOTO : pas au-delà de 767 px
  //   (l'ordinateur affiche la grille de PostCard, d'autres créneaux), ni quand
  //   la mémoire du visiteur existe (`reordonner`, src/lib/affinites.ts,
  //   change alors l'ordre du fil).
  function prechargerPhotoDuFil(posts) {
    try {
      if (!posts || !posts.length || !posts[0]) return;
      if (!window.matchMedia || !window.matchMedia("(max-width: 767px)").matches) return;
      var memoire = true;
      try {
        var aff = localStorage.getItem("dk_affinites");
        var vus = localStorage.getItem("dk_vus");
        memoire = !!((aff && aff !== "{}") || (vus && vus !== "{}"));
      } catch (e) { memoire = true; }
      if (memoire) return;
      var media = posts[0].media || [];
      if (!media.length) return;
      for (var i = 0; i < media.length; i++) if (media[i] && media[i].type === "video") return;
      var m = media[0];
      var url = (m && m.url) || "";
      if (url.indexOf("/uploads/") < 0 || !/\.(jpe?g|png|webp)(\?.*)?$/i.test(url)) return;
      var q = (url.match(/(\?.*)$/) || [""])[0];
      var base = url.replace(/\.(jpe?g|png|webp)(\?.*)?$/i, "");
      var w = m.w, h = m.h, deja = {}, jeu = [];
      var variantes = [[".thumb.webp", 480], [".w960.webp", 960], [".w1600.webp", 1600]];
      for (var j = 0; j < variantes.length; j++) {
        var reelle = w && h ? Math.max(1, Math.round(w * Math.min(1, variantes[j][1] / Math.max(w, h)))) : variantes[j][1];
        if (deja[reelle]) continue;
        deja[reelle] = 1;
        jeu.push(base + variantes[j][0] + q + " " + reelle + "w");
      }
      var l = document.createElement("link");
      l.rel = "preload";
      l.as = "image";
      l.setAttribute("fetchpriority", "high");
      l.setAttribute("imagesrcset", jeu.join(", "));
      l.setAttribute(
        "imagesizes",
        media.length === 2
          ? "(min-width:768px) 306px, calc((100vw - 34px) / 2)"
          : "(min-width:768px) 620px, calc(100vw - 32px)"
      );
      document.head.appendChild(l);
    } catch (e) {
      /* un préchargement manqué ne coûte que le gain : jamais d'erreur ici */
    }
  }

  // ── 1 ter. LA PAGE D'ARRIVÉE ET SA PHOTO, DEMANDÉES AVANT REACT ─────────
  // Mesuré le 18/09/2026 (5 passes, réseau réel de Tana, CPU x4) : sur
  // /lieu/andasibe, l'image du haut attendait le JS (2,8 s), puis le morceau de
  // page, puis fiche_destination — elle arrivait à 5,8 s. Ce sont les pages
  // d'arrivée des publications Facebook : on demande la fiche et on précharge
  // la photo dès le HTML. Gain mesuré : LCP 4,5 → 3,3 s sur /lieu.
  // ⚠ GET avec la clé en paramètre : requête CORS « simple », sans préambule.
  // ⚠ Le preload DOIT porter le même srcset/sizes que CouvertureFiche
  //   (src/components/Arrivee.tsx : plafond 960, "(min-width:1280px) 620px,
  //   100vw"), sinon le navigateur télécharge l'image deux fois.
  // ⚠ Jamais pour un visiteur connecté, comme le fil.
  try {
    var mf = location.pathname.match(/^\/(lieu|site)\/([^\/?#]+)\/?$/);
    var co2 = false;
    try { co2 = !!localStorage.getItem("sb-eifrwecaszzqrdwjjjbu-auth-token"); } catch (e) {}
    if (mf && !co2 && typeof fetch === "function") {
      var CLE2 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZnJ3ZWNhc3p6cXJkd2pqamJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0NTM5OTYsImV4cCI6MjA3MDAyOTk5Nn0.Ks8epc1CiOyj7Y4AYGL9zRHHoZscQJ7_nWbqwMNcVMQ";
      var R = "https://eifrwecaszzqrdwjjjbu.supabase.co/rest/v1/";
      var slug2 = decodeURIComponent(mf[2]);
      var s2 = encodeURIComponent(slug2);
      var u2 = mf[1] === "lieu"
        ? R + "rpc/fiche_destination?p_slug=" + s2
        : R + "attractions?select=cover_url&is_published=eq.true&limit=1&slug=eq." + s2;
      window.__dkFicheCle = mf[1] + ":" + slug2;
      window.__dkFiche = fetch(u2 + "&apikey=" + CLE2)
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
      window.__dkFiche.then(function (d) {
        if (Array.isArray(d)) d = d[0];
        if (!d) return;
        var url = d.lieu ? d.lieu.cover_url : d.cover_url;
        if (!url || url.indexOf("/uploads/") < 0) return;
        var q = (url.match(/(\?.*)$/) || [""])[0];
        var b = url.replace(/\.(jpe?g|png|webp)(\?.*)?$/i, "");
        var l = document.createElement("link");
        l.rel = "preload";
        l.as = "image";
        l.setAttribute("fetchpriority", "high");
        l.setAttribute("imagesrcset", b + ".thumb.webp" + q + " 480w, " + b + ".w960.webp" + q + " 960w");
        l.setAttribute("imagesizes", "(min-width:1280px) 620px, 100vw");
        document.head.appendChild(l);
      });
    }
  } catch (e) {
    window.__dkFiche = null;
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
