import { Link } from "react-router-dom";
import { NAV_COMPLET } from "@/lib/nav";

const ANNEE = 2026;

/**
 * ⚠ LES LIENS DU PIED FONT 44 PX DE HAUT. Ils en faisaient ~20 : la ligne de
 *   texte seule. Au pouce, « Mentions légales » et « Confidentialité » se
 *   touchaient l'un pour l'autre.
 */
const LIEN = "inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground";

/**
 * 🔴 SEULEMENT LES ÉCRANS PRÊTS. Le pied affichait « Circuits · bientôt » :
 *    un lien vers un écran qui ne peut rien montrer (0 circuit publié). La
 *    règle du dépôt l'interdit — une entrée de navigation vers un écran non
 *    branché coûte plus cher en confiance que son absence. Le drapeau `pret`
 *    de `nav.ts` fait le tri : quand la table se remplit, l'entrée revient
 *    toute seule.
 */
const LIENS_DU_SITE = NAV_COMPLET.filter((e) => e.pret).slice(0, 6);

/**
 * Pied de page — du contenu 100 % réel, qui remplit le bas de l'écran sans
 * fabriquer la moindre donnée.
 *
 * Il porte aussi une mention juridique qui n'est pas décorative : Diako est un
 * annuaire et un réseau social, pas un vendeur de voyages. Le site ne garantit
 * ni les prix affichés ni les prestations.
 *
 * 🔴 C'EST LUI QUI RÉSERVE LA PLACE DE LA BARRE DU BAS (18/09/2026). La réserve
 *    était posée sur <main> (`dk-has-bottomnav`, 64 px) : elle s'empilait avec
 *    la marge de ce pied (64 px) et le bas des pages — environ 150 px de vide
 *    avant le pied sur téléphone. Et le pied, lui, n'en avait aucune : la ligne
 *    « © » finissait SOUS la barre. Le pied est rendu sur toutes les pages qui
 *    ont la barre (App.tsx) : la réserve passe donc ici, au seul endroit où le
 *    contenu touche le bas de l'écran.
 */
export function Footer() {
  return (
    <footer className="mt-8 border-t border-border bg-secondary/40 pb-[calc(4rem+env(safe-area-inset-bottom))] xl:pb-0">
      <div className="grid w-full gap-8 px-4 py-10 md:grid-cols-3 xl:px-6 2xl:px-10">
        <div>
          <p className="text-lg font-bold text-primary">Diako</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Où dormir, où manger et avec qui partir à Madagascar.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Diako est un annuaire et un réseau social. Nous ne vendons pas de
            séjours et ne garantissons ni les tarifs affichés ni les prestations
            des établissements.
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold">Le site</h2>
          <ul className="mt-2 text-sm">
            {LIENS_DU_SITE.map(({ to, label }) => (
              <li key={to}>
                <Link to={to} className={LIEN}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold">Contact et informations</h2>
          <ul className="mt-2 text-sm">
            {/* ⚠ Plus de mailto vers la boîte de FONENAKO : le contact de Diako
                passe par /aide (dix questions + l'adresse contact.diako@gmail.com).
                Audit de lancement du 05/09/2026, constat T8. */}
            <li>
              <Link to="/aide#contact" className={LIEN}>
                Aide et contact
              </Link>
            </li>
            <li>
              <Link to="/a-propos" className={LIEN}>
                À propos de Diako
              </Link>
            </li>
            <li>
              <Link to="/mentions" className={LIEN}>
                Mentions légales
              </Link>
            </li>
            {/* ⚠ À GARDER : Google exige ces deux pages pour l'écran de
                consentement de la connexion Google. */}
            <li>
              <Link to="/confidentialite" className={LIEN}>
                Confidentialité
              </Link>
            </li>
            <li>
              <Link to="/cgu" className={LIEN}>
                Conditions d'utilisation
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <p className="w-full px-4 py-4 text-xs text-muted-foreground xl:px-6 2xl:px-10">
          © {ANNEE} Diako — Antananarivo, Madagascar.
        </p>
      </div>
    </footer>
  );
}
