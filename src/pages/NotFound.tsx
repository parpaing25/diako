import { Link } from "react-router-dom";
import { useSEO } from "@/hooks/useSEO";

export default function NotFound() {
  /* ⚠ `noindex` : sur cet hébergement une route inconnue rend HTTP 200 avec
     cette page (repli SPA). Sans lui, Google indexait « Cette page n'existe
     pas » comme une vraie page (soft 404). Audit du 05/09/2026. */
  useSEO({ titre: "Page introuvable", noindex: true });
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center" role="alert">
      <p className="text-5xl font-bold text-primary">404</p>
      <h1 className="mt-4 text-2xl font-semibold">Cette page n'existe pas</h1>
      <p className="mt-2 text-muted-foreground">
        Le lien est peut-être erroné, ou la page a été déplacée.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
      >
        Retour à l'accueil
      </Link>
    </div>
  );
}
