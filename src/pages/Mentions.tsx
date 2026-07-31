import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function Mentions() {
  useDocumentTitle("Mentions légales");
  return (
    <article className="prose prose-sm mx-auto max-w-2xl px-4 py-10 dark:prose-invert">
      <h1>Mentions légales</h1>

      <h2>Éditeur du site</h2>
      <p>
        Diako — Antananarivo, Madagascar.
        <br />
        Contact :{" "}
        <a href="mailto:contact.fonenako@gmail.com">contact.fonenako@gmail.com</a>
      </p>

      <h2>Hébergement</h2>
      <p>
        Le site est hébergé par <strong>o2switch</strong>, 222-224 boulevard
        Gustave Flaubert, 63000 Clermont-Ferrand, France.
        <br />
        Les données de compte sont hébergées par <strong>Supabase</strong>, sur
        une infrastructure située à Paris (France).
      </p>

      <h2>Nature du service</h2>
      <p>
        Diako est un <strong>annuaire et un réseau social</strong> consacrés au
        voyage et au tourisme à Madagascar. Diako{" "}
        <strong>ne vend pas de séjours</strong>, n'encaisse aucun paiement pour le
        compte des établissements référencés et n'intervient pas dans la relation
        entre un voyageur et un professionnel.
      </p>
      <p>
        Les tarifs, menus, horaires et disponibilités sont publiés par les
        établissements eux-mêmes ou collectés à partir de sources publiques. Ils
        sont donnés à titre indicatif et peuvent avoir changé. Diako ne garantit
        ni leur exactitude, ni la qualité des prestations.
      </p>

      <h2>Signaler un contenu</h2>
      <p>
        Toute personne peut demander la correction ou le retrait d'une fiche, d'une
        photo ou d'un avis la concernant en écrivant à l'adresse ci-dessus. Les
        demandes sont traitées sous 48 heures ouvrées.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        Les photographies publiées par les utilisateurs restent la propriété de
        leurs auteurs. Publier sur Diako une image dont on ne détient pas les
        droits est interdit et entraîne son retrait.
      </p>

      <p className="text-xs">Dernière mise à jour : 31 juillet 2026.</p>
    </article>
  );
}
