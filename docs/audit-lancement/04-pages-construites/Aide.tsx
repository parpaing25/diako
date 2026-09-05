import { Link } from "react-router-dom";
import { useSEO } from "@/hooks/useSEO";
import { PageLegale } from "@/components/PageLegale";

/**
 * /aide — les questions qu'on se pose avant de faire confiance, et le contact.
 *
 * Chaque réponse tient en trois phrases et renvoie vers l'écran qui fait la
 * chose. Les <details> natifs : zéro JS, lisibles par un lecteur d'écran,
 * cherchables par Ctrl+F. Les ancres (#pro, #contact) sont liées depuis le
 * pied de page et la synthèse de l'audit.
 */
const QUESTIONS: { id: string; q: string; r: JSX.Element }[] = [
  {
    id: "gratuit",
    q: "Diako est-il gratuit ?",
    r: (
      <p>
        Oui, pour les voyageurs comme pour les établissements. Diako ne vend
        rien et ne prend aucune commission : quand vous contactez un hôtel ou une
        agence, vous traitez directement avec eux.
      </p>
    ),
  },
  {
    id: "prix",
    q: "Les prix affichés sont-ils fiables ?",
    r: (
      <p>
        Chaque prix porte sa date et la personne qui l'a donné (l'établissement
        ou une source publique). Passé six mois sans confirmation, il disparaît
        et la fiche dit « Nous consulter ». Un prix vous semble faux ? Le bouton
        « Signaler » de la fiche, ou un mot à l'adresse ci-dessous.
      </p>
    ),
  },
  {
    id: "demander",
    q: "Que se passe-t-il quand je clique sur « Demander » ?",
    r: (
      <p>
        Vous ouvrez WhatsApp (ou un appel) vers le numéro que l'établissement a
        déclaré, avec un message déjà rempli. Diako ne voit pas cette
        conversation et ne bloque aucune date : c'est l'établissement qui vous
        confirme.
      </p>
    ),
  },
  {
    id: "compte",
    q: "Faut-il un compte ?",
    r: (
      <p>
        Non pour chercher, lire et contacter. Oui pour publier un récit, réagir,
        enregistrer un carnet, écrire à un membre ou gérer une fiche
        d'établissement. Un compte demande une adresse e-mail (ou Google) et
        un mot de passe de 8 caractères au moins.
      </p>
    ),
  },
  {
    id: "publier",
    q: "Comment publier un récit ?",
    r: (
      <p>
        Connecté, ouvrez <Link to="/publier">Publier</Link> : un lieu, un texte,
        des photos. Le récit raconte un vécu (« on a dormi », « j'ai goûté ») ;
        une offre commerciale ou une promotion n'est pas un récit et sera
        retirée du fil. Sur Android, vous pouvez partager des photos directement
        vers Diako depuis votre galerie.
      </p>
    ),
  },
  {
    id: "pro",
    q: "Je tiens un hôtel, un restaurant, une agence : comment avoir ma fiche ?",
    r: (
      <>
        <p>
          Cherchez d'abord votre établissement : il est probablement déjà
          référencé. Sur sa fiche, « Je gère cet établissement » ouvre la
          revendication : votre métier, un numéro de contact et une pièce qui
          prouve que vous en êtes responsable (NIF, STAT, carte, ou photo du
          lieu prise par vous). Nous validons sous 48 heures ouvrées.
        </p>
        <p>
          Une fois validé, vous seul modifiez tarifs, horaires, menus et photos
          depuis votre <Link to="/pro">espace professionnel</Link>. Votre fiche
          n'est pas trouvée ? Créez-la depuis le même écran.
        </p>
      </>
    ),
  },
  {
    id: "photos",
    q: "Qui a le droit de publier des photos ?",
    r: (
      <p>
        Vous publiez uniquement des photos que vous avez prises ou dont vous
        détenez les droits. Les photos de sites viennent parfois de Wikimedia
        Commons : leur auteur est alors crédité sous l'image. Une photo vous
        appartient et se trouve ici sans votre accord ? Écrivez-nous, elle est
        retirée sous 48 heures.
      </p>
    ),
  },
  {
    id: "signaler",
    q: "Comment signaler une fiche fermée, un contenu déplacé ou une erreur ?",
    r: (
      <p>
        Chaque fiche et chaque récit ont un bouton « Signaler » (fermé, prix
        faux, pas à sa place, autre). Nous répondons sous 48 heures ouvrées.
        Pour une urgence, l'adresse ci-dessous.
      </p>
    ),
  },
  {
    id: "donnees",
    q: "Que faites-vous de mes données ?",
    r: (
      <p>
        Le minimum : votre e-mail pour le compte, vos publications, vos
        réactions et vos messages. Pas de cookie publicitaire, pas de traceur
        tiers. Vous téléchargez vos données et supprimez votre compte depuis{" "}
        <Link to="/parametres">Paramètres</Link>. Le détail est dans la{" "}
        <Link to="/confidentialite">page Confidentialité</Link>.
      </p>
    ),
  },
  {
    id: "hors-ligne",
    q: "Ça marche en 3G, hors connexion ?",
    r: (
      <p>
        Diako est conçu pour un téléphone Android d'entrée de gamme en 3G. Vous
        pouvez l'installer sur l'écran d'accueil (« Installer Diako ») ; les pages
        déjà visitées restent lisibles quand la connexion tombe.
      </p>
    ),
  },
];

export default function Aide() {
  useSEO({
    titre: "Aide et contact",
    description:
      "Diako est-il gratuit ? Les prix sont-ils fiables ? Comment revendiquer la fiche de mon hôtel ? Les réponses, et comment nous écrire.",
    url: "/aide",
  });

  return (
    <PageLegale titre="Aide et contact" majLe="5 septembre 2026">
      <p>
        Dix questions qu'on nous pose avant de faire confiance. Si la vôtre n'y
        est pas, <a href="#contact">écrivez-nous</a>.
      </p>

      {QUESTIONS.map(({ id, q, r }) => (
        <details key={id} id={id} className="group mt-3 rounded-xl border border-border bg-card px-4 py-3 open:shadow-sm">
          <summary className="cursor-pointer list-none text-base font-semibold [&::-webkit-details-marker]:hidden">
            <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden="true">
              ›
            </span>
            {q}
          </summary>
          <div className="mt-2 text-sm text-muted-foreground [&_a]:text-primary [&_a]:underline">{r}</div>
        </details>
      ))}

      <h2 id="contact">Nous écrire</h2>
      <p>
        <a href="mailto:contact.diako@gmail.com">contact.diako@gmail.com</a> —
        réponse sous 48 heures ouvrées. Dites-nous la page concernée (copiez
        l'adresse du navigateur) et, pour une fiche, le nom de l'établissement.
      </p>
      <p>
        Vous êtes un établissement et vous voulez être appelé ? Indiquez votre
        numéro et une plage horaire.
      </p>
    </PageLegale>
  );
}
