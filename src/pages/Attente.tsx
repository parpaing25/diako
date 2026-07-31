import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

/**
 * Écran d'attente — honnête, spécifique, et jamais un cul-de-sac.
 *
 * Trois règles tirées de ce qui n'allait pas :
 *  1. On REPREND la requête tapée. Avant, on cherchait « hôtel Ampefy » et on
 *     obtenait une icône marteau, le terme jeté.
 *  2. Aucun jargon interne. « Lot 3 » et « docs/TDR-DIAKO.md » ne veulent rien
 *     dire pour un visiteur.
 *  3. Toujours une action RÉELLE : créer un compte est la seule chose qui
 *     fonctionne à 100 % aujourd'hui, c'est donc la sortie proposée.
 */
export default function Attente({
  titre,
  promesse,
  icone: Icone,
}: {
  titre: string;
  promesse: string;
  icone: LucideIcon;
}) {
  const [params] = useSearchParams();
  const q = params.get("q")?.trim();
  useDocumentTitle(q ? `« ${q} »` : titre);

  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
        <Icone className="h-6 w-6 text-primary" aria-hidden="true" />
      </div>

      {q ? (
        <>
          <h1 className="mt-6 text-2xl font-semibold">« {q} »</h1>
          <p className="mt-3 text-muted-foreground">
            Nous avons bien votre recherche, mais nous ne pouvons pas encore y
            répondre : les pages des hôtels, restaurants et agences ne sont pas
            encore ouvertes.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-2xl font-semibold">{titre}</h1>
          <p className="mt-3 text-muted-foreground">{promesse}</p>
        </>
      )}

      <p className="mt-4 text-sm text-muted-foreground">
        Diako se construit en ce moment. Créez votre compte : vous serez prévenu
        dès l'ouverture, et votre place sera déjà là.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/auth"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          Créer mon compte <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-full border border-input px-6 font-medium"
        >
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}
