import { Link } from "react-router-dom";
import { useSEO } from "@/hooks/useSEO";
import { PageLegale } from "@/components/PageLegale";

export default function Mentions() {
  /* `useSEO` et non `useDocumentTitle` : sans lui la page gardait le canonique
     statique de l'accueil et se déclarait duplicata. Audit du 05/09/2026. */
  useSEO({
    titre: "Mentions légales",
    description: "Éditeur, hébergeurs et nature du service Diako, annuaire et réseau social du voyage à Madagascar.",
    url: "/mentions",
  });
  return (
    <PageLegale titre="Mentions légales" majLe="5 septembre 2026">
      

      <h2>Éditeur du site</h2>
      <p>
        Diako — Antananarivo, Madagascar.
        <br />
        Contact :{" "}
        <a href="mailto:contact.diako@gmail.com">contact.diako@gmail.com</a>{" "}
        — voir aussi la <Link to="/aide">page Aide et contact</Link>.
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

      <h2>Données personnelles</h2>
      <p>
        Ce que Diako conserve, pourquoi, combien de temps, et vos droits sont
        décrits dans la <Link to="/confidentialite">page Confidentialité</Link>.
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

      
    </PageLegale>
  );
}
