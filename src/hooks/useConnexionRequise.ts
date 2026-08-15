import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

/**
 * « IL FAUT UN COMPTE POUR ÇA » — dit une seule fois, et de la même façon.
 *
 * 🔴 CE QUE ÇA CORRIGE. Quatre écrans affichaient `toast("Connexion requise")`
 *    et s'arrêtaient là : le cœur du fil, le signet, « Marquer goûté », et
 *    « Suivre » sur un profil. Le message passait trois secondes, et le
 *    visiteur restait devant un bouton qui ne fait rien, SANS aucun chemin vers
 *    l'inscription à cet instant précis.
 *
 *    Or c'est exactement l'instant qui compte : le fil est le premier écran
 *    d'un visiteur anonyme, et le moment où il aime un récit est le seul moment
 *    où il a une raison de créer un compte. Le tunnel était coupé pile là.
 *
 * ⚠ POURQUOI UN CROCHET ET PAS QUATRE CORRECTIFS. La fiche d'établissement
 *   faisait déjà le geste complet — toast PUIS `navigate("/auth")`. Les quatre
 *   autres avaient divergé. Corriger chacun dans son coin les aurait laissés
 *   diverger à nouveau au prochain écran ajouté : il n'y a plus qu'un endroit
 *   où cette décision est écrite.
 *
 * ⚠ ON NE REDIRIGE PAS BRUTALEMENT. Le toast porte l'action : le visiteur choisit
 *   d'y aller. Une redirection sèche depuis un geste aussi léger qu'un cœur
 *   ferait perdre la lecture en cours, et se lit comme un piège.
 */
export function useConnexionRequise() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return useCallback(
    /**
     * @param quoi ce que le visiteur allait faire, à la 2ᵉ personne et à
     *   l'infinitif : « garder cette adresse », « tenir votre carnet ».
     *   Un message qui nomme le geste convertit mieux qu'un « connectez-vous ».
     * @returns `true` si la personne est connectée et que l'appelant peut agir.
     */
    (quoi = "participer"): boolean => {
      if (user) return true;
      toast("Connexion requise", {
        description: `Créez un compte pour ${quoi}.`,
        action: { label: "Créer un compte", onClick: () => navigate("/auth") },
      });
      return false;
    },
    [user, navigate]
  );
}
