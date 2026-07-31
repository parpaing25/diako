import { Link } from "react-router-dom";
import { Hammer } from "lucide-react";

/**
 * Écran d'attente honnête pour les routes déjà présentes dans la navigation
 * mais dont le lot n'est pas encore livré. On préfère dire clairement « pas
 * encore » plutôt qu'afficher un décor qui ne fait rien — c'était le défaut
 * central du Diako précédent.
 */
export default function Bientot({ titre, lot }: { titre: string; lot: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-secondary">
        <Hammer className="h-6 w-6 text-primary" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold">{titre}</h1>
      <p className="mt-2 text-muted-foreground">
        Cet écran arrive au <strong>{lot}</strong>. Le socle est en place, la
        fonctionnalité n'est pas encore branchée.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
      >
        Revenir à l'accueil
      </Link>
    </div>
  );
}
