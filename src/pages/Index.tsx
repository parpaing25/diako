import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { DiakoHero } from "@/components/DiakoHero";
import { Composer } from "@/components/Composer";
import { PostCard } from "@/components/PostCard";
import { PlaceCard } from "@/components/PlaceCard";
import { BandeauApercu } from "@/components/BandeauApercu";
import { categorie as trouveCategorie } from "@/lib/categories";
import { PLACES, POSTS } from "@/data/apercu";

/**
 * Accueil — le fil.
 *
 * Un SEUL flux pleine largeur, comme demandé : « un fil infini comme Facebook,
 * pas des petites cartes ». Les publications visibles sont un aperçu du design,
 * annoncé comme tel par le bandeau — jamais présenté comme du contenu réel.
 */
export default function Index() {
  const [cat, setCat] = useState("all");
  const info = trouveCategorie(cat);

  return (
    <div className="pb-6">
      <DiakoHero categorie={cat} onCategorie={setCat} />

      <div className="mt-5 px-0 md:px-4">
        {cat !== "all" && info && (
          <div className="mx-4 mb-4 rounded-xl border border-border bg-card p-4 md:mx-0">
            <p className="text-sm font-semibold">{info.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{info.quoi}.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Le filtrage par catégorie fonctionnera dès que les établissements
              seront référencés.{" "}
              <button
                onClick={() => setCat("all")}
                className="font-medium text-primary underline underline-offset-4"
              >
                Revenir à tout
              </button>
            </p>
          </div>
        )}

        <div className="mx-4 md:mx-0">
          <BandeauApercu quoi="Voici à quoi ressemblera le fil quand les voyageurs et les établissements publieront." />
        </div>

        <div className="space-y-0 md:space-y-4">
          <Composer />
          {POSTS.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>

        {/* Établissements — format compact, deux formats assumés */}
        <section className="mt-8 px-4 md:px-0" aria-labelledby="titre-etabs">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 id="titre-etabs" className="text-lg font-semibold">
                Hôtels, restaurants et agences
              </h2>
              <p className="text-sm text-muted-foreground">
                Chaque établissement aura sa page, ses tarifs et son menu.
              </p>
            </div>
            <Link
              to="/explorer"
              className="hidden shrink-0 items-center gap-1 text-sm font-medium text-primary sm:flex"
            >
              Explorer <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {PLACES.map((p) => (
              <PlaceCard key={p.slug} place={p} />
            ))}
          </div>
        </section>

        {/* ── À propos ──────────────────────────────────────────────────
             ⚠ NE PAS SUPPRIMER : Google exige que la page d'accueil nomme
             l'application et explique son objectif pour valider l'écran de
             consentement OAuth. Ce texte doit rester cohérent avec celui du
             squelette statique de index.html. */}
        <section className="mt-10 px-4 md:px-0" aria-labelledby="titre-apropos">
          <h2 id="titre-apropos" className="text-lg font-semibold">
            À propos de Diako
          </h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              <strong className="text-foreground">Diako</strong> est un annuaire
              et un réseau social consacrés au voyage et au tourisme à
              Madagascar. Le site réunit les hôtels, les restaurants et les
              agences de voyage du pays, avec leurs tarifs, leurs menus et leurs
              circuits, afin que chacun puisse trouver où dormir, où manger et
              avec qui partir.
            </p>
            <p>
              <strong className="text-foreground">Créer un compte</strong> — par
              adresse e-mail ou avec Google — permet de publier, d'enregistrer
              ses adresses favorites et de contacter les établissements. Diako
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
              <Link to="/confidentialite" className="underline underline-offset-4 hover:text-foreground">
                Confidentialité
              </Link>
            </p>
          </div>
        </section>

        {/* Fin du fil — état honnête */}
        <div className="mt-8 px-4 text-center md:px-0">
          <p className="text-sm font-medium">C'est tout pour le moment.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Le fil s'ouvrira aux vraies publications quand les premières
            destinations et les premiers établissements seront en ligne.
          </p>
          <Link
            to="/auth"
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
          >
            Créer mon compte
          </Link>
        </div>
      </div>
    </div>
  );
}
