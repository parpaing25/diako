// -*- coding: utf-8 -*-
/**
 * LE BUILD RESPECTE-T-IL LA CSP QUE LE SERVEUR IMPOSE ?
 *
 * 🔴 CE SCRIPT EXISTE PARCE QUE LA GARDE N'EXISTAIT PLUS. `public/.htaccess`
 *    sert `script-src 'self'` et son commentaire prévenait, en majuscules :
 *    « Toute réintroduction d'un script en ligne casserait le site EN SILENCE :
 *    rejouer $TEMP/verif-csp.mjs avant de déployer. » Ce fichier-là vivait dans
 *    un dossier temporaire — il avait disparu depuis longtemps.
 *
 *    Le 27/10/2026, une optimisation a injecté `<script>window.__DK_SB=…` dans
 *    index.html. En local, aucune CSP : la mesure montrait la requête partir à
 *    46 ms. En ligne, le navigateur a REFUSÉ le script ; l'optimisation n'a
 *    jamais rien fait, et rien ne le disait — ni le build, ni le déploiement,
 *    ni la page, qui s'affiche parfaitement. Seule la console l'écrivait.
 *
 * ⚠ CE QUI EST REFUSÉ PAR `script-src 'self'` : tout `<script>` sans `src`
 *   (sauf les types de DONNÉES comme application/ld+json, que le navigateur
 *   n'exécute pas) et tout attribut d'événement en ligne (`onclick=…`).
 *   Les attributs `data-*`, eux, ne sont pas du code : ils passent.
 *
 * ⚠ TOUTES LES PAGES, PAS SEULEMENT L'ACCUEIL : le pré-rendu écrit un HTML par
 *   route dans dist/_pre. Une seule page fautive suffit à casser cette route.
 *
 * Lancé par `npm run build`, donc impossible à oublier.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const pages = [];
const parcourir = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) parcourir(p);
    else if (n.endsWith(".html")) pages.push(p);
  }
};
try {
  parcourir(DIST);
} catch {
  console.error("verifier-csp : dist/ introuvable — rien à contrôler.");
  process.exit(0);
}

const fautes = [];
for (const p of pages) {
  const html = readFileSync(p, "utf8");
  const nom = relative(DIST, p);

  for (const m of html.matchAll(/<script\b([^>]*)>/g)) {
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs)) continue;
    // Un type que le navigateur n'exécute pas n'est pas du script.
    if (/type\s*=\s*["'](application\/ld\+json|application\/json|text\/template)["']/.test(attrs)) continue;
    fautes.push(`${nom} : <script${attrs}> en ligne`);
  }
  for (const m of html.matchAll(/\s(on[a-z]+)\s*=\s*["']/g)) {
    fautes.push(`${nom} : attribut d'événement en ligne ${m[1]}=`);
  }
}

if (fautes.length) {
  console.error(`\n🔴 CSP — ${fautes.length} élément(s) que le serveur REFUSERA en ligne :`);
  for (const f of fautes.slice(0, 20)) console.error("   " + f);
  console.error(
    "\n   `script-src 'self'` (public/.htaccess) interdit le script en ligne.\n" +
      "   Passer par un fichier externe, ou par des attributs data-* relus\n" +
      "   avec document.currentScript.dataset.\n"
  );
  process.exit(1);
}
console.log(`verifier-csp : ${pages.length} page(s) contrôlée(s), aucun script en ligne.`);
