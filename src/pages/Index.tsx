import { Link, useNavigate } from "react-router-dom";
import { CalendarClock, MapPin, Utensils } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserData } from "@/contexts/UserDataContext";
import { SearchBar } from "@/components/SearchBar";
import { FEUILLE_DE_ROUTE } from "@/lib/nav";

/**
 * Accueil.
 *
 * La recherche est AU CENTRE, en grand : c'est la promesse n°1 du produit
 * (« chercher un hôtel à Ampefy », « où manger du ravitoto »). Elle était
 * reléguée dans l'en-tête sur 36 px de haut.
 *
 * Les trois exemples ne sont pas du décor : ce sont de vrais boutons qui
 * remplissent la barre et lancent réellement la recherche.
 */
const EXEMPLES = [
  { icone: MapPin, texte: "un hôtel à Ampefy" },
  { icone: Utensils, texte: "où manger du ravitoto" },
  { icone: CalendarClock, texte: "quand partir à Sainte-Marie" },
];

export default function Index() {
  const { user } = useAuth();
  const { profile } = useUserData();
  const navigate = useNavigate();

  return (
    <div className="px-4 py-6">
      {/* ── Bandeau : le produit expliqué en 5 secondes ─────────────────── */}
      <section className="rounded-3xl bg-secondary px-5 py-10 md:px-10 md:py-14">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          {profile?.display_name ? `Diako · bonjour ${profile.display_name}` : "Diako"}
        </p>
        {/* Le nom de l'application DOIT figurer dans le titre de la page
            d'accueil : Google refuse de valider l'écran de consentement OAuth
            si le nom déclaré ne se retrouve pas tel quel sur le site. */}
        <h1 className="mt-1 text-3xl font-semibold leading-tight md:text-[2.75rem] md:leading-[1.1]">
          Diako — où dormir, où manger, avec qui partir à Madagascar
        </h1>
        <p className="mt-3 max-w-prose text-base text-foreground/75 md:text-lg">
          Les hôtels, les restaurants et les agences de voyage du pays, avec
          leurs vrais tarifs, leurs menus et leurs circuits.
        </p>

        <SearchBar taille="hero" className="mt-6 max-w-2xl" />

        <div className="mt-4 flex flex-wrap gap-2">
          {EXEMPLES.map(({ icone: Icone, texte }) => (
            <button
              key={texte}
              type="button"
              onClick={() => navigate(`/recherche?q=${encodeURIComponent(texte)}`)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-sm hover:bg-muted"
            >
              <Icone className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              {texte}
            </button>
          ))}
        </div>

        {!user && (
          <p className="mt-6 text-sm text-muted-foreground">
            <Link to="/auth" className="font-medium text-primary underline underline-offset-4">
              Créez votre compte
            </Link>{" "}
            pour être prévenu à l'ouverture.
          </p>
        )}
      </section>

      {/* ── Le fil, honnêtement vide ────────────────────────────────────── */}
      <section className="mt-10" aria-labelledby="titre-fil">
        <h2 id="titre-fil" className="text-lg font-semibold">
          Le fil des voyageurs
        </h2>
        <div className="mt-3 rounded-2xl border border-dashed border-border px-5 py-10 text-center">
          <p className="font-medium">Personne n'a encore publié.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Le fil s'ouvrira quand les premiers récits de voyage, photos et bons
            plans arriveront. Vous pourrez y taguer un lieu, un établissement et
            un plat — c'est ce qui fera remonter les bonnes adresses.
          </p>
        </div>
      </section>

      {/* ── À propos : exigé par Google pour valider l'écran de consentement
             OAuth (« votre page d'accueil n'explique pas l'objectif de votre
             application »). C'est aussi, tout simplement, ce qu'un visiteur
             qui arrive pour la première fois a besoin de lire. ───────────── */}
      <section className="mt-10" aria-labelledby="titre-apropos">
        <h2 id="titre-apropos" className="text-lg font-semibold">
          À propos de Diako
        </h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            <strong className="text-foreground">Diako</strong> est un annuaire et
            un réseau social consacrés au voyage et au tourisme à Madagascar. Le
            site réunit les hôtels, les restaurants et les agences de voyage du
            pays, avec leurs tarifs, leurs menus et leurs circuits, afin que
            chacun puisse trouver où dormir, où manger et avec qui partir.
          </p>
          <p>
            Les voyageurs y cherchent une adresse par destination ou par plat,
            consultent les pages des établissements et partagent leurs récits de
            voyage. Les professionnels y publient leur page, tiennent leurs
            tarifs à jour et reçoivent les demandes des voyageurs.
          </p>
          <p>
            <strong className="text-foreground">Créer un compte</strong> — par
            adresse e-mail ou avec Google — permet de publier, d'enregistrer ses
            adresses favorites et de contacter les établissements. Diako
            n'utilise votre compte Google que pour connaître votre nom, votre
            adresse e-mail et votre photo de profil ; aucune autre donnée n'est
            demandée et rien n'est publié en votre nom.
          </p>
          <p>
            Diako est édité depuis Antananarivo. Le site ne vend pas de séjours
            et n'encaisse aucun paiement : il met en relation, rien de plus.{" "}
            <Link to="/cgu" className="underline underline-offset-4 hover:text-foreground">
              Conditions d'utilisation
            </Link>{" "}
            ·{" "}
            <Link
              to="/confidentialite"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Confidentialité
            </Link>
          </p>
        </div>
      </section>

      {/* ── Avancement réel du produit ──────────────────────────────────── */}
      <section className="mt-10 xl:hidden" aria-labelledby="titre-route">
        <h2 id="titre-route" className="text-lg font-semibold">
          Ce qui arrive sur Diako
        </h2>
        <ul className="mt-3 space-y-2">
          {FEUILLE_DE_ROUTE.map(({ quoi, etat }) => (
            <li key={quoi} className="flex items-start gap-2 text-sm">
              <span
                className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  etat === "ouvert"
                    ? "bg-primary/10 text-primary"
                    : etat === "en cours"
                      ? "bg-accent/10 text-accent"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {etat}
              </span>
              <span className="text-muted-foreground">{quoi}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
