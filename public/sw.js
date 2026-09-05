/* ===========================================================================
   DIAKO — service worker.
   Écrit à la main, SANS Workbox : aucune dépendance à installer, ~3 Ko.
   vite-plugin-pwa (strategies: injectManifest) remplace self.__WB_MANIFEST
   par la liste des fichiers de la COQUILLE (cf. vite.config.ts).

   ⚠ skipWaiting + clientsClaim sont OBLIGATOIRES : sans eux, l'ancien SW
   continue de servir un cache qui pointe vers des fichiers JS supprimés
   => PAGE BLANCHE pour tous les visiteurs après chaque déploiement.
   =========================================================================== */
/* eslint-disable no-restricted-globals */

const MANIFEST = (self.__WB_MANIFEST || []).map((e) =>
  typeof e === "string" ? e : e.url
);

/* 🔴 LA VERSION ÉTAIT UNE CONSTANTE — « dk-v1 » — ET C'EST CE QUI BLANCHISSAIT
      L'ÉCRAN SUR TÉLÉPHONE.

   L'enchaînement, mesuré : le déploiement SUPPRIME les anciens fichiers
   (« 71 anciens assets supprimés » à chaque envoi). Le cache de coquille, lui,
   gardait l'`index.html` d'un déploiement précédent, puisque `activate`
   n'effaçait que les caches dont le nom ne commençait pas par une chaîne qui ne
   changeait JAMAIS. Or la navigation est en réseau-d'abord AVEC REPLI SUR CE
   CACHE : au premier `fetch` qui échoue — et en 3G malgache il échoue souvent —
   le visiteur recevait un `index.html` périmé, qui réclame des fichiers JS que
   le serveur ne sert plus. Page blanche. Rien ne se charge, et rien ne
   l'explique : le HTML est bien arrivé, ce sont ses dépendances qui sont mortes.
   Sur ordinateur le défaut ne se voit pas — le réseau y échoue rarement.

   ⚠ LA VERSION SE DÉDUIT DONC DU BUILD. Les URL du manifeste portent le
     condensé de Vite : elles changent à chaque déploiement, et cette empreinte
     avec elles. `activate` efface alors réellement les coquilles périmées, et
     une coquille servie hors ligne appelle TOUJOURS les fichiers de son propre
     build. */
const EMPREINTE = (function () {
  var h = 5381;
  var s = MANIFEST.join("|");
  for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
})();

const VERSION = "dk-" + EMPREINTE;
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-rt`;

/* ⚠ LES IMAGES NE SONT PAS VERSIONNÉES, ET C'EST VOULU. Leur nom de fichier est
   déjà unique et elles ne changent jamais ; les jeter à chaque déploiement
   ferait retélécharger jusqu'à 400 photos à des gens qui paient leur mégaoctet.
   C'est le principal gain de données du service worker, on n'y touche pas. */
const IMAGES = "dk-img";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL).then((cache) =>
      // addAll échoue en bloc si UNE seule URL rate : on tolère les manquants.
      Promise.allSettled(MANIFEST.map((url) => cache.add(url)))
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // ⚠ On garde la coquille et le cache d'exécution DE CE BUILD, plus
            //   les images (non versionnées). Tout le reste est une coquille
            //   périmée qui pointe vers des fichiers supprimés du serveur.
            .filter((k) => k !== SHELL && k !== RUNTIME && k !== IMAGES)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Garde un cache borné (les vieux Android ont peu de place). */
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > max) {
    await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Jamais de cache pour l'API Supabase : les données doivent être fraîches,
  // et un cache d'API sous RLS est une fuite de données en puissance.
  if (url.hostname.endsWith(".supabase.co")) return;

  /* 🔴 ON NE TOUCHE PLUS À CE QUI VIENT D'UNE AUTRE ORIGINE — ET C'EST LA CAUSE
        DE « LA CARTE NE SORT PAS ».

        Les tuiles OpenStreetMap sont des `<img>` vers a/b/c.tile.openstreetmap.org.
        Le CSP du site les autorise dans `img-src`. Mais dès que ce service
        worker les interceptait, il n'affichait plus une image : il appelait
        `fetch()`. Or un `fetch()` n'est pas un chargement d'image, c'est une
        CONNEXION — et les connexions sont régies par `connect-src`, où les
        tuiles ne figurent pas. Le navigateur refusait, la promesse était
        rejetée, et le code retombait sur `catch(() => hit)` avec `hit`
        indéfini : `respondWith(undefined)` transforme ça en `ERR_FAILED`.

        Résultat : 28 tuiles demandées, 0 chargée, un rectangle gris #DDD à la
        place de Madagascar. Et seulement à partir de la DEUXIÈME visite, quand
        le service worker prend la main — d'où une carte qui « marchait » une
        fois puis plus jamais.

     ⚠ FONENAKO N'A JAMAIS EU CE DÉFAUT, et pas par chance : il passe par
       Workbox, dont les routes en expression régulière ne s'appliquent qu'à la
       MÊME ORIGINE par défaut. Ce service worker-ci est écrit à la main et
       interceptait tout. On remet la même règle, explicitement.

     ⚠ ET ON NE PERD RIEN : mettre en cache les tuiles d'OpenStreetMap serait
       de toute façon contraire à leur politique d'usage, et leur propre
       en-tête `Cache-Control` fait déjà le travail dans le cache HTTP du
       navigateur. */
  if (url.origin !== self.location.origin) return;

  // Photos o2switch et vignettes : cache d'abord (elles ne changent jamais,
  // le nom de fichier est unique). C'est le principal gain de data mobile.
  const isImage =
    req.destination === "image" ||
    url.pathname.includes("/uploads/") ||
    /\.(png|jpe?g|webp|avif|svg|ico)$/i.test(url.pathname);

  if (isImage) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req)
            .then((res) => {
              if (res.ok) {
                const copy = res.clone();
                caches.open(IMAGES).then((c) => {
                  c.put(req, copy);
                  trim(IMAGES, 400);
                });
              }
              return res;
            })
            /* ⚠ `catch(() => hit)` RENVOYAIT `undefined` QUAND IL N'Y AVAIT
                  RIEN EN CACHE, et `respondWith(undefined)` ne veut pas dire
                  « laisse passer » : ça veut dire ÉCHEC. Une coupure réseau
                  d'une seconde devenait donc une image définitivement cassée,
                  là où sans service worker le navigateur aurait simplement
                  réessayé. On ne rend une réponse que si on en a une. */
            .catch((e) => {
              if (hit) return hit;
              throw e;
            })
      )
    );
    return;
  }

  // Polices : immuables.
  if (req.destination === "font" || /\.woff2?$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req))
    );
    return;
  }

  // Navigation : réseau d'abord, repli sur la coquille en cache (hors ligne).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        // ⚠ ON NE CHERCHE QUE DANS LA COQUILLE DE CE BUILD. `caches.match()`
        //   sans nom de cache fouille TOUS les caches : il pouvait donc rendre
        //   l'`index.html` d'un déploiement mort même après le versionnage.
        caches
          .open(SHELL)
          .then((c) => c.match("/index.html"))
          .then((hit) => hit || caches.match("/offline.html"))
          .then((hit) => hit || new Response("Hors ligne", { status: 503 }))
      )
    );
    return;
  }

  // JS/CSS : on sert le cache et on rafraîchit derrière (stale-while-revalidate).
  if (req.destination === "script" || req.destination === "style") {
    event.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req)
          .then((res) => {
            /* 🔴 `res.ok` NE SUFFIT PAS ICI, ET C'EST CE QUI EMPOISONNAIT LE
                  CACHE. Le `.htaccess` du site renvoie toute URL inconnue vers
                  `index.html` : un fichier SUPPRIMÉ répond « 200 OK,
                  text/html » et non 404. Or le déploiement supprime les
                  anciens assets (69 au dernier envoi). Un visiteur qui revient
                  avec un `index.html` en cache demande donc un morceau à
                  l'ancien hachage, reçoit du HTML, et cette ligne le rangeait
                  DANS LE CACHE sous l'URL du .js — définitivement. Le morceau
                  chargé à la demande ne s'exécutera plus jamais, même après un
                  nouveau déploiement.

                  C'est très probablement pourquoi « la carte ne sort pas »
                  alors que le reste du site marche : /carte est le plus gros
                  morceau différé du bundle, donc le premier à manquer, et le
                  seul écran dont TOUT le contenu vient de ce morceau.

                  On vérifie donc le TYPE, pas le code. */
            const type = res.headers.get("Content-Type") || "";
            const estDuCode =
              type.includes("javascript") ||
              type.includes("ecmascript") ||
              type.includes("css") ||
              type.includes("json");
            if (res.ok && estDuCode) {
              const copy = res.clone();
              caches.open(RUNTIME).then((c) => {
                c.put(req, copy);
                trim(RUNTIME, 60);
              });
              return res;
            }
            // ⚠ Du HTML là où on attend un module : le fichier n'existe plus.
            //   On PURGE l'entrée empoisonnée d'un déploiement précédent et on
            //   laisse échouer franchement — la page se rechargera (voir
            //   `vite:preloadError` dans src/main.tsx), ce qui rapatriera un
            //   index.html frais pointant vers les bons hachages.
            caches.open(RUNTIME).then((c) => c.delete(req));
            throw new Error("module absent (repli HTML)");
          })
          .catch((e) => {
            // Un `hit` peut lui-même être empoisonné par un ancien SW : on ne
            // le rend que s'il est bien du code.
            if (hit && !(hit.headers.get("Content-Type") || "").includes("text/html")) return hit;
            throw e;
          });
        /* ⚠ ON NE REND PLUS `hit ||` AVEUGLÉMENT : si le cache porte du HTML
             hérité d'un ancien SW, le servir rejouerait la panne à chaque
             visite, y compris après correction. */
        if (hit && !(hit.headers.get("Content-Type") || "").includes("text/html")) return hit;
        return net;
      })
    );
  }
});

// Web Push — la chaîne complète (VAPID + edge function) arrive au Lot 5.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Diako", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Diako", {
      body: data.body || "",
      icon: "/media/favicon.png",
      badge: "/media/favicon.png",
      tag: data.tag || "diako",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  // ⚠ DEFAUT CORRIGE : la version precedente se contentait de `client.focus()`.
  //   Un onglet deja ouvert reprenait le focus SANS naviguer — cliquer sur
  //   « Message de X » ramenait donc sur la page qu'on regardait, pas sur les
  //   messages. Une notification qui ne mene pas a ce qu'elle annonce est pire
  //   qu'une absence de notification : on croit avoir rate quelque chose.
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ("focus" in client) {
            // On navigue PUIS on focus. navigate() n'existe pas partout :
            // en cas d'echec, on ouvre une fenetre neuve sur la bonne adresse.
            if ("navigate" in client) {
              return client.navigate(target).then((c) => (c || client).focus());
            }
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      })
      .catch(() => self.clients.openWindow(target))
  );
});
