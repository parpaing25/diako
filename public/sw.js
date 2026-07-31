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

const VERSION = "dk-v1";
const SHELL = `${VERSION}-shell`;
const IMAGES = `${VERSION}-img`;
const RUNTIME = `${VERSION}-rt`;

const MANIFEST = (self.__WB_MANIFEST || []).map((e) =>
  typeof e === "string" ? e : e.url
);

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
          keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
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
            .catch(() => hit)
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
        caches
          .match("/index.html")
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
            if (res.ok) {
              const copy = res.clone();
              caches.open(RUNTIME).then((c) => {
                c.put(req, copy);
                trim(RUNTIME, 60);
              });
            }
            return res;
          })
          .catch(() => hit);
        return hit || net;
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
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
