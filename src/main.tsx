import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Le squelette statique de index.html est peint AVANT React (c'est lui
// l'élément LCP). On ne le retire qu'une fois la coquille React montée,
// sinon l'écran clignote en blanc entre les deux.
function removeShell() {
  const shell = document.getElementById("dk-shell");
  if (shell) shell.remove();
}

/**
 * 🔴 QUAND UN MORCEAU DIFFÉRÉ N'EXISTE PLUS — le défaut « la carte ne sort pas ».
 *
 *    Le déploiement écrit les nouveaux assets hachés PUIS supprime les anciens
 *    (69 au dernier envoi). Un visiteur qui revient avec l'`index.html` de la
 *    veille demande donc un morceau à l'ancien hachage. Et il ne reçoit pas un
 *    404 : le `.htaccess` renvoie toute URL inconnue vers `index.html`, donc
 *    « 200 OK, text/html ». Le navigateur essaie d'exécuter du HTML comme un
 *    module, l'import échoue, et l'écran reste VIDE — sans erreur visible, sans
 *    rien à cliquer. Les pages du bundle principal continuaient de marcher, ce
 *    qui rendait la panne incompréhensible : seule /carte, dont tout le contenu
 *    vit dans un morceau différé, disparaissait.
 *
 * ⚠ LE RECHARGEMENT EST GARDÉ PAR `sessionStorage`. Si le morceau manque pour
 *   une autre raison — coupure réseau, hébergeur qui limite (o2switch rend 429
 *   sur une rafale) — recharger en boucle transformerait une gêne passagère en
 *   page qui clignote sans fin. Une seule tentative par session : elle suffit,
 *   puisqu'un rechargement rapatrie un `index.html` frais aux bons hachages.
 */
const CLE_RECHARGE = "dk-recharge-module";

function surModuleAbsent(e: Event) {
  try {
    // 2e échec de la session : on laisse l'erreur remonter — c'est
    // l'ErrorBoundary qui prend la main, avec quelque chose à cliquer.
    if (sessionStorage.getItem(CLE_RECHARGE)) return;
    sessionStorage.setItem(CLE_RECHARGE, "1");
  } catch {
    // Navigation privée sans stockage : on ne recharge pas plutôt que risquer
    // une boucle qu'on ne saurait plus arrêter.
    return;
  }
  /* 🔴 `preventDefault` SEULEMENT quand on recharge. Pour Vite, neutraliser
     `vite:preloadError` veut dire « ne lève pas l'erreur » : l'`import()`
     résout alors `undefined`, et React.lazy plantait en lisant `.default` —
     « Cannot read properties of undefined (reading 'default') », vu cinq fois
     en deux minutes chez un visiteur Android le 05/09/2026 (journal_erreurs
     #10-14), à chaque morceau refusé par le limiteur o2switch APRÈS le seul
     rechargement autorisé. Sans neutralisation l'erreur est franche, et
     `chargerPage` (src/lib/chargerPage.ts) a déjà réessayé une fois avant. */
  e.preventDefault();
  window.location.reload();
}

window.addEventListener("vite:preloadError", surModuleAbsent);

// ⚠ LE FILET DU FILET. `vite:preloadError` ne couvre que le préchargement des
//   modules ; un `import()` qui échoue au moment du rendu remonte, lui, en
//   rejet non géré. Les deux mènent au même écran vide.
window.addEventListener("unhandledrejection", (e) => {
  const m = String((e.reason as Error | undefined)?.message ?? e.reason ?? "");
  if (
    /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unexpected token '<'/i.test(
      m
    )
  ) {
    surModuleAbsent(e);
  }
});

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<App />);
  // Un frame après le premier rendu : React a peint, on peut enlever le décor.
  requestAnimationFrame(() => requestAnimationFrame(removeShell));
}

/* ⚠ LE JETON N'EST JAMAIS RENDU, ET C'EST DÉLIBÉRÉ. Le réflexe serait de
     l'effacer dès que React a monté — mais l'échec qu'on rattrape survient plus
     tard, au moment où l'on ouvre /carte. Rendre le jeton au montage rouvrirait
     donc le droit de recharger à CHAQUE tour : morceau absent → rechargement →
     React monte → jeton rendu → morceau toujours absent → rechargement… une
     page qui clignote sans fin si le fichier manque vraiment côté serveur.
     Un seul rechargement par session suffit pour le cas réel (un `index.html`
     périmé), et au deuxième échec l'ErrorBoundary prend la main avec quelque
     chose à cliquer. */
