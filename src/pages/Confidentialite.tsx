import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function Confidentialite() {
  useDocumentTitle("Confidentialité");
  return (
    <article className="prose prose-sm mx-auto max-w-2xl px-4 py-10 dark:prose-invert">
      <h1>Confidentialité</h1>
      <p>
        Ce texte décrit exactement ce que Diako collecte aujourd'hui. Il sera mis
        à jour à chaque nouvelle fonctionnalité.
      </p>

      <h2>Ce que nous collectons</h2>
      <ul>
        <li>
          <strong>Votre compte</strong> : adresse e-mail, mot de passe (chiffré,
          jamais lisible par nous), nom affiché, ville, courte biographie et photo
          de profil si vous en ajoutez une.
        </li>
        <li>
          <strong>La mesure d'audience</strong> : la page visitée, le domaine du
          site d'où vous venez, et un identifiant aléatoire qui disparaît à la
          fermeture de l'onglet. <strong>Aucun cookie publicitaire</strong>, aucun
          traceur tiers, aucun profilage.
        </li>
      </ul>

      <h2>Ce que nous ne faisons pas</h2>
      <ul>
        <li>Nous ne vendons ni ne louons vos données.</li>
        <li>Nous n'affichons aucune publicité ciblée.</li>
        <li>
          Votre adresse e-mail et votre numéro de téléphone ne sont{" "}
          <strong>jamais</strong> visibles publiquement : la base les refuse aux
          visiteurs non connectés.
        </li>
      </ul>

      <h2>Ce qui est public</h2>
      <p>
        Votre nom affiché, votre photo, votre ville et votre biographie sont
        visibles par les autres visiteurs — c'est le principe d'un profil sur un
        réseau social. Vous choisissez ce que vous y mettez.
      </p>

      <h2>Où sont les données</h2>
      <p>
        Les comptes sont hébergés par Supabase à Paris (France). Les photos sont
        hébergées chez o2switch, en France également.
      </p>

      <h2>Vos droits</h2>
      <p>
        Vous pouvez à tout moment consulter et modifier vos informations depuis
        votre compte, ou demander la suppression complète de celui-ci en écrivant à{" "}
        <a href="mailto:contact.fonenako@gmail.com">contact.fonenako@gmail.com</a>.
        La suppression est définitive et efface également vos publications.
      </p>

      <p className="text-xs">Dernière mise à jour : 31 juillet 2026.</p>
    </article>
  );
}
