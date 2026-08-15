import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookMarked, Search, Store, UtensilsCrossed } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { EmptyState, EtatErreur } from "@/components/Etats";
import { ImageProgressive } from "@/components/ImageProgressive";
import { chargerAtlas, statsAtlas, type PlatAtlas } from "@/lib/decouverte";
import { cn } from "@/lib/utils";

/**
 * L'ATLAS DES PLATS — /plats (écran D2 du design final).
 *
 * ⚠ C'EST LE DIFFÉRENCIANT DU PRODUIT, et c'est le seul écran dont la matière
 *   est ABONDANTE : 95 plats, 254 variantes d'orthographe, 9 familles. Partout
 *   ailleurs Diako compte des zéros ; ici il a de quoi remplir un grand écran
 *   sans rien inventer.
 *
 * ⚠ QUATRE COLONNES, contrairement au fil. La maquette les réserve aux cartes
 *   « sans prix ni extrait » — un plat n'a ni tarif propre ni description
 *   longue en vignette, donc 188 px à 1440 et 291 px à 1920 lui suffisent.
 *
 * ⚠ LES RÉGIMES SONT DÉRIVÉS DES INGRÉDIENTS, jamais d'une case cochée à la
 *   main. « Sans porc » se lit sur `has_pork`, calculé à l'import — sinon la
 *   promesse alimentaire dépendrait de la vigilance d'un saisisseur.
 *
 * ⚠ « 0 carte de restaurant saisie » EST AFFICHÉ EN GRAND, en corail. Ce n'est
 *   pas un aveu gênant : c'est l'appel à l'action qui remplit le produit.
 */

const FAMILLES = [
  { code: "laoka", label: "Laoka" },
  { code: "grillade", label: "Grillades" },
  { code: "soupe", label: "Soupes" },
  { code: "riz", label: "Riz" },
  { code: "mofo", label: "Mofo" },
  { code: "fruit-de-mer", label: "Fruits de mer" },
  { code: "dessert", label: "Desserts" },
  { code: "street-food", label: "Rue" },
  { code: "boisson", label: "Boissons" },
];

const REGIMES = [
  { code: "sans_porc", label: "Sans porc" },
  { code: "vegetarien", label: "Végétarien" },
  { code: "sans_arachide", label: "Sans arachide" },
  { code: "sans_fruits_de_mer", label: "Sans fruits de mer" },
];

const PAR_PALIER = 24;

export default function Plats() {
  useSEO({
    titre: "Atlas des plats malgaches — 95 plats et où les trouver",
    description:
      "Les 95 plats de Madagascar avec leurs variantes d'orthographe, leurs ingrédients, leur famille et leur région. Cherchez un plat, trouvez où en manger.",
    url: "https://diako.fonenako.mg/plats",
  });

  const [plats, setPlats] = useState<PlatAtlas[]>([]);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof statsAtlas>> | null>(null);
  const [familles, setFamilles] = useState<string[]>([]);
  const [regimes, setRegimes] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);
  const [fini, setFini] = useState(false);
  useReveal(plats.length);

  const charger = useCallback(
    async (curseur?: string | null) => {
      setChargement(true);
      setErreur(false);
      try {
        const l = await chargerAtlas({
          familles: familles.length ? familles : undefined,
          regimes: regimes.length ? regimes : undefined,
          q: q.trim() || null,
          curseur,
          limite: PAR_PALIER,
        });
        setPlats((avant) => (curseur ? [...avant, ...l] : l));
        setFini(l.length < PAR_PALIER);
      } catch {
        setErreur(true);
      } finally {
        setChargement(false);
      }
    },
    [familles, regimes, q]
  );

  /**
   * 🔴 DEFAUT CORRIGE : une requete partait a CHAQUE FRAPPE. `q` est dans les
   *    dependances de `charger`, lui-meme seule dependance de cet effet, sans
   *    aucun garde-fou. Taper « ravitoto » lancait huit requetes reseau, dont
   *    sept jetees — sur la 3G visee, elles se doublent et la derniere arrivee
   *    n'est pas forcement la derniere demandee.
   *
   * ⚠ 260 ms : c'est le seuil deja retenu par SearchBar (220 ms) arrondi au
   *   cout d'un aller-retour supplementaire. En dessous, on relance pendant que
   *   le doigt bouge encore ; au-dessus, la liste parait figee.
   *
   * ⚠ LE NETTOYAGE ANNULE LE MINUTEUR EN ATTENTE : sans lui, quitter la page
   *   pendant la frappe declencherait une requete sur un composant demonte.
   */
  useEffect(() => {
    const t = window.setTimeout(() => void charger(), 260);
    return () => window.clearTimeout(t);
  }, [charger]);

  useEffect(() => {
    void statsAtlas().then(setStats).catch(() => undefined);
  }, []);

  function basculer(liste: string[], set: (v: string[]) => void, code: string) {
    set(liste.includes(code) ? liste.filter((x) => x !== code) : [...liste, code]);
  }

  return (
    <div className="px-4 py-5 xl:flex xl:items-start xl:gap-4">
      {/* ── Rail de filtres, à gauche du contenu (D2) ────────────────────── */}
      <aside className="hidden w-60 shrink-0 space-y-3 xl:block">
        <Filtre titre="Famille">
          <ul className="space-y-1.5">
            {FAMILLES.map((f) => (
              <li key={f.code}>
                <Case
                  coche={familles.includes(f.code)}
                  onChange={() => basculer(familles, setFamilles, f.code)}
                  label={f.label}
                />
              </li>
            ))}
          </ul>
        </Filtre>

        <Filtre titre="Régime">
          <ul className="space-y-1.5">
            {REGIMES.map((r) => (
              <li key={r.code}>
                <Case
                  coche={regimes.includes(r.code)}
                  onChange={() => basculer(regimes, setRegimes, r.code)}
                  label={r.label}
                />
              </li>
            ))}
          </ul>
          <p className="dk-secondaire mt-2.5 leading-relaxed">
            Dérivé des ingrédients du référentiel, pas d'une case cochée à la main.
          </p>
        </Filtre>

        <Filtre titre="Région d'origine">
          <p className="dk-secondaire leading-relaxed">
            22 régions — les hauts plateaux et la côte ne mangent pas la même
            chose. Le filtre s'ouvrira quand les plats porteront tous leur lieu
            typique.
          </p>
        </Filtre>
      </aside>

      <div className="min-w-0 flex-1">
        <p className="dk-etiquette">Atlas culinaire</p>
        <h1 className="dk-titre mt-1">95 plats malgaches, et où les trouver</h1>
        <p className="dk-corps mt-3 max-w-[70ch] text-muted-foreground">
          Chaque plat porte ses variantes d'orthographe, ses ingrédients, sa
          famille et sa région. C'est ce référentiel qui permet à «&nbsp;ravi-toto&nbsp;»
          de trouver ce que les cartes appellent autrement.
        </p>

        {/* ── Les quatre chiffres, calculés ─────────────────────────────── */}
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Chiffre n={stats?.plats} quoi="plats" />
          <Chiffre n={stats?.variantes} quoi="variantes" />
          <Chiffre n={stats?.familles} quoi="familles" />
          {/* ⚠ Ce zéro est le plus important de l'écran : il dit ce qui manque
              au produit, et c'est lui qui doit donner envie d'agir. */}
          <Chiffre n={stats?.cartes} quoi="carte de restaurant saisie" alerte />
        </div>

        {/* Recherche + filtres repliés sous xl. */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Un plat, une variante, un ingrédient…"
              aria-label="Chercher un plat"
              className="min-h-11 w-full rounded-full border border-input bg-card pl-9 pr-4 text-[16px]"
            />
          </label>
          <div className="flex flex-wrap gap-1.5 xl:hidden">
            {FAMILLES.slice(0, 5).map((f) => (
              <button
                key={f.code}
                onClick={() => basculer(familles, setFamilles, f.code)}
                aria-pressed={familles.includes(f.code)}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-xs font-medium",
                  familles.includes(f.code)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {erreur && (
          <EtatErreur className="mt-5" onReessayer={() => void charger()} />
        )}

        {/* ── La grille, 4 colonnes au plus large ───────────────────────── */}
        {plats.length > 0 && (
          <ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {plats.map((p) => (
              <li key={p.id}>
                <CartePlat plat={p} />
              </li>
            ))}
          </ul>
        )}

        {chargement && plats.length === 0 && (
          <ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="dk-skeleton h-44 rounded-xl" />
            ))}
          </ul>
        )}

        {!chargement && plats.length === 0 && !erreur && (
          <EmptyState
            className="mt-5"
            icone={UtensilsCrossed}
            manque="Aucun plat ne correspond à ces filtres."
            action={{
              libelle: "Tout afficher",
              onClick: () => {
                setFamilles([]);
                setRegimes([]);
                setQ("");
              },
            }}
            contenuReel={
              <p className="dk-secondaire leading-relaxed">
                Le référentiel compte {stats?.plats ?? 95} plats et{" "}
                {stats?.variantes ?? 254} orthographes différentes. Retirez un
                filtre pour les parcourir.
              </p>
            }
          />
        )}

        {!fini && plats.length > 0 && (
          <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
            <p className="dk-secondaire min-w-0">
              Chargement par curseur, jamais par décalage : un plat ajouté au
              référentiel ne fait pas sauter la suite.
            </p>
            <button
              onClick={() => void charger(plats[plats.length - 1]?.slug)}
              disabled={chargement}
              className="min-h-10 shrink-0 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {chargement ? "Chargement…" : "Charger la suite"}
            </button>
          </div>
        )}
      </div>

      {/* ── Rail de droite (D2) ──────────────────────────────────────────── */}
      <aside className="mt-6 shrink-0 space-y-3 xl:mt-0 xl:w-72">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="dk-etiquette">Mon carnet de goûts</p>
          <p className="dk-secondaire mt-2 leading-relaxed">
            Marquez les plats goûtés depuis n'importe quelle fiche ou publication.
          </p>
          <Link
            to="/gouts"
            className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-semibold"
          >
            <BookMarked className="h-4 w-4" aria-hidden="true" />
            Ouvrir mon carnet
          </Link>
        </div>

        {/* ⚠ CE BLOC RESTE VIDE ET LE DIT. La maquette prévoit « recherché
            cette semaine » ; les recherches ne sont pas encore enregistrées.
            Inventer un palmarès serait exactement la faute que ce projet
            s'interdit. */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="dk-etiquette">Recherché cette semaine</p>
          <p className="dk-secondaire mt-2 leading-relaxed">
            Le palmarès s'affichera quand les recherches seront comptées. Aucune
            liste n'est inventée en attendant.
          </p>
        </div>

        <div className="rounded-2xl border border-accent-strong/30 bg-accent/[0.07] p-4">
          <p className="dk-etiquette text-accent-strong">Vous tenez un restaurant ?</p>
          <p className="dk-secondaire mt-2 leading-relaxed">
            Saisir 45 plats prend 3 minutes avec l'autocomplétion. Une photo de
            la carte papier est acceptée.
          </p>
          <Link
            to="/pro"
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent-strong px-4 text-sm font-semibold text-accent-foreground"
          >
            <Store className="h-4 w-4" aria-hidden="true" />
            Publier ma carte
          </Link>
        </div>
      </aside>
    </div>
  );
}

/* ── Pièces ────────────────────────────────────────────────────────────── */

function Filtre({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="dk-etiquette mb-2.5">{titre}</h2>
      {children}
    </section>
  );
}

function Case({
  coche,
  onChange,
  label,
}: {
  coche: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={coche}
        onChange={onChange}
        className="h-4 w-4 shrink-0 accent-[hsl(var(--accent-strong))]"
      />
      <span>{label}</span>
    </label>
  );
}

function Chiffre({ n, quoi, alerte }: { n?: number; quoi: string; alerte?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-2.5",
        alerte ? "border-accent-strong/30 bg-accent/[0.07]" : "border-border bg-card"
      )}
    >
      <p
        className={cn(
          "text-2xl font-bold leading-none tabular-nums",
          alerte ? "text-accent-strong" : "text-foreground"
        )}
      >
        {n ?? "—"}
      </p>
      <p className="dk-secondaire mt-1">{quoi}</p>
    </div>
  );
}

function CartePlat({ plat }: { plat: PlatAtlas }) {
  const regime = [
    plat.is_vegetarian && "végétarien",
    plat.has_pork && "porc",
    plat.has_seafood && "fruits de mer",
    plat.has_peanut && "arachide",
  ].filter(Boolean)[0] as string | undefined;

  return (
    <Link
      to={`/plat/${plat.slug}`}
      className="dk-reveal dk-carte block overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="dk-zoom aspect-[4/3] bg-secondary">
        {plat.photo_url ? (
          <ImageProgressive src={plat.photo_url} alt={plat.name_fr} ajustement="cover" />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <UtensilsCrossed className="h-7 w-7 text-primary/40" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-semibold leading-tight">{plat.name_fr}</p>
        <p className="dk-secondaire mt-0.5 truncate">
          {[plat.family, plat.typical_place?.region ?? regime].filter(Boolean).join(" · ")}
        </p>
        {/* ⚠ « aucune adresse encore » est écrit noir sur blanc, plat par plat.
            C'est vrai pour les 95 : aucune carte de restaurant n'est saisie. */}
        <p className="mt-1.5 text-[11px] font-semibold text-accent-strong">
          aucune adresse encore
        </p>
      </div>
    </Link>
  );
}
