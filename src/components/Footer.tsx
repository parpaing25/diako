import { Link } from "react-router-dom";
import { NAV_COMPLET } from "@/lib/nav";

const ANNEE = 2026;

/**
 * Pied de page — du contenu 100 % réel, qui remplit le bas de l'écran sans
 * fabriquer la moindre donnée.
 *
 * Il porte aussi une mention juridique qui n'est pas décorative : Diako est un
 * annuaire et un réseau social, pas un vendeur de voyages. Le site ne garantit
 * ni les prix affichés ni les prestations.
 */
export function Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-secondary/40">
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
          <ul className="mt-3 space-y-2 text-sm">
            {NAV_COMPLET.slice(0, 6).map(({ to, label, pret }) => (
              <li key={to}>
                <Link to={to} className="text-muted-foreground hover:text-foreground">
                  {label}
                  {!pret && <span className="ml-2 text-xs">· bientôt</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold">Contact et informations</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a
                href="mailto:contact.fonenako@gmail.com"
                className="text-muted-foreground hover:text-foreground"
              >
                Nous écrire
              </a>
            </li>
            <li>
              <Link to="/mentions" className="text-muted-foreground hover:text-foreground">
                Mentions légales
              </Link>
            </li>
            <li>
              <Link
                to="/confidentialite"
                className="text-muted-foreground hover:text-foreground"
              >
                Confidentialité
              </Link>
            </li>
            <li>
              <Link to="/cgu" className="text-muted-foreground hover:text-foreground">
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
