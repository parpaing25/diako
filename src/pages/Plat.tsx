import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, Flame, Star, Utensils } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { basculerDegustationParSlug, monCarnet } from "@/lib/decouverte";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { EmptyState, EtatErreur, Squelettes } from "@/components/Etats";
import { ImageProgressive } from "@/components/ImageProgressive";
import { ProposerPhoto } from "@/components/ProposerPhoto";
import { Fourchette, Prix } from "@/components/Prix";
import { cn } from "@/lib/utils";

/**
 * LA FICHE D'UN PLAT — /plat/:slug (écran C6 de la maquette).
 *
 * ⚠ C'EST LA PAGE QUI RÉPOND À « OÙ MANGER DU RAVITOTO », la requête citée en
 *   exemple dans le TDR §0.1. Le référentiel des 95 plats et de leurs 254
 *   variantes orthographiques existe depuis le lot 1 et n'était visible nulle
 *   part : il faisait marcher la recherche sans jamais avoir de page à lui.
 *
 * ⚠ LES VARIANTES SONT AFFICHÉES, pas seulement indexées. Elles disent au
 *   lecteur « oui, c'est bien le plat que tu cherchais, quelle que soit la
 *   façon dont tu l'écris » — et elles expliquent pourquoi la recherche le
 *   trouve. C'est exactement ce que montre la maquette.
 *
 * ⚠ AUCUNE CARTE DE RESTAURANT N'EST ENCORE SAISIE. La liste « où en manger »
 *   est donc vide pour tous les plats. On l'écrit franchement et on propose
 *   l'action qui la remplit, plutôt que d'inventer des adresses et des prix.
 */

const FAMILLE: Record<string, string> = {
  laoka: "Laoka · plat de base",
  grillade: "Grillade",
  soupe: "Soupe",
  riz: "Riz",
  mofo: "Mofo · beignet",
  dessert: "Dessert",
  boisson: "Boisson",
  "street-food": "Street food",
  "fruit-de-mer": "Fruit de mer",
};

const PIMENT = ["", "peu épicé", "épicé", "très épicé"];

interface Fiche {
  plat: {
    /* ⚠ `fiche_plat` rend deja l'id ; il n'etait pas declare. C'est lui que
       `dk_proposer_photo()` vise — un slug ne designe pas une ligne. */
    id: string;
    slug: string; name_fr: string; name_mg: string | null; family: string | null;
    description: string | null; ingredients: string[] | null; photo_url: string | null;
    has_pork: boolean; has_beef: boolean; has_seafood: boolean; has_peanut: boolean;
    is_vegetarian: boolean; spice_level: number | null;
    price_min_ar: number | null; price_max_ar: number | null;
  };
  alias: string[];
  adresses: {
    slug: string; nom: string; lieu: string | null; prix_ar: number | null;
    unite: string | null; note: number; nb_avis: number;
    signature: boolean; dispo: boolean; photo: string | null;
  }[];
  prix_min: number | null;
  prix_max: number | null;
  nb_recits: number;
}

export default function Plat() {
  const { slug } = useParams<{ slug: string }>();
  const [f, setF] = useState<Fiche | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "absente" | "erreur">("chargement");
  const { user } = useAuth();
  /** ⚠ L'etat vient du CARNET, pas d'un compteur local : rouvrir la page doit
   *  montrer la verite, pas ce qu'on croyait avoir clique. */
  const [goute, setGoute] = useState(false);
  useReveal(f);

  useEffect(() => {
    if (!user || !f) return;
    void monCarnet()
      .then((c) => setGoute(c.some((d) => d.plat?.slug === f.plat.slug)))
      .catch(() => undefined);
  }, [user, f]);

  const charger = useCallback(async () => {
    if (!slug) return;
    setEtat("chargement");
    const { data, error } = await supabase.rpc("fiche_plat", { p_slug: slug });
    if (error) return setEtat("erreur");
    if (!data) return setEtat("absente");
    setF(data as unknown as Fiche);
    setEtat("ok");
  }, [slug]);

  useEffect(() => {
    void charger();
  }, [charger]);

  useSEO({
    titre: f ? `${f.plat.name_fr} — où en manger à Madagascar` : "Plat",
    description: f
      ? f.plat.description ??
        `${f.plat.name_fr} : où en manger à Madagascar, avec le prix chez chacun.`
      : undefined,
    image: f?.plat.photo_url ?? undefined,
    url: slug ? `/plat/${slug}` : undefined,
  });

  if (etat === "chargement")
    return (
      <div className="space-y-4 px-4 py-5">
        <div className="dk-skeleton h-40 rounded-2xl" />
        <div className="dk-skeleton h-8 w-2/3" />
        <Squelettes nombre={3} hauteur="h-16" />
      </div>
    );

  if (etat === "erreur") return <div className="px-4 py-8"><EtatErreur onReessayer={() => void charger()} /></div>;

  if (etat === "absente" || !f)
    return (
      <div className="px-4 py-16 text-center">
        <h1 className="dk-titre">Plat inconnu</h1>
        <p className="mt-2 text-muted-foreground">Ce plat n'est pas dans le référentiel.</p>
        <Link to="/recherche" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground">
          Chercher un plat
        </Link>
      </div>
    );

  const p = f.plat;
  const regimes = [
    p.has_pork && "Contient du porc",
    p.has_beef && "Contient du bœuf",
    p.has_seafood && "Fruits de mer",
    p.has_peanut && "Contient de l'arachide",
    p.is_vegetarian && "Végétarien",
    p.spice_level ? PIMENT[p.spice_level] : null,
  ].filter(Boolean) as string[];

  return (
    /* ═══ GABARIT G3 — la fiche plat, sections + reperes ═══════════════════
       ⚠ CE QUI MONTE DANS LA COLONNE DE DROITE : les variantes d'orthographe
         et le geste « marquer goute ». Les variantes ne sont pas une curiosite
         — ce sont elles qui font que « ravi-toto » trouve ce plat, et les
         montrer explique au lecteur pourquoi la recherche a marche. Le geste,
         lui, doit rester sous la main pendant toute la lecture. */
    <div className="px-4 py-5 xl:flex xl:items-start xl:gap-5">
      <div className="min-w-0 flex-1 xl:max-w-[620px]">
      {p.photo_url && (
        <div className="mb-4 aspect-[3/2] overflow-hidden rounded-2xl bg-muted">
          <ImageProgressive src={p.photo_url} alt={p.name_fr} ajustement="cover" />
        </div>
      )}

      <p className="dk-etiquette">{FAMILLE[p.family ?? ""] ?? p.family}</p>
      <h1 className="dk-titre mt-1">{p.name_fr}</h1>

      {/* Les variantes : c'est ce qui fait que « ravi-toto » trouve ce plat. */}
      {f.alias.length > 0 && (
        <p className="dk-secondaire mt-1">{f.alias.slice(0, 6).join(" · ")}</p>
      )}

      {p.description && <p className="dk-corps mt-3 max-w-prose">{p.description}</p>}

      {regimes.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {regimes.map((r) => (
            <li
              key={r}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-semibold",
                r.startsWith("Contient") || r.includes("épicé")
                  ? "bg-accent/15 text-accent-strong"
                  : "bg-secondary text-foreground"
              )}
            >
              {r}
            </li>
          ))}
          {(p.price_min_ar || p.price_max_ar) && (
            <li className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">
              <Fourchette min={p.price_min_ar} max={p.price_max_ar} />
            </li>
          )}
        </ul>
      )}

      {/* ── LE GESTE QUI RELIE L'ATLAS AU CARNET ───────────────────────────
          ⚠ C'est la seule mecanique du produit qui fonctionne avec UN membre
            inscrit : marquer un plat goute n'a besoin de personne d'autre.
            Elle doit donc etre a portee de pouce sur chaque fiche, et pas
            seulement dans le carnet. */}
      <button
        onClick={async () => {
          if (!user)
            return toast("Connexion requise", {
              description: "Créez un compte pour tenir votre carnet de goûts.",
            });
          const avant = goute;
          setGoute(!avant);
          try {
            setGoute(await basculerDegustationParSlug(p.slug));
          } catch {
            setGoute(avant);
            toast.error("L'enregistrement a échoué.");
          }
        }}
        aria-pressed={goute}
        className={cn(
          "dk-onde mt-4 inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition",
          goute
            ? "border border-ok bg-ok-soft text-ok"
            : "bg-accent-strong text-accent-foreground"
        )}
      >
        {goute ? (
          <>
            <Check className="h-4 w-4" aria-hidden="true" />
            Goûté
          </>
        ) : (
          "Marquer goûté"
        )}
      </button>

      {p.ingredients?.length ? (
        <p className="dk-secondaire mt-3">
          <span className="font-semibold text-foreground">Dedans : </span>
          {p.ingredients.join(", ")}
        </p>
      ) : null}

      {/* ── Où en manger ─────────────────────────────────────────────── */}
      <section className="dk-reveal mt-6" id="ou-en-manger">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="dk-etiquette">Où en manger</h2>
          {f.adresses.length > 0 && (
            <span className="dk-secondaire">{f.adresses.length} adresses</span>
          )}
        </div>

        {f.adresses.length === 0 ? (
          <EmptyState
            className="mt-2"
            icone={Utensils}
            manque="Aucune adresse ne le sert encore sur Diako."
            action={{ libelle: "Je sais où en trouver", lien: "/publier" }}
            contenuReel={
              <>
                <p className="dk-secondaire leading-relaxed">
                  Zéro carte de restaurant saisie à ce jour. La liste s'affichera
                  avec le prix du plat chez chacun, sa distance et son horaire.
                  En attendant, ce plat porte déjà sa fiche et ses{" "}
                  {f.alias.length} variantes d'orthographe — ce sont elles qui
                  font marcher la recherche.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to="/plats"
                    className="inline-flex min-h-10 items-center rounded-full border border-input px-4 text-sm font-semibold"
                  >
                    Parcourir les 95 plats
                  </Link>
                  <Link
                    to="/pro"
                    className="inline-flex min-h-10 items-center rounded-full border border-input px-4 text-sm font-semibold"
                  >
                    Inviter un restaurant
                  </Link>
                </div>
              </>
            }
          />
        ) : (
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {f.adresses.map((a) => (
              <li key={a.slug}>
                <Link to={`/p/${a.slug}`} className="flex items-center gap-3 p-3 hover:bg-muted/40">
                  <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {a.photo ? (
                      <ImageProgressive src={a.photo} alt="" ajustement="cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center">
                        <Utensils className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">{a.nom}</span>
                      {a.signature && (
                        <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-accent-strong">
                          Signature
                        </span>
                      )}
                    </span>
                    <span className="dk-secondaire flex flex-wrap items-center gap-x-2">
                      {a.lieu}
                      {a.nb_avis > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                          {a.note.toFixed(1)}
                        </span>
                      )}
                      {!a.dispo && <span className="text-accent-strong">épuisé aujourd'hui</span>}
                    </span>
                  </span>
                  <Prix
                    montant={a.prix_ar}
                    unite="portion"
                    taille="compacte"
                    className="shrink-0 text-right"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {f.nb_recits > 0 && (
        <p className="dk-reveal mt-4 rounded-xl bg-secondary p-3 text-sm">
          <Flame className="mr-1 inline h-4 w-4 text-accent" aria-hidden="true" />
          {f.nb_recits} récit{f.nb_recits > 1 ? "s" : ""} tague{f.nb_recits > 1 ? "nt" : ""} ce plat.
        </p>
      )}
      </div>

      {/* ── COLONNE « REPERES » ─────────────────────────────────────────── */}
      <aside className="mt-6 shrink-0 space-y-3 xl:sticky xl:top-20 xl:mt-0 xl:w-[340px]">
        {f.alias.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="dk-etiquette">Aussi ecrit</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {f.alias.map((a) => (
                <li
                  key={a}
                  className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium"
                >
                  {a}
                </li>
              ))}
            </ul>
            {/* ⚠ La phrase compte autant que la liste : elle apprend au lecteur
                que l'orthographe n'a pas d'importance sur ce site. */}
            <p className="dk-secondaire mt-2.5 leading-relaxed">
              {f.alias.length} facon{f.alias.length > 1 ? "s" : ""} de l'ecrire.
              Toutes menent ici — c'est ce qui fait marcher la recherche.
            </p>
          </div>
        )}

        <div className="rounded-2xl border border-accent-strong/25 bg-accent/[0.07] p-4">
          <p className="dk-etiquette text-accent-strong">Mon carnet de gouts</p>
          <p className="dk-secondaire mt-2 leading-relaxed">
            Marquez ce plat goute, il rejoint votre carnet. Aucune adresse n'est
            encore saisie : le carnet, lui, marche des aujourd'hui.
          </p>
          <Link
            to="/gouts"
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-accent-strong/40 text-sm font-semibold text-accent-strong"
          >
            Ouvrir mon carnet
          </Link>
        </div>

        {/* ⭐ 62 plats sur 95 n'ont toujours pas de photo. Wikimedia Commons a
             donne ce qu'il avait — 33 — et 17 propositions ont ete refusees a
             l'oeil parce qu'elles montraient autre chose. Le reste ne viendra
             que de gens qui ont l'assiette devant eux. */}
        <ProposerPhoto
          className="rounded-2xl border border-border bg-card p-4"
          cibleType="plat"
          cible={p.id}
          nom={p.name_fr}
        />

        <Link
          to="/plats"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-input text-sm font-semibold"
        >
          Les 95 plats de l'atlas
        </Link>
      </aside>
    </div>
  );
}
