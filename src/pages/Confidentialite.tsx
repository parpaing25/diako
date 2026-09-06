import { Link } from "react-router-dom";
import { useSEO } from "@/hooks/useSEO";
import { PageLegale } from "@/components/PageLegale";

/**
 * /confidentialite — ce que Diako conserve, pourquoi, combien de temps, et
 * vos droits. Écrit pour être lu, pas pour être long : une section par
 * question qu'un lecteur se pose vraiment (RGPD art. 13 et loi malgache
 * n° 2014-038). Rien ici n'est théorique : chaque donnée citée existe dans la
 * base, chaque durée est celle que le code applique.
 */
export default function Confidentialite() {
  useSEO({
    titre: "Confidentialité",
    description:
      "Quelles données Diako conserve, pourquoi, pendant combien de temps, avec qui elles sont partagées, et comment exercer vos droits.",
    url: "/confidentialite",
  });

  return (
    <PageLegale titre="Confidentialité" majLe="5 septembre 2026">
      <h2>Qui est responsable</h2>
      <p>
        L'éditeur de Diako (voir les <Link to="/mentions">mentions légales</Link>),
        joignable à{" "}
        <a href="mailto:contact.diako@gmail.com">contact.diako@gmail.com</a>, est
        responsable du traitement de vos données. Diako est hébergé en France et
        s'adresse à des personnes à Madagascar et ailleurs : le règlement européen
        (RGPD) et la loi malgache n° 2014-038 sur la protection des données
        personnelles s'appliquent.
      </p>

      <h2>Ce que nous conservons, et pourquoi</h2>
      {/* 🔴 DES BLOCS, PAS UN TABLEAU À QUATRE COLONNES. Mesuré le 06/09/2026 sur
          la production à 390 px : le tableau débordait de son conteneur, la
          colonne « Combien de temps » était coupée — une page légale illisible
          sur le téléphone, c'est-à-dire sur l'écran de presque tous les
          visiteurs. Chaque donnée est maintenant un bloc avec ses trois
          réponses étiquetées ; rien ne dépasse, rien ne se lit de travers. */}
      <ul className="mt-3 list-none space-y-3 pl-0 text-sm">
        <li>
          <p className="font-semibold text-foreground">Adresse e-mail, mot de passe (haché), ou identifiant Google</p>
          <dl className="mt-1.5 space-y-1">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Pourquoi</dt>
              <dd className="min-w-0 flex-1">Ouvrir et sécuriser votre compte, vous envoyer les e-mails de compte</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Base</dt>
              <dd className="min-w-0 flex-1">Exécution du service</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Durée</dt>
              <dd className="min-w-0 flex-1">Tant que le compte existe</dd>
            </div>
          </dl>
        </li>
        <li>
          <p className="font-semibold text-foreground">Nom affiché, photo de profil, type de compte (voyageur ou professionnel), métier</p>
          <dl className="mt-1.5 space-y-1">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Pourquoi</dt>
              <dd className="min-w-0 flex-1">Signer vos publications, gérer une fiche</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Base</dt>
              <dd className="min-w-0 flex-1">Exécution du service</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Durée</dt>
              <dd className="min-w-0 flex-1">Tant que le compte existe</dd>
            </div>
          </dl>
        </li>
        <li>
          <p className="font-semibold text-foreground">Récits, photos, réactions, carnet, plats goûtés, commentaires</p>
          <dl className="mt-1.5 space-y-1">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Pourquoi</dt>
              <dd className="min-w-0 flex-1">Le service lui-même : ce que vous publiez</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Base</dt>
              <dd className="min-w-0 flex-1">Exécution du service</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Durée</dt>
              <dd className="min-w-0 flex-1">Tant que le compte existe ; effacés avec lui</dd>
            </div>
          </dl>
        </li>
        <li>
          <p className="font-semibold text-foreground">Messages privés</p>
          <dl className="mt-1.5 space-y-1">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Pourquoi</dt>
              <dd className="min-w-0 flex-1">Vous mettre en relation avec un membre ou un établissement</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Base</dt>
              <dd className="min-w-0 flex-1">Exécution du service</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Durée</dt>
              <dd className="min-w-0 flex-1">Tant que le compte existe</dd>
            </div>
          </dl>
        </li>
        <li>
          <p className="font-semibold text-foreground">Pièces de revendication d'une fiche (NIF, STAT, pièce, photo du lieu)</p>
          <dl className="mt-1.5 space-y-1">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Pourquoi</dt>
              <dd className="min-w-0 flex-1">Vérifier qu'un gérant est bien responsable de l'établissement</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Base</dt>
              <dd className="min-w-0 flex-1">Intérêt légitime (éviter les usurpations)</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Durée</dt>
              <dd className="min-w-0 flex-1">Stockées dans un espace privé, jamais servies publiquement ; effacées après validation ou refus</dd>
            </div>
          </dl>
        </li>
        <li>
          <p className="font-semibold text-foreground">Position (si vous l'autorisez : « Autour de moi »)</p>
          <dl className="mt-1.5 space-y-1">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Pourquoi</dt>
              <dd className="min-w-0 flex-1">Trier les résultats par distance</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Base</dt>
              <dd className="min-w-0 flex-1">Consentement (bouton du navigateur)</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Durée</dt>
              <dd className="min-w-0 flex-1">Jamais conservée</dd>
            </div>
          </dl>
        </li>
        <li>
          <p className="font-semibold text-foreground">Pages vues (chemin de la page, identifiant de session temporaire, page d'origine)</p>
          <dl className="mt-1.5 space-y-1">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Pourquoi</dt>
              <dd className="min-w-0 flex-1">Savoir ce qui est consulté, sans savoir par qui</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Base</dt>
              <dd className="min-w-0 flex-1">Intérêt légitime (mesure d'audience sans cookie)</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Durée</dt>
              <dd className="min-w-0 flex-1">12 mois, sans lien avec votre compte</dd>
            </div>
          </dl>
        </li>
        <li>
          <p className="font-semibold text-foreground">Erreurs techniques (message, page, modèle de navigateur, type de réseau)</p>
          <dl className="mt-1.5 space-y-1">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Pourquoi</dt>
              <dd className="min-w-0 flex-1">Réparer ce qui casse</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Base</dt>
              <dd className="min-w-0 flex-1">Intérêt légitime</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Durée</dt>
              <dd className="min-w-0 flex-1">90 jours</dd>
            </div>
          </dl>
        </li>
        <li>
          <p className="font-semibold text-foreground">Questions posées à l'assistant Diako</p>
          <dl className="mt-1.5 space-y-1">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Pourquoi</dt>
              <dd className="min-w-0 flex-1">Répondre, et améliorer les réponses</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Base</dt>
              <dd className="min-w-0 flex-1">Exécution du service</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Durée</dt>
              <dd className="min-w-0 flex-1">La question est transmise au modèle de langage sans votre identité ; elle n'est pas conservée avec votre compte</dd>
            </div>
          </dl>
        </li>
      </ul>

      <h2>Cookies et traceurs</h2>
      <p>
        Diako n'utilise <strong>aucun cookie publicitaire ni traceur tiers</strong>.
        Le seul stockage sur votre appareil sert au fonctionnement : votre
        session de connexion, vos préférences d'affichage (mode sombre, invite
        d'installation) et les pages gardées pour le mode hors ligne. C'est
        pourquoi il n'y a pas de bannière à accepter.
      </p>

      <h2>Avec qui vos données sont partagées</h2>
      <ul>
        <li>
          <strong>Supabase</strong> (base de données et comptes), infrastructure
          à Paris, France — sous-traitant.
        </li>
        <li>
          <strong>o2switch</strong> (hébergement du site et des photos),
          Clermont-Ferrand, France — sous-traitant.
        </li>
        <li>
          <strong>Google</strong>, uniquement si vous choisissez « Continuer avec
          Google » pour vous connecter.
        </li>
        <li>
          <strong>Fournisseurs de modèles de langage</strong> (Groq, Google
          Gemini) pour l'assistant Diako : ils reçoivent le texte de votre
          question, jamais votre identité.
        </li>
        <li>
          <strong>Les établissements</strong> : quand vous cliquez « Demander »,
          c'est vous qui leur écrivez, depuis WhatsApp ou votre téléphone. Diako
          ne leur transmet rien.
        </li>
      </ul>
      <p>Diako ne vend ni ne loue aucune donnée.</p>

      <h2>Ce qui est public</h2>
      <p>
        Vos récits, photos, réactions publiques et votre nom d'affichage sont
        visibles de tous. Votre profil est visible sur Diako mais nous demandons
        aux moteurs de recherche de ne pas l'indexer. Votre adresse e-mail et
        vos messages ne sont jamais publics.
      </p>

      <h2>Vos droits</h2>
      <p>
        Vous pouvez à tout moment, depuis <Link to="/parametres">Paramètres</Link> :
        <strong> télécharger</strong> toutes vos données (fichier JSON),{" "}
        <strong>modifier</strong> votre profil, <strong>supprimer</strong> votre
        compte — la suppression est immédiate et définitive : récits, photos,
        commentaires et messages sont effacés ; les sauvegardes techniques sont
        purgées sous 30 jours.
      </p>
      <p>
        Pour toute autre demande (rectification, opposition, limitation,
        question), écrivez à{" "}
        <a href="mailto:contact.diako@gmail.com">contact.diako@gmail.com</a> ;
        nous répondons sous un mois. Vous pouvez aussi saisir la Commission
        malgache de l'informatique et des libertés (CMIL) ou, depuis l'Union
        européenne, la CNIL.
      </p>

      <h2>Sécurité</h2>
      <p>
        Connexion chiffrée (HTTPS) partout ; mots de passe hachés, jamais
        lisibles ; accès aux données filtré ligne par ligne selon votre compte ;
        pièces de revendication dans un espace privé à accès temporaire.
        Signalez toute faille à l'adresse ci-dessus : nous répondons sous
        48 heures.
      </p>

      <h2>Mineurs</h2>
      <p>Diako s'adresse aux personnes de 16 ans et plus.</p>

      <h2>Modifications</h2>
      <p>
        Cette page indique sa date de mise à jour. Un changement important vous
        est signalé à la connexion.
      </p>
    </PageLegale>
  );
}
