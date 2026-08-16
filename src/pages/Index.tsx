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

      {/* ⚠ PLUS DE `dk-colonne` ICI. L'accueil était bridé à 620 px : c'est de
          là que venait l'essentiel des 628 px de vide mesurés à 1920. La
          colonne de lecture reste en vigueur là où on LIT vraiment — un récit
          ouvert, une page légale — mais un fil d'aperçus coupés à trois lignes
          n'est pas de la lecture longue. Ici, on remplit. */}
      <div className="mt-5 px-4">
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

        {/* ── CE QUE DIAKO SAIT DEJA ────────────────────────────────────────
            ⚠ POURQUOI CE BLOC EXISTE. Le site venait de gagner deux pages qui
              portent sa seule matiere abondante — la saisonnalite avec ses
              raisons, les temps de route reels — et l'accueil ne menait a
              AUCUNE des deux. Un visiteur arrivait sur un fil de 28 recits et
              repartait sans avoir vu ce qui distingue reellement ce site.
            🔴 CES CHIFFRES ONT DEJA MENTI UNE FOIS. Ils annonçaient « 178
              lieux » et « 41 acces » — recopies a la main a l'epoque, jamais
              revus depuis l'import : le referentiel en porte 508 et 42.
              Recomptes le 17/08/2026 par requete : 508 destinations, 95 plats,
              254 orthographes, 42 acces releves, 5 saisonnalites sur 12 mois.
              Ceux qui bougent souvent passent par `useStats()` ; ceux ecrits
              ici sont stables. Aucun n'est arrondi vers le haut. */}
        <section className="mt-10" aria-labelledby="titre-savoir">
          <h2 id="titre-savoir" className="text-lg font-semibold">
            Ce que Diako sait déjà
          </h2>
          <p className="text-sm text-muted-foreground">
            Le référentiel du pays, saisi lieu par lieu. C'est ce qu'on ne
            trouve nulle part ailleurs.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 large:grid-cols-3">
            <Link
              to="/quand-partir"
              className="dk-carte dk-reveal rounded-2xl border border-primary/25 bg-primary/[0.05] p-4"
            >
              <p className="dk-etiquette text-primary">Quand partir où</p>
              <p className="mt-1.5 font-bold leading-tight">
                Cinq destinations, douze mois, et la raison
              </p>
              <p className="dk-secondaire mt-1.5 leading-relaxed">
                Savoir qu'un mois est déconseillé ne sert à rien si on ignore
                que ce sont les pistes qui sont coupées — ou les baleines qu'on
                va rater.
              </p>
            </Link>

            <Link
              to="/y-aller"
              className="dk-carte dk-reveal rounded-2xl border border-border bg-card p-4"
            >
              <p className="dk-etiquette">Y aller</p>
              <p className="mt-1.5 font-bold leading-tight">
                46 km/h sur goudron, pas 90
              </p>
              <p className="dk-secondaire mt-1.5 leading-relaxed">
                42 trajets chronométrés sur le terrain. Divisez vos kilomètres
                par ces chiffres-là, et vous arriverez avant la nuit.
              </p>
            </Link>

            <Link
              to="/plats"
              className="dk-carte dk-reveal rounded-2xl border border-accent-strong/25 bg-accent/[0.06] p-4"
            >
              <p className="dk-etiquette text-accent-strong">Atlas des plats</p>
              <p className="mt-1.5 font-bold leading-tight">
                95 plats, 254 façons de les écrire
              </p>
              <p className="dk-secondaire mt-1.5 leading-relaxed">
                C'est ce référentiel qui fait que «&nbsp;ravi-toto&nbsp;» trouve
                ce que les cartes appellent autrement.
              </p>
            </Link>
          </div>
        </section>

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
            /* Meme rythme que le fil. ⚠ Trois colonnes au maximum et pas
               quatre : ces cartes portent un prix avec son unite et sa base,
               qui se casse en dessous de ~320 px. */
            <div className="mt-3 grid gap-4 sm:grid-cols-2 large:grid-cols-3">
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
        {/* ⚠ CELUI-LA reste borne : c'est du texte suivi, et une ligne de
            1242 px est illisible. La regle « on n'elargit pas le texte » ne
            disparait pas avec l'elargissement de la coque — elle s'applique
            juste la ou on lit, et plus la ou on parcourt. */}
        <section className="mt-10 max-w-[68ch]" aria-labelledby="titre-apropos">
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
