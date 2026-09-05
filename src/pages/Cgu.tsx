import { useSEO } from "@/hooks/useSEO";
import { PageLegale } from "@/components/PageLegale";

export default function Cgu() {
  useSEO({ titre: "Conditions d'utilisation", description: "Les règles d'usage de Diako : publier un récit, revendiquer une fiche, signaler un contenu.", url: "/cgu" });
  return (
    <PageLegale titre="Conditions d'utilisation" majLe="31 juillet 2026">
      
      <p>
        En créant un compte ou en utilisant Diako, vous acceptez les règles
        ci-dessous. Elles sont courtes et écrites pour être comprises.
      </p>

      <h2>1. Ce qu'est Diako</h2>
      <p>
        Diako est un annuaire et un réseau social consacrés au voyage et au
        tourisme à Madagascar. Diako met en relation des voyageurs et des
        professionnels (hôtels, restaurants, agences de voyage, guides).
      </p>
      <p>
        <strong>Diako ne vend pas de séjours</strong>, n'encaisse aucun paiement
        pour le compte des établissements et n'est pas partie au contrat que vous
        concluez avec eux. Les tarifs, menus et disponibilités sont publiés par
        les établissements ou collectés depuis des sources publiques : ils sont
        indicatifs et peuvent avoir changé.
      </p>

      <h2>2. Votre compte</h2>
      <ul>
        <li>Vous devez avoir 16 ans ou plus, ou l'accord de vos parents.</li>
        <li>Les informations que vous donnez doivent être exactes.</li>
        <li>
          Vous êtes responsable de votre mot de passe et de ce qui est publié
          depuis votre compte.
        </li>
        <li>
          Vous pouvez supprimer votre compte à tout moment. La suppression efface
          également vos publications.
        </li>
      </ul>

      <h2>3. Ce que vous publiez</h2>
      <p>
        Vous restez propriétaire de vos textes et de vos photos. En les publiant,
        vous autorisez Diako à les afficher sur le site.
      </p>
      <p>Il est interdit de publier :</p>
      <ul>
        <li>des photos dont vous ne détenez pas les droits ;</li>
        <li>des propos injurieux, haineux, ou visant une personne nommément ;</li>
        <li>de faux avis, qu'ils soient élogieux ou dénigrants ;</li>
        <li>une fiche d'établissement dont vous n'êtes ni le gérant ni mandaté ;</li>
        <li>des données personnelles d'autrui sans son accord.</li>
      </ul>

      <h2>4. Les avis</h2>
      <p>
        Un avis doit refléter une expérience réelle et personnelle. Un même
        établissement ne peut recevoir qu'un avis par personne. Les
        établissements peuvent répondre publiquement. Diako peut masquer un avis
        manifestement faux ou injurieux.
      </p>

      <h2>5. Modération</h2>
      <p>
        Tout contenu peut être signalé. Un contenu signalé par plusieurs
        personnes est automatiquement masqué le temps d'être examiné. En cas de
        manquement répété, le compte peut être suspendu.
      </p>

      <h2>6. Responsabilité</h2>
      <p>
        Diako s'efforce de fournir des informations exactes mais ne garantit ni
        l'exactitude des tarifs, ni la disponibilité, ni la qualité des
        prestations des établissements référencés. Tout litige relatif à un
        séjour, un repas ou un circuit se règle entre vous et le professionnel
        concerné.
      </p>

      <h2>7. Évolution</h2>
      <p>
        Diako est en construction : des fonctionnalités apparaissent, changent ou
        disparaissent. Ces conditions peuvent être modifiées ; la date ci-dessous
        fait foi.
      </p>

      <h2>8. Contact</h2>
      <p>
        Pour toute question ou réclamation :{" "}
        <a href="mailto:contact.fonenako@gmail.com">contact.fonenako@gmail.com</a>.
      </p>

      
    </PageLegale>
  );
}
