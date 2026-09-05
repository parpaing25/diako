import { useEffect } from "react";

/**
 * Métadonnées de page : titre, description, aperçu de partage, canonique.
 *
 * ⚠ CE QUE ÇA REMPLACE. Diako n'avait que `useDocumentTitle` : chaque page
 *   changeait son titre, mais la description, l'image d'aperçu et l'URL
 *   canonique restaient celles de l'accueil. Conséquences concrètes :
 *     · partager la fiche d'un hôtel sur WhatsApp affichait « Diako — où
 *       dormir, où manger… » et l'image générique du site ;
 *     · Google voyait la même description sur les 54 fiches d'Ampefy, ce qui
 *       est le meilleur moyen de n'en faire indexer aucune.
 *
 *   Sur ce marché, Facebook et WhatsApp sont le canal d'acquisition n°1 : un
 *   aperçu de partage juste vaut plus que dix optimisations invisibles.
 *
 * Les métadonnées sont restaurées au démontage — sinon la fiche visitée
 * précédemment laisserait son titre sur la page suivante.
 */

const TITRE_BASE = "Diako — Voyage & tourisme à Madagascar";
const DESC_BASE =
  "Trouvez où dormir, où manger et avec qui partir à Madagascar. Hôtels, restaurants et agences de voyage, avec leurs vrais tarifs, leurs menus et leurs circuits.";
/* 🔴 C'ETAIT LE LOGO DE 482 Ko, ET IL CASSAIT LES PARTAGES. `index.html` sert
      deja `og-diako.jpg` — 1200x630, le format que reclament Facebook et
      WhatsApp — mais ce hook l'ECRASAIT des la premiere navigation interne, en
      remettant un carre de 1920x1920. WhatsApp renonce a afficher une vignette
      au-dela d'environ 300 Ko : un lien Diako partage depuis l'app arrivait
      donc sans image, sur le canal par lequel ce site va circuler le plus. */
const IMAGE_BASE = "https://diako.fonenako.mg/media/og-diako.jpg";
const SITE = "https://diako.fonenako.mg";

export interface MetaSEO {
  titre?: string;
  description?: string;
  image?: string;
  /** Chemin ou URL absolue. Par défaut : l'adresse courante. */
  url?: string;
  type?: "website" | "article" | "profile";
  /** Écran privé, résultats de recherche, page « introuvable » : ne pas indexer.
   *  ⚠ Sur cet hébergement toute route rend HTTP 200 (repli SPA) : sans ce
   *    drapeau, Google indexait les écrans « n'existe pas » et « Connectez-vous ». */
  noindex?: boolean;
}

/** Pose la balise si elle existe, la crée sinon. */
function poser(cle: string, valeur: string) {
  const attribut = cle.startsWith("og:") ? "property" : "name";
  let el = document.querySelector<HTMLMetaElement>(`meta[${attribut}="${cle}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attribut, cle);
    document.head.appendChild(el);
  }
  el.setAttribute("content", valeur);
}

export function useSEO({ titre, description, image, url, type = "website", noindex = false }: MetaSEO) {
  useEffect(() => {
    const titreComplet = titre ? `${titre} — Diako` : TITRE_BASE;
    const desc = description?.trim() || DESC_BASE;
    // ⚠ URL ABSOLUE obligatoire : Facebook, Messenger et WhatsApp ne résolvent
    //   pas les chemins relatifs et n'affichent alors AUCUN aperçu.
    const img = image?.startsWith("http") ? image : image ? `${SITE}${image}` : IMAGE_BASE;
    const adresse = url
      ? url.startsWith("http")
        ? url
        : `${SITE}${url}`
      : `${SITE}${window.location.pathname}${window.location.search}`;

    document.title = titreComplet;

    const metas: Record<string, string> = {
      description: desc,
      "og:site_name": "Diako",
      "og:title": titreComplet,
      "og:description": desc,
      "og:image": img,
      "og:url": adresse,
      "og:type": type,
      "og:locale": "fr_FR",
      "twitter:card": "summary_large_image",
      "twitter:title": titreComplet,
      "twitter:description": desc,
      "twitter:image": img,
    };
    Object.entries(metas).forEach(([k, v]) => poser(k, v));

    let canonique = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonique) {
      canonique = document.createElement("link");
      canonique.rel = "canonical";
      document.head.appendChild(canonique);
    }
    canonique.href = adresse;

    // ⚠ Posé ET retiré : sans le retrait, un écran privé visité avant une fiche
    //   laisserait la fiche non indexable.
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (noindex) {
      if (!robots) {
        robots = document.createElement("meta");
        robots.name = "robots";
        document.head.appendChild(robots);
      }
      robots.content = "noindex, follow";
    } else if (robots) {
      robots.remove();
    }

    return () => {
      document.querySelector('meta[name="robots"]')?.remove();
      // Restauration : sans elle, le titre d'une fiche resterait affiché sur
      // la page suivante, et l'aperçu de partage serait celui de la page
      // d'avant — un défaut invisible en navigation, flagrant au partage.
      document.title = TITRE_BASE;
      const defauts: Record<string, string> = {
        description: DESC_BASE,
        "og:title": TITRE_BASE,
        "og:description": DESC_BASE,
        "og:image": IMAGE_BASE,
        "og:url": SITE,
        "og:type": "website",
        "twitter:title": TITRE_BASE,
        "twitter:description": DESC_BASE,
        "twitter:image": IMAGE_BASE,
      };
      Object.entries(defauts).forEach(([k, v]) => poser(k, v));
      const can = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (can) can.href = SITE;
    };
  }, [titre, description, image, url, type, noindex]);
}
