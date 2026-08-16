import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BookOpen, Compass } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { EmptyState, EtatErreur, Squelettes } from "@/components/Etats";
import { chargerGuide, chargerGuides, type Guide } from "@/lib/decouverte";

/**
 * LES GUIDES ÉDITORIAUX — /guides et /guides/:slug (design final §4, gabarit G2).
 *
 * ⚠ CE SONT LES PAGES QUI ATTIRENT LE TRAFIC DE RECHERCHE AVANT QUE L'ANNUAIRE
 *   SOIT FOURNI. « Quand partir à Nosy Be », « manger pour moins de 20 000 Ar
 *   à Tana » : ces requêtes existent aujourd'hui, alors que « hôtel à Ampefy »
 *   ne rapporte encore que 54 fiches. C'est le canal d'acquisition d'un site
 *   jeune.
 *
 * ⚠ UNE SEULE SOURCE DE VÉRITÉ, EN BASE. Jamais de guide écrit en dur dans un
 *   composant : le jour où quelqu'un corrige une date de saison, il ne doit pas
 *   avoir à la corriger à deux endroits.
 *
 * ⚠ COLONNE DE LECTURE À 620 px. C'est du texte suivi : on n'élargit pas, même
 *   quand la place existe.
 */

const KIND: Record<string, string> = {
  quand_partir: "Quand partir",
  aller_a: "Y aller",
  manger_pour: "Manger pour",
  week_end: "Un week-end",
  choisir_agence: "Choisir son agence",
};

export default function Guides() {
  const { slug } = useParams<{ slug?: string }>();
  return slug ? <UnGuide slug={slug} /> : <ListeGuides />;
}

function ListeGuides() {
  useSEO({
    titre: "Guides de voyage à Madagascar",
    description:
      "Quand partir où, comment aller à un endroit, manger pour moins de X, un week-end quelque part, choisir son agence.",
    url: "https://diako.fonenako.mg/guides",
  });

  const [guides, setGuides] = useState<Guide[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);
  useReveal(guides);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(false);
    try {
      setGuides(await chargerGuides(24));
    } catch {
      setErreur(true);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  return (
    <div className="px-4 py-5">
      <p className="dk-etiquette">Pour préparer</p>
      <h1 className="dk-titre mt-1">Guides</h1>
      <p className="dk-corps mt-2 max-w-[70ch] text-muted-foreground">
        Quand partir où, comment y aller, manger pour moins de tant, un week-end
        quelque part, choisir son agence.
      </p>

      {erreur && <EtatErreur className="mt-5" onReessayer={() => void charger()} />}
      {chargement && <Squelettes className="mt-5" nombre={3} hauteur="h-24" />}

      {!chargement && guides.length > 0 && (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 large:grid-cols-3">
          {guides.map((g) => (
            <li key={g.id}>
              <Link
                to={`/guides/${g.slug}`}
                className="dk-reveal dk-carte block rounded-2xl border border-border bg-card p-4"
              >
                <p className="dk-etiquette">{KIND[g.kind] ?? g.kind}</p>
                <h2 className="mt-1.5 text-[17px] font-bold leading-tight">{g.title}</h2>
                {g.summary && (
                  <p className="dk-corps mt-1.5 line-clamp-3 text-muted-foreground">{g.summary}</p>
                )}
                {g.place && <p className="dk-secondaire mt-2">{g.place.name_fr}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!chargement && guides.length === 0 && !erreur && (
        <EmptyState
          className="mt-5"
          icone={BookOpen}
          manque="Aucun guide n'est encore publié."
          action={{ libelle: "Explorer les destinations", lien: "/explorer" }}
          contenuReel={
            <>
              <p className="dk-secondaire leading-relaxed">
                Les cinq familles de guides prévues : quand partir où, y aller,
                manger pour moins de tant, un week-end quelque part, choisir son
                agence. En attendant, le référentiel répond déjà à la première —
                cinq destinations portent leur saisonnalité mois par mois, et 41
                leurs accès réels.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to="/explorer"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-semibold"
                >
                  <Compass className="h-4 w-4" aria-hidden="true" />
                  Les destinations
                </Link>
                <Link
                  to="/plats"
                  className="inline-flex min-h-10 items-center rounded-full border border-input px-4 text-sm font-semibold"
                >
                  L'atlas des 95 plats
                </Link>
              </div>
            </>
          }
        />
      )}
    </div>
  );
}

function UnGuide({ slug }: { slug: string }) {
  const [g, setG] = useState<Guide | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "absent" | "erreur">("chargement");
  useReveal(g?.id);

  const charger = useCallback(async () => {
    setEtat("chargement");
    try {
      const d = await chargerGuide(slug);
      if (!d) return setEtat("absent");
      setG(d);
      setEtat("ok");
    } catch {
      setEtat("erreur");
    }
  }, [slug]);

  useEffect(() => {
    void charger();
  }, [charger]);

  useSEO({
    titre: g ? g.title : "Guide",
    description: g?.summary ?? undefined,
    image: g?.cover_url ?? undefined,
    url: `/guides/${slug}`,
  });

  if (etat === "chargement")
    return (
      <div className="dk-colonne space-y-4 px-4 py-5">
        <div className="dk-skeleton h-8 w-2/3" />
        <Squelettes nombre={3} hauteur="h-20" />
      </div>
    );

  if (etat === "erreur")
    return (
      <div className="dk-colonne px-4 py-8">
        <EtatErreur onReessayer={() => void charger()} />
      </div>
    );

  if (etat === "absent" || !g)
    return (
      <div className="dk-colonne px-4 py-16 text-center">
        <h1 className="dk-titre">Guide introuvable</h1>
        <p className="mt-2 text-muted-foreground">Ce guide n'existe pas ou n'est plus publié.</p>
        <Link
          to="/guides"
          className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          Tous les guides
        </Link>
      </div>
    );

  return (
    <article className="dk-colonne px-4 py-5">
      <p className="dk-etiquette">{KIND[g.kind] ?? g.kind}</p>
      <h1 className="dk-titre mt-1">{g.title}</h1>
      {g.place && (
        <p className="dk-secondaire mt-1">
          <Link to={`/lieu/${g.place.slug}`} className="text-primary">
            {g.place.name_fr}
          </Link>
        </p>
      )}
      {g.summary && <p className="dk-corps mt-3 text-muted-foreground">{g.summary}</p>}
      {g.body && (
        <div className="dk-corps mt-5 whitespace-pre-line leading-relaxed">{g.body}</div>
      )}
      {g.published_at && (
        <p className="dk-secondaire mt-6 border-t border-border pt-3">
          Publié le {new Date(g.published_at).toLocaleDateString("fr-FR")}.
        </p>
      )}
    </article>
  );
}
