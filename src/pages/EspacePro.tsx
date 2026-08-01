import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, Plus, Star, Store } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  ariary,
  CATEGORIES,
  chargerDestinations,
  creerEtablissement,
  mesEtablissements,
  unite,
  type Categorie,
  type Lieu,
} from "@/lib/etablissements";
import { cn } from "@/lib/utils";

type MonEtab = Awaited<ReturnType<typeof mesEtablissements>>[number];

/**
 * L'espace professionnel.
 *
 * ⚠ CE QUI A CHANGÉ. Cet écran affichait six « outils » — Ma page, Mes
 *   chambres, Ma carte, Mes demandes, Mes avis, Mes statistiques — qui étaient
 *   un tableau littéral dont chaque bouton déclenchait un toast « Bientôt
 *   disponible », plus quatre indicateurs figés à « — ». Il n'existait aucun
 *   back-office, et cocher « Professionnel » à l'inscription n'avait d'autre
 *   effet qu'un badge sur le profil public.
 *
 *   Ici, un gérant crée réellement sa fiche et la gère. La création ne demande
 *   que trois choses — nom, ce qu'il fait, où il est — parce qu'un formulaire
 *   de vingt champs fait abandonner. Tout le reste se remplit ensuite, et la
 *   barre de complétude dit ce qui manque encore.
 */
export default function EspacePro() {
  const { user } = useAuth();
  const navigate = useNavigate();
  useDocumentTitle("Espace professionnel");

  const [etabs, setEtabs] = useState<MonEtab[]>([]);
  const [chargement, setChargement] = useState(true);
  const [formOuvert, setFormOuvert] = useState(false);
  const [destinations, setDestinations] = useState<Lieu[]>([]);

  const [nom, setNom] = useState("");
  const [cats, setCats] = useState<Categorie[]>([]);
  const [lieu, setLieu] = useState("");
  const [resume, setResume] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    if (!user) {
      setChargement(false);
      return;
    }
    try {
      setEtabs(await mesEtablissements());
    } catch {
      toast.error("Vos établissements n'ont pas pu être chargés.");
    } finally {
      setChargement(false);
    }
  }, [user]);

  useEffect(() => {
    void charger();
  }, [charger]);

  useEffect(() => {
    if (!formOuvert || destinations.length) return;
    void chargerDestinations(200).then(setDestinations).catch(() => undefined);
  }, [formOuvert, destinations.length]);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim() || !cats.length) {
      toast.error("Il faut au moins un nom et une activité.");
      return;
    }
    setEnvoi(true);
    try {
      const slug = await creerEtablissement({
        name: nom,
        categories: cats,
        place_id: lieu || null,
        short_desc: resume,
      });
      toast.success("Votre fiche est créée.");
      navigate(`/pro/${slug}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "La fiche n'a pas pu être créée.");
    } finally {
      setEnvoi(false);
    }
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
          <Store className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-xl font-semibold">Espace professionnel</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Hôtel, restaurant, agence de voyage ou guide : créez votre compte pour
          publier votre fiche, vos tarifs et votre carte.
        </p>
        <Link
          to="/auth"
          className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Espace professionnel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vos établissements, leurs tarifs et leur carte.
          </p>
        </div>
        {!formOuvert && etabs.length > 0 && (
          <button
            onClick={() => setFormOuvert(true)}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Ajouter
          </button>
        )}
      </div>

      {chargement && <div className="dk-skeleton mt-5 h-28 rounded-2xl" />}

      {!chargement && etabs.length > 0 && (
        <ul className="mt-5 space-y-3">
          {etabs.map((e) => (
            <li key={e.id} className="rounded-2xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold">{e.name}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {e.categories
                      .map((c) => CATEGORIES.find((x) => x.code === c)?.label ?? c)
                      .join(" · ")}
                    {!e.is_published && " · non publiée"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link
                    to={`/p/${e.slug}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-input px-3 text-sm"
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    Voir
                  </Link>
                  <Link
                    to={`/pro/${e.slug}`}
                    className="inline-flex min-h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
                  >
                    Gérer
                  </Link>
                </div>
              </div>

              {/* La complétude dit ce qui manque plutôt que de féliciter, et
                  c'est elle qui classe la fiche dans les résultats. */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Fiche remplie à {e.completeness} %</span>
                  {e.completeness < 100 && <span>Une fiche complète ressort mieux</span>}
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      e.completeness >= 75 ? "bg-primary" : "bg-accent"
                    )}
                    style={{ width: `${e.completeness}%` }}
                  />
                </div>
              </div>

              {/* Des chiffres RÉELS, y compris quand ils valent zéro. */}
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>
                  {e.price_min_ar != null
                    ? `À partir de ${ariary(e.price_min_ar)} ${unite(e.price_min_unit)}`
                    : "Aucun tarif saisi"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5" aria-hidden="true" />
                  {e.rating_count > 0 ? `${e.rating_avg} (${e.rating_count} avis)` : "Aucun avis"}
                </span>
                <span>
                  {e.views_count} vue{e.views_count > 1 ? "s" : ""}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!chargement && (formOuvert || etabs.length === 0) && (
        <form onSubmit={creer} className="mt-5 rounded-2xl border border-border p-4">
          <h2 className="font-semibold">
            {etabs.length === 0 ? "Créez votre fiche" : "Nouvel établissement"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Trois informations suffisent pour commencer. Vous ajouterez les
            chambres, la carte et les photos ensuite.
          </p>

          <label className="mt-4 block text-sm font-medium" htmlFor="nom">
            Nom de l'établissement
          </label>
          <input
            id="nom"
            value={nom}
            onChange={(ev) => setNom(ev.target.value)}
            required
            maxLength={120}
            placeholder="Chez Mariette, Hôtel Le Baobab…"
            className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm"
          />

          <p className="mt-4 text-sm font-medium">Ce que vous faites</p>
          <p className="text-xs text-muted-foreground">
            Plusieurs choix possibles : un écolodge est souvent hôtel, restaurant
            et organisateur d'excursions à la fois.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const actif = cats.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() =>
                    setCats((l) => (actif ? l.filter((x) => x !== c.code) : [...l, c.code]))
                  }
                  aria-pressed={actif}
                  className={cn(
                    "min-h-9 rounded-full border px-3 text-sm transition",
                    actif
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          <label className="mt-4 block text-sm font-medium" htmlFor="lieu">
            Où c'est
          </label>
          <select
            id="lieu"
            value={lieu}
            onChange={(ev) => setLieu(ev.target.value)}
            className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm"
          >
            <option value="">Choisir une destination…</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name_fr}
                {d.region ? ` — ${d.region}` : ""}
              </option>
            ))}
          </select>

          <label className="mt-4 block text-sm font-medium" htmlFor="resume">
            En une phrase
          </label>
          <input
            id="resume"
            value={resume}
            onChange={(ev) => setResume(ev.target.value)}
            maxLength={200}
            placeholder="Douze bungalows les pieds dans l'eau, devant le récif."
            className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm"
          />

          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={envoi}
              className="min-h-11 rounded-full bg-primary px-6 font-medium text-primary-foreground disabled:opacity-50"
            >
              {envoi ? "Création…" : "Créer ma fiche"}
            </button>
            {etabs.length > 0 && (
              <button
                type="button"
                onClick={() => setFormOuvert(false)}
                className="min-h-11 rounded-full border border-input px-5 text-sm font-medium"
              >
                Annuler
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
