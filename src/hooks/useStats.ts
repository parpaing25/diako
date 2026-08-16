import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * LES COMPTEURS DU RÉFÉRENTIEL — une seule fois pour toute la page.
 *
 * 🔴 CE FICHIER EXISTE POUR DEUX DÉFAUTS À LA FOIS.
 *
 *    1. DES CHIFFRES ÉCRITS EN DUR QUI ONT VIEILLI. « 178 destinations »
 *       figurait sur /circuits, /guides, l'accueil et la feuille de route ;
 *       le référentiel en porte 508 depuis la campagne d'import, et 42 accès
 *       relevés au lieu de 41. Un chiffre recopié à la main dans le JSX ne
 *       peut que dériver — celui-ci vient de la base à chaque affichage.
 *
 *    2. LE MÊME APPEL LANCÉ PLUSIEURS FOIS. `SideNav` et `RightRail`
 *       appelaient `stats_diako()` chacun de son côté : deux allers-retours
 *       sur desktop pour une réponse identique. La promesse est mémorisée ici
 *       au niveau du MODULE, donc partagée par tous les appelants d'un même
 *       chargement de page, quel que soit leur ordre de montage.
 *
 * ⚠ LE CACHE NE S'INVALIDE PAS, ET C'EST VOULU. Ces compteurs bougent de
 *   quelques unités par semaine ; les rafraîchir en cours de session coûterait
 *   de l'egress pour un chiffre que personne ne regarde deux fois. Un
 *   rechargement de page suffit.
 */
export interface StatsDiako {
  destinations: number;
  plats: number;
  sites: number;
  recits: number;
  membres: number;
  localites: number;
  etablissements: number;
  vues_7j: number;
}

let enVol: Promise<StatsDiako | null> | null = null;

function charger(): Promise<StatsDiako | null> {
  if (enVol) return enVol;
  // ⚠ `Promise.resolve` N'EST PAS DÉCORATIF. Le constructeur de requête de
  //   supabase-js est un simple *thenable* : il n'expose pas `.catch`, et le
  //   mettre en cache tel quel ne compile pas. On le convertit en vraie
  //   promesse avant de le garder.
  const p: Promise<StatsDiako | null> = Promise.resolve(supabase.rpc("stats_diako"))
    .then(({ data }) => (data as unknown as StatsDiako | null) ?? null)
    .catch(() => {
      // ⚠ On oublie l'échec pour qu'un remontage puisse retenter : garder une
      //   promesse rejetée en cache condamnerait les compteurs pour toute la
      //   session après un simple hoquet réseau.
      enVol = null;
      return null;
    });
  enVol = p;
  return p;
}

export function useStats(): StatsDiako | null {
  const [stats, setStats] = useState<StatsDiako | null>(null);
  useEffect(() => {
    let vivant = true;
    void charger().then((d) => {
      if (vivant) setStats(d);
    });
    return () => {
      vivant = false;
    };
  }, []);
  return stats;
}

/**
 * Un compteur prêt à afficher, avec l'espace fine insécable des milliers.
 *
 * ⚠ RIEN NE S'AFFICHE TANT QU'ON NE SAIT PAS. Le repli est une chaîne vide, pas
 *   un zéro ni un « — » : « 0 destinations » pendant le chargement se lit comme
 *   un site vide, et c'est la première impression qu'on ne rattrape pas.
 */
export function compteur(n: number | undefined | null): string {
  return typeof n === "number" ? n.toLocaleString("fr-FR") : "";
}
