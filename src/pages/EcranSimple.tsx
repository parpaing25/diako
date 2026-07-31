import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Écran générique pour Favoris, Messages et Notifications.
 *
 * Ces trois pages ont exactement la même situation : la fonctionnalité est
 * prête côté conception mais n'a aucune donnée. Plutôt qu'un « Bientôt »
 * générique, chacune dit ce qu'elle contiendra, et propose la seule action
 * réellement disponible aujourd'hui.
 */
export default function EcranSimple({
  titre,
  icone: Icone,
  vide,
  detail,
}: {
  titre: string;
  icone: LucideIcon;
  vide: string;
  detail: string;
}) {
  useDocumentTitle(titre);
  const { user } = useAuth();

  return (
    <div className="px-4 py-5">
      <h1 className="text-2xl font-semibold">{titre}</h1>

      <div className="mt-6 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
          <Icone className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <p className="mt-4 font-medium">{vide}</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{detail}</p>

        <Link
          to={user ? "/" : "/auth"}
          className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          {user ? "Retour au fil" : "Créer mon compte"}
        </Link>
      </div>
    </div>
  );
}
