import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// ─────────────────────────────────────────────────────────────────────────────
// DIAKO — configuration de build.
// Reprend les reglages payes cher sur Fonenako (cf. docs/TDR-DIAKO.md §10) :
//   · CSS NON bloquant (preload + application par JS dans app-init.js)
//   · manualChunks vendor figes  ⚠ NE JAMAIS retirer `radix-vendor` :
//     cela change l'ordre d'initialisation des modules et provoque
//     « can't access lexical declaration before initialization »
//     => PAGE BLANCHE sous Firefox (Chrome tolere).
//   · precache PWA reduit a la COQUILLE (pas de glob **/*).
// Cible : bundle initial < 200 Ko brotli pour la 3G malgache.
// ─────────────────────────────────────────────────────────────────────────────

export default defineConfig(({ mode }) => ({
  // Sous-domaine o2switch => chemins relatifs obligatoires.
  base: "./",
  server: { host: "::", port: 8080 },
  plugins: [
    react(),
    {
      // Le CSS de l'app devient un <link rel=preload> ; app-init.js le
      // transforme en vraie feuille de style => rendu non bloque.
      name: "dk-preload-css",
      apply: "build" as const,
      transformIndexHtml(html: string) {
        return html.replace(
          /<link rel="stylesheet"(?![^>]*\bmedia=)[^>]*?href="([^"]+)"[^>]*>/g,
          (_m, href) => `<link id="dk-css" rel="preload" as="style" href="${href}">`
        );
      },
    },
    VitePWA({
      registerType: "autoUpdate",
      // app-init.js enregistre le SW de facon RETARDEE (requestIdleCallback) :
      // le precache ne concurrence jamais l'affichage.
      injectRegister: false,
      strategies: "injectManifest",
      srcDir: "public",
      filename: "sw.js",
      includeAssets: ["media/favicon.png", "media/diako-logo.png", "offline.html"],
      manifest: {
        name: "Diako — Voyage & tourisme a Madagascar",
        short_name: "Diako",
        description:
          "Trouvez ou dormir, ou manger et avec qui partir a Madagascar. Hotels, restaurants, agences de voyage.",
        lang: "fr",
        theme_color: "#0E7C86",
        background_color: "#ffffff",
        display: "standalone",
        scope: "./",
        start_url: "./",
        orientation: "portrait-primary",
        icons: [
          { src: "media/diako-logo.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
          { src: "media/favicon.png", sizes: "192x192", type: "image/png", purpose: "any" },
        ],
      },
      injectManifest: {
        // PRECACHE = LA COQUILLE, RIEN DE PLUS.
        // Fonenako precachait 154 fichiers / 3,7 Mo derriere le dos du visiteur :
        // accueil a 9,6 s alors que la page etait interactive a 4,3 s.
        globPatterns: [
          "index.html",
          "assets/index-*.css",
          "assets/index-*.js",
          "assets/react-vendor-*.js",
          "assets/supabase-vendor-*.js",
          "assets/radix-vendor-*.js",
          "fonts/*.woff2",
          "media/favicon.png",
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    dedupe: ["react", "react-dom"],
  },
  build: {
    sourcemap: false,
    minify: mode === "production" ? "esbuild" : false,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/react-router-dom/")
          )
            return "react-vendor";
          if (id.includes("node_modules/@supabase/")) return "supabase-vendor";
          if (id.includes("node_modules/@radix-ui/")) return "radix-vendor";
          // clsx est partage entre recharts et le cn() de l'app : sans regle
          // explicite, Rollup le fusionne dans charts-vendor et l'entree tire
          // alors ~420 Ko de recharts sur l'accueil.
          if (id.includes("node_modules/clsx/")) return "react-vendor";
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3"))
            return "charts-vendor";
          if (id.includes("node_modules/react-hook-form") || id.includes("node_modules/zod"))
            return "forms-vendor";
          // Pas de manualChunks applicatifs : ils forcent l'import statique de
          // pages pourtant lazy() et gonflent le bundle initial.
        },
      },
    },
    chunkSizeWarningLimit: 250,
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom", "@supabase/supabase-js"],
  },
}));
