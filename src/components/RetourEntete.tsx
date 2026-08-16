import { useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useRetour } from "@/hooks/useRetour";

/**
 * LE RETOUR, DANS L'ENTÊTE, SUR TOUTES LES PAGES.
 *
 * 🔴 CE QUE ÇA CORRIGE. La consigne du propriétaire était « TOUS les boutons
 *    retour ». Quatre écrans avaient été traités ; le relevé en a trouvé
 *    DIX-NEUF sans la moindre affordance de retour — /plat, /plats, /site,
 *    /recherche, /favoris, /profil, /parametres, /compte, /publier,
 *    /quand-partir, /y-aller, /evenements, /guides, /circuits, /circuit,
 *    /espace-pro, /notifications, /gouts, /projet. Sur téléphone, seul le geste
 *    système permettait d'en sortir.
 *
 * ⚠ POURQUOI DANS L'ENTÊTE ET PAS DANS CHAQUE PAGE. Dix-neuf retouches, c'est
 *   dix-neuf occasions de se tromper — et surtout dix-neuf endroits à ne pas
 *   oublier au prochain écran ajouté. Ici, le bouton existe par construction :
 *   une page nouvelle l'a sans que personne y pense. Les écrans qui ont déjà
 *   leur propre retour dans le corps de page le gardent : deux affordances ne
 *   se gênent pas, l'une est au pouce, l'autre dans le fil de lecture.
 *
 * ⚠ IL NE S'AFFICHE PAS À LA RACINE. Sur l'accueil il n'y a rien derrière, et
 *   un bouton qui ne fait rien apprend à ne plus cliquer sur les boutons.
 *
 * ⚠ NI QUAND ON ARRIVE DIRECTEMENT. `history.state.idx` vaut 0 lorsqu'on ouvre
 *   un lien partagé — le canal d'acquisition n°1 de ce marché. Le hook saurait
 *   se rabattre, mais afficher une flèche « retour » à quelqu'un qui vient
 *   d'arriver est un mensonge : il n'y a pas de page précédente. On préfère ne
 *   rien montrer.
 */
export function RetourEntete() {
  const { pathname } = useLocation();
  const retour = useRetour("/");
  const profond = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;

  if (pathname === "/" || !profond) return null;

  return (
    <button
      onClick={retour}
      aria-label="Revenir à la page précédente"
      /* ⚠ 36 px de côté plus la zone de frappe du parent : c'est le premier
         geste de l'écran sur téléphone, le rater fait quitter le site. */
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted"
    >
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
