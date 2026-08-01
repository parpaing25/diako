import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { DiakoHero } from "@/components/DiakoHero";
import { Composer } from "@/components/Composer";
import { Feed } from "@/components/Feed";
import { FicheCard } from "@/components/FicheCard";
import { useEstMobile } from "@/hooks/useEstMobile";
import { categorie as trouveCategorie } from "@/lib/categories";
import { chercherPages, type ResultatPage } from "@/lib/etablissements";

/**
 * Accueil.
 *
 *  · TÉLÉPHONE : le fil occupe TOUT l'écran, sans rien autour. On glisse vers
 *    le haut d'une publication à l'autre. Un bandeau et des catégories
 *    disparaîtraient de toute façon derrière la première photo.
 *  · ORDINATEUR : bandeau, recherche, catégories, puis le fil façon Facebook.
 */
export default function Index() {
  const mobile = useEstMobile();
  const [cat, setCat] = useState("all");
  const info = trouveCategorie(cat);

  // ⚠ Cette section affichait quatre établissements INVENTÉS, avec leurs
  // notes, leur nombre d'avis et un badge « ✓ vérifié » que rien ne
  // distinguait d'une vraie fiche — et l'accueil était le seul écran à le
  // faire sans avertissement. Elle lit désormais la base : s'il n'y a rien,
  // elle le dit.
  const [etabs, setEtabs] = useState<ResultatPage[]>([]);
  useEffect(() => {
    if (mobile) return;
    void chercherPages({ limite: 6 }).then(setEtabs).catch(() => undefined);
  }, [mobile]);

  if (mobile) return <Feed />;

  return (
    <div className="pb-6">
      <DiakoHero categorie={cat} onCategorie={setCat} />

      <div className="dk-colonne mt-5 px-4">
        {cat !== "all" && info && (
          <div className="mb-4 rounded-xl border border-border bg-card p-4">
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

        <Composer />

        <div className="mt-4">
          <Feed />
        </div>

        <section className="mt-10" aria-labelledby="titre-etabs">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 id="titre-etabs" className="text-lg font-semibold">
                Hôtels, restaurants et agences
              </h2>
              <p className="text-sm text-muted-foreground">
                Chaque établissement a sa page, ses tarifs et sa carte.
              </p>
            </div>
            <Link
              to="/explorer"
              className="hidden shrink-0 items-center gap-1 text-sm font-medium text-primary sm:flex"
            >
              Explorer <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          {etabs.length > 0 ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {etabs.map((e) => (
                <FicheCard key={e.id} fiche={e} />
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-dashed border-border px-5 py-10 text-center">
              <p className="font-medium">Aucun établissement référencé pour l'instant</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Les hôtels, restaurants et agences apparaîtront ici dès qu'ils
                créeront leur page — avec leurs vrais tarifs et leur vraie carte.
              </p>
              <Link
                to="/pro"
                className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
              >
                Inscrire mon établissement
              </Link>
            </div>
          )}
        </section>

        {/* ⚠ NE PAS SUPPRIMER : Google exige que la page d'accueil nomme
            l'application et explique son objectif pour valider l'écran de
            consentement OAuth. À garder cohérent avec le squelette statique. */}
        <section className="mt-10" aria-labelledby="titre-apropos">
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
      </div>
    </div>
  );
}
