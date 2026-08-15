import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * REVENIR À LA PAGE PRÉCÉDENTE — vraiment, et sans sortir du site.
 *
 * 🔴 DEUX FAÇONS DE SE TROMPER, ET LE PRODUIT AVAIT LES DEUX.
 *
 *    ① Un retour CODÉ EN DUR. La console pro faisait `navigate("/pro")` : si
 *      l'on arrivait depuis la fiche publique de son hôtel, « Retour » menait
 *      à la liste des établissements, pas à la fiche. Le bouton ne ramène pas
 *      où l'on était, il ramène où le développeur a supposé qu'on était.
 *
 *    ② Un `navigate(-1)` NU. Il paraît juste, et il l'est — sauf pour qui
 *      arrive par un lien partagé sur WhatsApp, le canal d'acquisition n°1 de
 *      ce marché. Sans historique, `-1` renvoie sur la page d'AVANT le site :
 *      le bouton « Retour » de Diako fait quitter Diako.
 *
 * ⚠ D'OÙ LE TEST SUR `history.state.idx`. React Router y tient l'index de
 *   l'entrée courante dans SON historique : à 0, on est entré directement, et
 *   il n'y a rien derrière à quoi revenir. On se rabat alors sur une route
 *   sensée, donnée par l'appelant — jamais sur l'accueil par défaut, qui ne
 *   veut rien dire depuis une fiche.
 */
export function useRetour(repli = "/") {
  const navigate = useNavigate();
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(repli, { replace: true });
  }, [navigate, repli]);
}
