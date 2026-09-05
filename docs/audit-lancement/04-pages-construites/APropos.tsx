import { Link } from "react-router-dom";
import { useSEO } from "@/hooks/useSEO";
import { PageLegale } from "@/components/PageLegale";

/**
 * /a-propos — ce qu'est Diako, qui le fait, comment les données arrivent.
 *
 * ⚠ POURQUOI CETTE PAGE. Une marque inconnue qui affiche des tarifs doit dire
 *   d'où ils viennent et qui répond. Sans elle, le visiteur cherche « Diako
 *   arnaque » avant de cliquer sur « Demander ». Les chiffres ci-dessous sont
 *   ceux de la base au 05/09/2026 (audit de lancement) ; ceux qui bougent
 *   souvent ne sont PAS écrits ici — ils vivent sur /explorer et /plats.
 */
export default function APropos() {
  useSEO({
    titre: "À propos de Diako",
    description:
      "Diako est un annuaire et un réseau social du voyage à Madagascar : hôtels, restaurants, agences et loueurs avec leurs tarifs datés, 508 destinations, 95 plats malgaches, récits de voyageurs.",
    url: "/a-propos",
  });

  return (
    <PageLegale titre="À propos de Diako" majLe="5 septembre 2026">
      <h2>Ce que c'est</h2>
      <p>
        Diako réunit ce qu'il faut pour préparer un voyage à Madagascar et le
        raconter ensuite : <strong>où dormir, où manger, avec qui partir</strong>,
        quand partir et comment y aller. Les établissements y publient leurs
        tarifs, leurs menus et leurs contacts ; les voyageurs y publient leurs
        récits, leurs photos et les plats qu'ils ont goûtés.
      </p>
      <p>
        Diako <strong>met en relation</strong>. Il ne vend rien, n'encaisse rien
        et ne bloque aucune date : quand vous cliquez sur « Demander », vous
        écrivez directement à l'établissement, par WhatsApp ou par téléphone.
      </p>

      <h2>D'où viennent les informations</h2>
      <ul>
        <li>
          <strong>Le référentiel</strong> (destinations, sites naturels et
          culturels, plats, saisons, temps de route) est construit par l'équipe
          à partir de sources publiques — OpenStreetMap, Wikivoyage, Wikimedia
          Commons — puis relu et corrigé à la main.
        </li>
        <li>
          <strong>Les fiches d'établissements</strong> viennent des mêmes sources
          publiques, puis des établissements eux-mêmes : un gérant qui revendique
          sa fiche renseigne ses tarifs, ses horaires et ses photos, et reste le
          seul à pouvoir les modifier.
        </li>
        <li>
          <strong>Les prix</strong> portent toujours leur date. Un prix qui n'a
          pas été confirmé depuis six mois n'est plus affiché : la fiche dit
          « Nous consulter ».
        </li>
        <li>
          <strong>Les récits</strong> sont écrits par des membres. Une offre
          commerciale, une promotion ou un vœu de fête ne sont pas des récits :
          ils nourrissent la fiche de l'établissement, jamais le fil.
        </li>
      </ul>
      <p>
        Aucun chiffre n'est inventé : quand une information manque, la page le
        dit plutôt que de mettre une valeur « pour l'exemple ».
      </p>

      <h2>Qui le fait</h2>
      <p>
        Diako est édité depuis Antananarivo par l'équipe qui fait aussi{" "}
        <a href="https://fonenako.mg" rel="noopener">Fonenako</a>, le site
        immobilier malgache. Le site est gratuit pour les voyageurs comme pour
        les établissements.
      </p>

      <h2>Ce que Diako n'est pas</h2>
      <ul>
        <li>Pas un site de réservation : pas de paiement, pas de calendrier.</li>
        <li>Pas un site d'avis anonymes : on publie sous son nom.</li>
        <li>Pas une agence : les circuits présentés sont ceux des agences elles-mêmes.</li>
      </ul>

      <h2>Vos données</h2>
      <p>
        Diako n'utilise ni cookie publicitaire ni traceur tiers. Ce que nous
        conservons, pourquoi et pendant combien de temps est décrit dans la{" "}
        <Link to="/confidentialite">page Confidentialité</Link>. Vous pouvez
        télécharger vos données et supprimer votre compte depuis vos Paramètres.
      </p>

      <h2>Nous écrire</h2>
      <p>
        Une erreur sur une fiche, un prix qui a changé, une question ? Passez par
        la <Link to="/aide">page Aide</Link> ou écrivez à{" "}
        <a href="mailto:contact.diako@gmail.com">contact.diako@gmail.com</a>.
      </p>
    </PageLegale>
  );
}
