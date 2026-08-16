/**
 * Onglet « Chiffres » — l'état réel de Diako, compté en SQL.
 *
 * ⚠ AUCUN CHIFFRE N'EST CALCULÉ ICI. Tout vient de `dk_admin_statistiques()`,
 *   qui fait des `count(*)`. La raison est écrite dans la migration : PostgREST
 *   plafonne silencieusement une lecture à 1000 lignes, donc compter la
 *   longueur d'un tableau côté client afficherait « 1000 » pour toujours à
 *   partir du 1001ᵉ membre — sans une seule erreur pour le signaler.
 *
 * ⚠ AUCUNE COURBE, AUCUNE ÉVOLUTION, AUCUN POURCENTAGE DE CROISSANCE. Il
 *   faudrait un historique pour cela, et rien dans ce dépôt n'en garde un. Une
 *   flèche « +12 % » dessinée à partir d'une seule mesure serait une donnée
 *   inventée — la première règle du projet.
 */

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { EtatErreur } from "@/components/Etats";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import {
  dateEtHeure,
  messageErreur,
  nombre,
  statistiquesAdmin,
  type StatistiquesAdmin,
} from "@/lib/admin";
import { BTN_SECONDAIRE, Carte, Chiffre, Note, Squelette } from "./Communs";

export default function Statistiques() {
  const [chiffres, setChiffres] = useState<StatistiquesAdmin | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);

  const charger = useCallback(async (silencieux = false) => {
    if (!silencieux) setChargement(true);
    try {
      setChiffres(await statistiquesAdmin());
      setErreur(false);
    } catch (e) {
      setErreur(true);
      if (!silencieux) toast.error(messageErreur(e, "Les chiffres n'ont pas pu être lus."));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  /**
   * ⚠ RAFRAÎCHISSEMENT AU FOCUS, PAS DE REALTIME. La règle du dépôt réserve
   *   Realtime au chat et aux notifications — un abonnement sur des compteurs
   *   coûterait de l'egress pour un écran qu'une personne ouvre.
   */
  useRefreshOnFocus(
    useCallback(() => {
      void charger(true);
    }, [charger])
  );

  if (chargement && !chiffres) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="dk-skeleton h-24 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (erreur && !chiffres) {
    return (
      <EtatErreur
        titre="Les chiffres n'ont pas pu être lus"
        texte="Rien n'est perdu. Réessayez, la connexion est peut-être passée en 2G."
        onReessayer={() => void charger()}
      />
    );
  }

  if (!chiffres) return null;

  const c = chiffres;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="dk-secondaire">Arrêté au {dateEtHeure(c.arrete_le)}, heure du serveur.</p>
        <button type="button" onClick={() => void charger()} className={BTN_SECONDAIRE}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Actualiser
        </button>
      </div>

      {/* ── Ce qui demande une décision ─────────────────────────────────── */}
      {/* ⚠ EN PREMIER, ET PAS EN BAS. Une console s'ouvre pour savoir ce qui
          attend ; le reste est du contexte. */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">À traiter</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Chiffre
            valeur={nombre(c.signalements_ouverts)}
            libelle="Signalements ouverts"
            precision="Publications, commentaires, profils"
            ton="attention"
          />
          <Chiffre
            valeur={nombre(c.photos_en_attente)}
            libelle="Photos proposées"
            precision="En attente de décision"
            ton="attention"
          />
          <Chiffre
            valeur={nombre(c.publications_masquees)}
            libelle="Publications masquées"
            precision="Masquage automatique au 3ᵉ signalement"
          />
          <Chiffre
            valeur={nombre(c.signalements_traites)}
            libelle="Signalements soldés"
            precision="Traités ou rejetés"
          />
        </div>
      </section>

      {/* ── Les membres ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Membres</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Chiffre valeur={nombre(c.membres)} libelle="Inscrits" />
          <Chiffre valeur={nombre(c.membres_7j)} libelle="Depuis 7 jours" />
          <Chiffre
            valeur={nombre(c.membres_pro)}
            libelle="Comptes pro"
            precision="Déclarés, pas vérifiés"
          />
          <Chiffre valeur={nombre(c.commentaires)} libelle="Commentaires" />
        </div>
      </section>

      {/* ── Ce que les membres publient ─────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Publications</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Chiffre valeur={nombre(c.publications)} libelle="En ligne" />
          <Chiffre valeur={nombre(c.publications_7j)} libelle="Depuis 7 jours" />
          <Chiffre valeur={nombre(c.publications_retirees)} libelle="Retirées" />
          <Chiffre valeur={nombre(c.photos_approuvees)} libelle="Photos approuvées" />
        </div>
      </section>

      {/* ── Le référentiel ──────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Référentiel</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Chiffre
            valeur={nombre(c.destinations)}
            libelle="Destinations"
            precision={`${nombre(c.destinations_photo)} avec une photo`}
          />
          <Chiffre valeur={nombre(c.sites)} libelle="Sites" />
          <Chiffre valeur={nombre(c.plats)} libelle="Plats" />
          <Chiffre
            valeur={nombre(c.etablissements)}
            libelle="Établissements"
            precision="Publiés seulement"
          />
        </div>
        <Carte className="mt-3">
          <Note>
            Les destinations sans photo sont la première lacune visible du produit :
            l'entête d'une fiche sans couverture est un aplat de couleur. L'onglet
            « Photos » sert exactement à ça.
          </Note>
        </Carte>
      </section>
    </div>
  );
}
