import { Link, NavLink } from "react-router-dom";
import { NAV_COMPLET } from "@/lib/nav";
import { prechargerRoute } from "@/lib/prechargerRoute";
import { cn } from "@/lib/utils";

/**
 * Rail de navigation desktop (≥ 1024 px).
 *
 * Corrige un défaut bloquant : la barre du bas étant masquée au-delà de 768 px
 * et l'en-tête ne contenant aucun lien, il n'existait AUCUNE navigation à la
 * souris. La pastille « bientôt » dit la vérité AVANT le clic.
 */
export function SideNav() {
  return (
    <nav
      aria-label="Sections du site"
      /* ⚠ ENTRE EN `xl`, PAS EN `lg` — et 256 px fixes (gabarit v4). En dessous
         de 1280, la place va au contenu et la navigation reste la barre du bas,
         qui bascule au MEME seuil : les deux ne doivent jamais disparaître
         ensemble, sinon la fenêtre 1024–1280 n'a plus aucune navigation. */
      className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r border-border px-2 py-4 xl:block"
    >
      <ul className="space-y-0.5">
        {NAV_COMPLET.map(({ to, label, icon: Icon, pret }) => (
          <li key={to}>
            <NavLink
              to={to}
              // Le code de la page part AU TOUCHER, pas au clic : sur o2switch,
              // l\'etablissement de connexion coute deja ~800 ms.
              onPointerDown={() => prechargerRoute(to)}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition",
                  isActive
                    ? "bg-secondary font-medium text-primary"
                    : "text-foreground hover:bg-muted"
                )
              }
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="truncate">{label}</span>
              {!pret && (
                <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                  bientôt
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      {/* ── LE PROJET DE VOYAGE, AU BAS DU RAIL (écran D1) ────────────────
          ⚠ POURQUOI IL EST ICI ET PAS DANS LA LISTE. C'est le seul endroit du
            produit où l'offre vient au voyageur au lieu de l'inverse — et
            c'est ce qui fonctionne le mieux quand l'annuaire est encore mince :
            on ne demande pas de comparer 54 fiches, on demande de décrire un
            voyage une fois. Une ligne de menu parmi seize l'aurait noyé. */}
      <Link
        to="/projet"
        onPointerDown={() => prechargerRoute("/projet")}
        className="mt-4 block rounded-2xl border border-border bg-card p-4 transition hover:border-primary"
      >
        <p className="dk-etiquette">Mon projet de voyage</p>
        <p className="dk-secondaire mt-1.5 leading-relaxed">
          Décrivez-le une fois, les agences et les hôtels répondent.
        </p>
        <span className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-input text-sm font-semibold">
          Commencer
        </span>
      </Link>
    </nav>
  );
}
