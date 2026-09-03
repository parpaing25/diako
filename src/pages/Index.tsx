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
            {/* 🔴 CE MESSAGE DISAIT LE CONTRAIRE DE LA VÉRITÉ. Il annonçait
                   « le filtrage par catégorie fonctionnera dès que les
                   établissements seront référencés » — écrit quand l'annuaire
                   était vide, jamais relu depuis l'import de 3 254 fiches. Les
                   pastilles mènent maintenant à une vraie liste, et cet encart
                   ne sert plus que de repli si l'on revient ici avec un état
                   de catégorie posé. */}
            <p className="mt-2 text-sm text-muted-foreground">
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
        {/* ⭐ MOINS DE TEXTE (03/09/2026, décision d'Andry : « moins d'écriture,
            pour ne pas trop remplir les yeux »). Les trois entrées du
            référentiel gardent un titre et une ligne : c'est un menu, pas un
            argumentaire. Les raisons vivent sur leurs pages. */}
        <section className="mt-10" aria-labelledby="titre-savoir">
          <h2 id="titre-savoir" className="text-lg font-semibold">
            Préparer le voyage
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Link
              to="/quand-partir"
              className="dk-carte dk-reveal rounded-2xl border border-primary/25 bg-primary/[0.05] px-4 py-3"
            >
              <p className="font-bold leading-tight">Quand partir</p>
              <p className="dk-secondaire mt-1">Cinq destinations, mois par mois.</p>
            </Link>
            <Link
              to="/y-aller"
              className="dk-carte dk-reveal rounded-2xl border border-border bg-card px-4 py-3"
            >
              <p className="font-bold leading-tight">Y aller</p>
              <p className="dk-secondaire mt-1">42 trajets chronométrés sur le terrain.</p>
            </Link>
            <Link
              to="/plats"
              className="dk-carte dk-reveal rounded-2xl border border-accent-strong/25 bg-accent/[0.06] px-4 py-3"
            >
              <p className="font-bold leading-tight">Atlas des plats</p>
              <p className="dk-secondaire mt-1">95 plats, et où les manger.</p>
            </Link>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="titre-etabs">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 id="titre-etabs" className="text-lg font-semibold">
                Hôtels, restaurants et agences
              </h2>
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
        {/* ⚠ Replié, pas retiré : le texte reste dans la page (Google le lit, et le
            squelette statique de index.html le porte aussi). Un visiteur qui
            veut savoir qui édite le site l'ouvre d'un clic. */}
        <details className="mt-10 max-w-[68ch]" aria-labelledby="titre-apropos">
          <summary
            id="titre-apropos"
            className="cursor-pointer text-lg font-semibold [&::-webkit-details-marker]:hidden"
          >
            À propos de Diako
          </summary>
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
        </details>
      </div>
    </div>
  );
}
