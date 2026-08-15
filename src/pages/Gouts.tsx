import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookMarked, Check, Store, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { EmptyState, EtatErreur } from "@/components/Etats";
import { ImageProgressive } from "@/components/ImageProgressive";
import {
  basculerDegustation,
  chargerAtlas,
  monCarnet,
  statsAtlas,
  type Degustation,
  type PlatAtlas,
} from "@/lib/decouverte";
import { cn } from "@/lib/utils";

/**
 * MON CARNET DE GOÛTS — /gouts (écran M3 du design final).
 *
 * ⚠ POURQUOI CET ÉCRAN COMPTE PLUS QUE LES AUTRES AUJOURD'HUI. Diako a UN seul
 *   membre inscrit. Toutes les briques sociales — suivre, commenter, réagir —
 *   ont besoin de quelqu'un d'autre pour avoir du sens. Marquer un plat goûté
 *   n'a besoin de personne : c'est la seule mécanique du produit qui
 *   fonctionne dès le premier utilisateur, et elle s'appuie sur le seul jeu de
 *   données réellement fourni (95 plats, 254 variantes).
 *
 * ⚠ LA PROGRESSION S'AFFICHE EN NOMBRE, JAMAIS EN POURCENTAGE, tant que le
 *   référentiel bouge. « 12 sur 95 » reste vrai quand on ajoute un plat ;
 *   « 13 % » devient faux et donne l'impression d'avoir reculé.
 */

const ONGLETS = [
  { cle: "goutes", label: "Goûtés" },
  { cle: "a_gouter", label: "À goûter" },
  { cle: "famille", label: "Par famille" },
] as const;

type Onglet = (typeof ONGLETS)[number]["cle"];

export default function Gouts() {
  useSEO({
    titre: "Mon carnet de goûts — les plats malgaches que j'ai goûtés",
    description:
      "Les plats malgaches que vous avez goûtés, ceux qui restent à découvrir, et où les autres les ont trouvés.",
    url: "https://diako.fonenako.mg/gouts",
  });

  const { user } = useAuth();
  const [onglet, setOnglet] = useState<Onglet>("goutes");
  const [carnet, setCarnet] = useState<Degustation[]>([]);
  const [tous, setTous] = useState<PlatAtlas[]>([]);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof statsAtlas>> | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);
  useReveal(onglet + carnet.length);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(false);
    try {
      const [c, t, s] = await Promise.all([
        user ? monCarnet() : Promise.resolve([]),
        chargerAtlas({ limite: 40 }),
        statsAtlas(),
      ]);
      setCarnet(c);
      setTous(t);
      setStats(s);
    } catch {
      setErreur(true);
    } finally {
      setChargement(false);
    }
  }, [user]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const goutesIds = new Set(carnet.map((d) => d.dish_id));
  const aGouter = tous.filter((p) => !goutesIds.has(p.id));

  async function marquer(dishId: string) {
    if (!user) return toast("Connexion requise", { description: "Créez un compte pour tenir votre carnet." });
    try {
      const ajoute = await basculerDegustation(dishId);
      toast.success(ajoute ? "Marqué goûté." : "Retiré du carnet.");
      setCarnet(await monCarnet());
    } catch {
      toast.error("L'enregistrement a échoué.");
    }
  }

  return (
    <div className="px-4 py-5">
      <p className="dk-etiquette">Aventure culinaire</p>
      <h1 className="dk-titre mt-1">Mon carnet de goûts</h1>
      <p className="dk-corps mt-2 max-w-[70ch] text-muted-foreground">
        Les plats malgaches que vous avez goûtés, ceux qui restent à découvrir,
        et où les autres les ont trouvés.
      </p>

      {/* ── La progression, EN NOMBRE ─────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap gap-2.5">
        <Compteur n={carnet.length} quoi="goûtés" fort />
        <Compteur n={stats?.plats} quoi="au référentiel" />
        <Compteur n={stats?.familles} quoi="familles" />
      </div>

      <div role="tablist" className="mt-5 flex gap-1.5">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            role="tab"
            aria-selected={onglet === o.cle}
            onClick={() => setOnglet(o.cle)}
            className={cn(
              "min-h-9 rounded-full border px-4 text-sm font-semibold transition",
              onglet === o.cle
                ? "border-accent-strong bg-accent-strong text-accent-foreground"
                : "border-border bg-card hover:border-primary hover:text-primary"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {erreur && <EtatErreur className="mt-5" onReessayer={() => void charger()} />}

      {chargement && (
        <ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="dk-skeleton h-40 rounded-xl" />
          ))}
        </ul>
      )}

      {/* ── Goûtés ───────────────────────────────────────────────────────── */}
      {!chargement && onglet === "goutes" && (
        carnet.length > 0 ? (
          <ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {carnet.map((d) => (
              <li key={d.dish_id}>
                <Vignette
                  slug={d.plat?.slug ?? ""}
                  nom={d.plat?.name_fr ?? "Plat"}
                  detail={d.plat?.family ?? null}
                  photo={d.plat?.photo_url ?? null}
                  goute
                  onBasculer={() => void marquer(d.dish_id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            className="mt-5"
            icone={BookMarked}
            manque={
              user
                ? "Vous n'avez encore marqué aucun plat goûté."
                : "Votre carnet vous attend, il faut un compte pour le tenir."
            }
            action={
              user
                ? { libelle: "Parcourir l'atlas", lien: "/plats" }
                : { libelle: "Créer un compte", lien: "/auth" }
            }
            contenuReel={
              <>
                <p className="dk-secondaire leading-relaxed">
                  Le référentiel compte {stats?.plats ?? 95} plats et{" "}
                  {stats?.variantes ?? 254} orthographes. Voici par où commencer :
                </p>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {tous.slice(0, 8).map((p) => (
                    <li key={p.id}>
                      <Link
                        to={`/plat/${p.slug}`}
                        className="inline-flex items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:border-primary hover:text-primary"
                      >
                        {p.name_fr}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            }
          />
        )
      )}

      {/* ── À goûter ─────────────────────────────────────────────────────── */}
      {!chargement && onglet === "a_gouter" && (
        <>
          <ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {aGouter.map((p) => (
              <li key={p.id}>
                <Vignette
                  slug={p.slug}
                  nom={p.name_fr}
                  detail={p.family}
                  photo={p.photo_url}
                  onBasculer={() => void marquer(p.id)}
                />
              </li>
            ))}
          </ul>
          {/* ⚠ « Où en trouver » restera vide tant qu'aucune carte n'est saisie.
              On l'écrit ici plutôt que de laisser chaque vignette promettre une
              adresse qui n'existe pas. */}
          <div className="mt-5 rounded-2xl border border-accent-strong/30 bg-accent/[0.07] p-4">
            <p className="font-semibold">Aucune carte de restaurant n'est encore saisie</p>
            <p className="dk-secondaire mt-1.5 max-w-[70ch] leading-relaxed">
              «&nbsp;Où en trouver&nbsp;» restera vide jusqu'à la première carte
              publiée. En attendant, chaque plat porte sa fiche, ses variantes et
              les récits qui le taguent.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to="/publier"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent-strong px-4 text-sm font-semibold text-accent-foreground"
              >
                <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />
                Taguer une assiette
              </Link>
              <Link
                to="/pro"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-semibold"
              >
                <Store className="h-4 w-4" aria-hidden="true" />
                Inviter un resto
              </Link>
            </div>
          </div>
        </>
      )}

      {/* ── Par famille ──────────────────────────────────────────────────── */}
      {!chargement && onglet === "famille" && (
        <div className="mt-5 space-y-5">
          {Object.entries(
            tous.reduce<Record<string, PlatAtlas[]>>((acc, p) => {
              const f = p.family ?? "autres";
              (acc[f] ??= []).push(p);
              return acc;
            }, {})
          ).map(([famille, liste]) => (
            <section key={famille}>
              <h2 className="dk-etiquette">
                {famille} · {liste.length}
              </h2>
              <ul className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {liste.map((p) => (
                  <li key={p.id}>
                    <Vignette
                      slug={p.slug}
                      nom={p.name_fr}
                      detail={p.family}
                      photo={p.photo_url}
                      goute={goutesIds.has(p.id)}
                      onBasculer={() => void marquer(p.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Compteur({ n, quoi, fort }: { n?: number; quoi: string; fort?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-2.5",
        fort ? "border-accent-strong/30 bg-accent/[0.07]" : "border-border bg-card"
      )}
    >
      <p
        className={cn(
          "text-2xl font-bold leading-none tabular-nums",
          fort ? "text-accent-strong" : "text-foreground"
        )}
      >
        {n ?? "—"}
      </p>
      <p className="dk-secondaire mt-1">{quoi}</p>
    </div>
  );
}

function Vignette({
  slug,
  nom,
  detail,
  photo,
  goute,
  onBasculer,
}: {
  slug: string;
  nom: string;
  detail: string | null;
  photo: string | null;
  goute?: boolean;
  onBasculer: () => void;
}) {
  return (
    <div className="dk-reveal dk-carte overflow-hidden rounded-xl border border-border bg-card">
      <Link to={`/plat/${slug}`} className="dk-zoom block aspect-[4/3] bg-secondary">
        {photo ? (
          <ImageProgressive src={photo} alt={nom} ajustement="cover" />
        ) : (
          <span className="grid h-full w-full place-items-center">
            <UtensilsCrossed className="h-7 w-7 text-primary/40" aria-hidden="true" />
          </span>
        )}
      </Link>
      <div className="p-3">
        <Link to={`/plat/${slug}`} className="block truncate text-sm font-semibold leading-tight">
          {nom}
        </Link>
        {detail && <p className="dk-secondaire mt-0.5 truncate">{detail}</p>}
        <button
          onClick={onBasculer}
          aria-pressed={!!goute}
          className={cn(
            "mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-full border text-xs font-semibold",
            goute
              ? "border-ok bg-ok-soft text-ok"
              : "border-input hover:border-primary hover:text-primary"
          )}
        >
          {goute ? (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Goûté
            </>
          ) : (
            "Marquer goûté"
          )}
        </button>
      </div>
    </div>
  );
}
