import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2, Lock, Search } from "lucide-react";
import { compressImage } from "@/lib/imageCompression";
import { uploadToO2Switch } from "@/lib/o2switchUpload";
import {
  CATEGORIES,
  chargerDestinations,
  chercherEtablissementsParNom,
  creerEtablissement,
  majEtablissement,
  type Categorie,
  type Lieu,
  type SuggestionEtab,
} from "@/lib/etablissements";
import { afficherNumero, estMobileMalgache } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

/**
 * Assistant de création d'un établissement.
 *
 * ⚠ POURQUOI EN ÉTAPES, ET PAS UN FORMULAIRE D'UN SEUL TENANT. Le formulaire
 *   précédent tenait sur un écran : un gérant qui s'arrêtait au milieu — parce
 *   qu'il cherchait son numéro, parce qu'un client arrivait — perdait tout.
 *   C'est le défaut qui fait qu'une fiche sur deux n'est jamais créée.
 *
 * Trois principes, repris du wizard du projet frère :
 *
 *  ① BROUILLON PERMANENT. Chaque frappe est écrite localement. On peut fermer
 *    l'onglet, revenir demain, reprendre où on en était.
 *
 *  ② UNE QUESTION À LA FOIS, ET LA PLUS FACILE D'ABORD. « Que faites-vous »
 *    se répond en un doigt ; le nom et le lieu ensuite ; les photos en
 *    dernier, quand l'engagement est déjà pris.
 *
 *  ③ ON PEUT TOUJOURS FINIR PLUS TARD. Seules trois informations sont
 *    exigées — nom, activité, lieu. Le reste peut se remplir depuis la console
 *    de gestion, et la barre de complétude dira ce qui manque.
 */

const CLE_BROUILLON = "diako_brouillon_etablissement";

interface Brouillon {
  categories: Categorie[];
  nom: string;
  place_id: string;
  short_desc: string;
  long_desc: string;
  phone: string;
  whatsapp: string;
  landmark: string;
  cover_url: string;
  etape: number;
}

const VIDE: Brouillon = {
  categories: [],
  nom: "",
  place_id: "",
  short_desc: "",
  long_desc: "",
  phone: "",
  whatsapp: "",
  landmark: "",
  cover_url: "",
  etape: 0,
};

const ETAPES = [
  { titre: "Que faites-vous ?", aide: "Plusieurs réponses possibles." },
  { titre: "Votre établissement", aide: "Le nom et l'endroit, c'est le minimum pour être trouvé." },
  { titre: "Comment vous joindre", aide: "C'est ce que les voyageurs cherchent en premier." },
  { titre: "En quelques mots", aide: "Ce qui donne envie, et ce qu'il faut savoir." },
  { titre: "Une photo", aide: "Une seule suffit pour commencer." },
  { titre: "C'est prêt", aide: "Voici ce que verront les voyageurs." },
];

function lireBrouillon(): Brouillon {
  try {
    const b = localStorage.getItem(CLE_BROUILLON);
    return b ? { ...VIDE, ...(JSON.parse(b) as Brouillon) } : VIDE;
  } catch {
    return VIDE;
  }
}

const champCss =
  "w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AssistantEtablissement({ onAnnuler }: { onAnnuler?: () => void }) {
  const navigate = useNavigate();
  const [b, setB] = useState<Brouillon>(lireBrouillon);
  const [destinations, setDestinations] = useState<Lieu[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [envoiPhoto, setEnvoiPhoto] = useState(false);

  /**
   * ⭐ LES ÉTABLISSEMENTS QUI PORTENT DÉJÀ CE NOM — le défaut le plus coûteux
   *   que cet assistant pouvait produire.
   *
   * 🔴 L'annuaire porte 3 254 fiches importées d'OpenStreetMap et de
   *    Wikivoyage. Un gérant tape le nom de SON hôtel : il a de bonnes chances
   *    qu'il y soit déjà, et il créait jusqu'ici une SECONDE fiche. À partir de
   *    là, les avis se posent sur l'une, les tarifs sur l'autre, les deux
   *    remontent dans la recherche — et plus personne ne peut les recoller sans
   *    une migration écrite à la main (0060, puis 0087).
   *
   * ⚠ LA RECHERCHE EST DIFFÉRÉE DE 350 ms. Sans ce délai, une frappe de dix
   *   lettres part en dix requêtes ; sur une 3G elles arrivent dans le
   *   désordre, et la liste affiche le résultat de « Hôt » après celui de
   *   « Hôtel Bao ». Le compteur de génération règle le second problème : une
   *   réponse en retard ne peut plus écraser une réponse plus récente.
   */
  const [suggestions, setSuggestions] = useState<SuggestionEtab[]>([]);
  const [ecarte, setEcarte] = useState(false);

  useEffect(() => {
    void chargerDestinations(200).then(setDestinations).catch(() => undefined);
  }, []);

  const nomTape = b.nom;
  useEffect(() => {
    if (nomTape.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    let vivant = true;
    const t = window.setTimeout(() => {
      void chercherEtablissementsParNom(nomTape, 5)
        .then((r) => {
          if (vivant) setSuggestions(r);
        })
        .catch(() => {
          // ⚠ Un échec ne bloque PAS la création : la suggestion est une aide,
          //   pas un passage obligé. Rester muet vaut mieux qu'une erreur qui
          //   ferait croire que le nom est refusé.
          if (vivant) setSuggestions([]);
        });
    }, 350);
    return () => {
      vivant = false;
      window.clearTimeout(t);
    };
  }, [nomTape]);

  // Écriture du brouillon à chaque changement : c'est ce qui permet de fermer
  // l'onglet sans rien perdre.
  useEffect(() => {
    try {
      localStorage.setItem(CLE_BROUILLON, JSON.stringify(b));
    } catch {
      /* mode privé : l'assistant marche quand même, sans reprise */
    }
  }, [b]);

  const maj = useCallback(<K extends keyof Brouillon>(cle: K, valeur: Brouillon[K]) => {
    setB((x) => ({ ...x, [cle]: valeur }));
  }, []);

  const etape = Math.min(b.etape, ETAPES.length - 1);

  const peutAvancer = useMemo(() => {
    if (etape === 0) return b.categories.length > 0;
    if (etape === 1) return b.nom.trim().length >= 2 && !!b.place_id;
    return true;
  }, [etape, b]);

  async function ajouterCouverture(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setEnvoiPhoto(true);
    try {
      const res = await uploadToO2Switch(await compressImage(f), "pages");
      if (!res.success || !res.url) throw new Error(res.error || "Envoi impossible");
      maj("cover_url", res.url);
      toast.success("Photo ajoutée.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "La photo n'a pas pu être envoyée.");
    } finally {
      setEnvoiPhoto(false);
    }
  }

  async function creer() {
    setEnvoi(true);
    try {
      const slug = await creerEtablissement({
        name: b.nom,
        categories: b.categories,
        place_id: b.place_id || null,
        short_desc: b.short_desc,
      });

      // Le reste part en une seule mise à jour : la création a déjà réussi,
      // un échec ici ne doit pas faire perdre la fiche.
      try {
        await majEtablissement(await fetchIdParSlug(slug), {
            long_desc: b.long_desc.trim() || null,
            phone: b.phone.trim() || null,
            whatsapp: b.whatsapp.trim() || null,
            landmark: b.landmark.trim() || null,
          cover_url: b.cover_url || null,
        });
      } catch {
        toast("Fiche créée", {
          description: "Certains détails n'ont pas été enregistrés, complétez-les dans la console.",
        });
      }

      try {
        localStorage.removeItem(CLE_BROUILLON);
      } catch {
        /* rien */
      }
      toast.success("Votre fiche est créée.");
      navigate(`/pro/${slug}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "La fiche n'a pas pu être créée.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border p-4">
      {/* Progression : on sait toujours où on en est et combien il reste. */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            Étape {etape + 1} sur {ETAPES.length}
          </p>
          <h2 className="mt-0.5 font-semibold">{ETAPES[etape].titre}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{ETAPES[etape].aide}</p>
        </div>
        {onAnnuler && (
          <button
            onClick={onAnnuler}
            className="shrink-0 text-xs text-muted-foreground underline underline-offset-4"
          >
            Fermer
          </button>
        )}
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${((etape + 1) / ETAPES.length) * 100}%` }}
        />
      </div>

      <div className="dk-fade-in mt-5 space-y-4" key={etape}>
        {etape === 0 && (
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const actif = b.categories.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() =>
                    maj(
                      "categories",
                      actif ? b.categories.filter((x) => x !== c.code) : [...b.categories, c.code]
                    )
                  }
                  aria-pressed={actif}
                  className={cn(
                    "min-h-11 rounded-full border px-4 text-sm transition",
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
        )}

        {etape === 1 && (
          <>
            <label className="block">
              <span className="text-sm font-medium">Nom de l'établissement</span>
              <input
                value={b.nom}
                onChange={(e) => maj("nom", e.target.value)}
                maxLength={120}
                placeholder="Chez Mariette, Hôtel Le Baobab…"
                className={cn(champCss, "mt-1")}
                autoFocus
              />
            </label>

            {/* ⭐ « CETTE FICHE EXISTE PEUT-ÊTRE DÉJÀ ». On ne bloque pas la
                   création — le nom d'un hôtel n'est pas unique, et deux
                   « Chez Mariette » peuvent exister à 600 km l'un de l'autre.
                   On MONTRE, et on laisse trancher : c'est la personne qui sait
                   si c'est son établissement.
                ⚠ Le lieu est affiché à côté de chaque nom, parce que c'est LUI
                  qui permet de reconnaître le bon — pas le nom, qui est
                  justement celui qu'on vient de taper. */}
            {!ecarte && suggestions.length > 0 && (
              <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Search className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  Ces fiches existent déjà
                </p>
                <p className="dk-secondaire mt-0.5 text-muted-foreground">
                  Si l'une est la vôtre, revendiquez-la plutôt que d'en créer une
                  seconde : vous récupérez ses avis et sa place dans la recherche.
                </p>
                <ul className="mt-2 space-y-1.5">
                  {suggestions.map((x) => (
                    <li
                      key={x.slug}
                      className="flex items-center justify-between gap-2 rounded-lg bg-background p-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{x.nom}</span>
                        <span className="dk-secondaire block truncate text-muted-foreground">
                          {[x.lieu_nom, x.repere].filter(Boolean).join(" · ") || "lieu non précisé"}
                        </span>
                      </span>
                      {x.deja_revendique ? (
                        /* ⚠ ON DIT « DÉJÀ GÉRÉE », PAS PAR QUI. Nommer le
                           gérant permettrait de dresser la liste des membres
                           qui tiennent un établissement en tapant des noms au
                           hasard — l'énumération que 0073 a fermée. */
                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                          déjà gérée
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => navigate(`/p/${x.slug}`)}
                          className="shrink-0 rounded-full border border-input px-3 py-1.5 text-xs font-semibold"
                        >
                          C'est la mienne
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setEcarte(true)}
                  className="mt-2 text-sm font-medium text-muted-foreground underline underline-offset-4"
                >
                  Aucune — je crée une nouvelle fiche
                </button>
              </div>
            )}
            <label className="block">
              <span className="text-sm font-medium">Où c'est</span>
              <select
                value={b.place_id}
                onChange={(e) => maj("place_id", e.target.value)}
                className={cn(champCss, "mt-1")}
              >
                <option value="">Choisir une destination…</option>
                {destinations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name_fr}
                    {d.region ? ` — ${d.region}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Le repère</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                « En face de la station Jovenna, après le pont. » C'est souvent
                plus utile qu'une adresse — et c'est ce qu'on donne au taxi.
              </span>
              <input
                value={b.landmark}
                onChange={(e) => maj("landmark", e.target.value)}
                maxLength={200}
                className={cn(champCss, "mt-1")}
              />
            </label>
          </>
        )}

        {etape === 2 && (
          <>
            <label className="block">
              <span className="text-sm font-medium">Téléphone</span>
              <input
                value={b.phone}
                onChange={(e) => maj("phone", e.target.value)}
                inputMode="tel"
                placeholder="034 12 345 67"
                className={cn(champCss, "mt-1")}
                autoFocus
              />
              {b.phone && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  Sera affiché : {afficherNumero(b.phone)}
                </span>
              )}
            </label>
            <label className="block">
              <span className="text-sm font-medium">WhatsApp</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Souvent le plus utilisé. Laissez vide si c'est le même numéro.
              </span>
              <input
                value={b.whatsapp}
                onChange={(e) => maj("whatsapp", e.target.value)}
                inputMode="tel"
                className={cn(champCss, "mt-1")}
              />
              {/* On avertit sans bloquer : un fixe reste un contact valable,
                  il n'a simplement pas WhatsApp. */}
              {/* ⚠ `accent-strong` et non `accent` : ce span porte un
                  AVERTISSEMENT de saisie, et le corail clair y donnait 3,14:1.
                  Un message qu'on ne lit pas est un message qui n'existe pas.
                  ⚠ Le commentaire est ICI : une accolade JSX ne peut pas être
                    le premier enfant d'une expression conditionnelle. */}
              {b.whatsapp && !estMobileMalgache(b.whatsapp) && (
                <span className="mt-1 block text-xs text-accent-strong">
                  Ce numéro ne ressemble pas à un mobile malgache — WhatsApp
                  risque de ne pas fonctionner.
                </span>
              )}
            </label>
          </>
        )}

        {etape === 3 && (
          <>
            <label className="block">
              <span className="text-sm font-medium">En une phrase</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                C'est ce qui s'affiche dans les résultats de recherche.
              </span>
              <input
                value={b.short_desc}
                onChange={(e) => maj("short_desc", e.target.value)}
                maxLength={200}
                placeholder="Douze bungalows les pieds dans l'eau, devant le récif."
                className={cn(champCss, "mt-1")}
                autoFocus
              />
            </label>

            {/* ⭐ « CETTE FICHE EXISTE PEUT-ÊTRE DÉJÀ ». On ne bloque pas la
                   création — le nom d'un hôtel n'est pas unique, et deux
                   « Chez Mariette » peuvent exister à 600 km l'un de l'autre.
                   On MONTRE, et on laisse trancher : c'est la personne qui sait
                   si c'est son établissement.
                ⚠ Le lieu est affiché à côté de chaque nom, parce que c'est LUI
                  qui permet de reconnaître le bon — pas le nom, qui est
                  justement celui qu'on vient de taper. */}
            {!ecarte && suggestions.length > 0 && (
              <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Search className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  Ces fiches existent déjà
                </p>
                <p className="dk-secondaire mt-0.5 text-muted-foreground">
                  Si l'une est la vôtre, revendiquez-la plutôt que d'en créer une
                  seconde : vous récupérez ses avis et sa place dans la recherche.
                </p>
                <ul className="mt-2 space-y-1.5">
                  {suggestions.map((x) => (
                    <li
                      key={x.slug}
                      className="flex items-center justify-between gap-2 rounded-lg bg-background p-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{x.nom}</span>
                        <span className="dk-secondaire block truncate text-muted-foreground">
                          {[x.lieu_nom, x.repere].filter(Boolean).join(" · ") || "lieu non précisé"}
                        </span>
                      </span>
                      {x.deja_revendique ? (
                        /* ⚠ ON DIT « DÉJÀ GÉRÉE », PAS PAR QUI. Nommer le
                           gérant permettrait de dresser la liste des membres
                           qui tiennent un établissement en tapant des noms au
                           hasard — l'énumération que 0073 a fermée. */
                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                          déjà gérée
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => navigate(`/p/${x.slug}`)}
                          className="shrink-0 rounded-full border border-input px-3 py-1.5 text-xs font-semibold"
                        >
                          C'est la mienne
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setEcarte(true)}
                  className="mt-2 text-sm font-medium text-muted-foreground underline underline-offset-4"
                >
                  Aucune — je crée une nouvelle fiche
                </button>
              </div>
            )}
            <label className="block">
              <span className="text-sm font-medium">Présentation</span>
              <textarea
                value={b.long_desc}
                onChange={(e) => maj("long_desc", e.target.value)}
                rows={5}
                maxLength={4000}
                placeholder="Ce que vous proposez, ce qui vous distingue, comment on vient…"
                className={cn(champCss, "mt-1")}
              />
            </label>
          </>
        )}

        {etape === 4 && (
          <>
            {b.cover_url ? (
              <div className="overflow-hidden rounded-xl border border-border">
                <img src={b.cover_url} alt="" className="aspect-[16/9] w-full object-cover" />
              </div>
            ) : (
              <div className="grid aspect-[16/9] w-full place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                Aucune photo pour l'instant
              </div>
            )}
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-input px-5 text-sm font-medium">
              <input type="file" accept="image/*" onChange={ajouterCouverture} className="sr-only" />
              {envoiPhoto ? "Envoi…" : b.cover_url ? "Changer la photo" : "Choisir une photo"}
            </label>
            <p className="text-xs text-muted-foreground">
              Vous pourrez en ajouter d'autres ensuite. La photo est compressée
              dans votre navigateur avant l'envoi, pour ménager votre forfait.
            </p>
          </>
        )}

        {etape === 5 && (
          <>
            {/* ⭐ L'APERÇU PUBLIC — demandé en clair : « un preview public en fin
                   de process ». L'écran montrait jusqu'ici un tableau
                   « clé / valeur », c'est-à-dire le FORMULAIRE relu à
                   l'envers : on y vérifiait qu'on avait bien rempli les cases,
                   pas ce qu'un voyageur allait voir. Or c'est la seule question
                   qui compte au moment d'appuyer sur « Créer ».

                ⚠ CE N'EST PAS LA VRAIE PAGE, ET L'ÉCRAN LE DIT. Recopier
                  `PagePro` ici la ferait diverger au premier changement, et un
                  aperçu qui ment est pire que pas d'aperçu. On montre l'EN-TÊTE
                  — photo, nom, activité, lieu, repère, contact, résumé —, c'est
                  ce qui se voit en premier et ce que l'assistant renseigne. */}
            <p className="dk-etiquette text-muted-foreground">Ce que verront les voyageurs</p>

            <article className="overflow-hidden rounded-2xl border border-border bg-card">
              {b.cover_url ? (
                <div className="aspect-[16/9] bg-secondary">
                  <img src={b.cover_url} alt="" className="h-full w-full object-cover" />
                </div>
              ) : (
                /* ⚠ On ne cache pas l'absence de photo : c'est le manque le plus
                   visible sur une fiche, et le dire ICI est le seul moment où
                   la personne peut encore y remédier en un clic. */
                <div className="grid aspect-[16/9] place-items-center bg-secondary/60 px-4 text-center">
                  <span className="dk-secondaire text-muted-foreground">
                    Sans photo, votre fiche s'affichera comme ce rectangle gris.
                  </span>
                </div>
              )}
              <div className="p-4">
                <p className="dk-etiquette">
                  {b.categories
                    .map((c) => CATEGORIES.find((x) => x.code === c)?.label)
                    .filter(Boolean)
                    .join(" · ") || "Activité non précisée"}
                </p>
                <h3 className="mt-1 text-[17px] font-bold leading-tight">
                  {b.nom.trim() || "Nom de l'établissement"}
                </h3>
                {(destinations.find((d) => d.id === b.place_id)?.name_fr || b.landmark) && (
                  <p className="dk-secondaire mt-0.5 text-muted-foreground">
                    {[destinations.find((d) => d.id === b.place_id)?.name_fr, b.landmark]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {b.short_desc && (
                  <p className="dk-corps mt-2 text-muted-foreground">{b.short_desc}</p>
                )}
                {(b.phone || b.whatsapp) && (
                  <p className="mt-3 flex flex-wrap gap-2">
                    {b.phone && (
                      <span className="rounded-full border border-input px-3 py-1 text-xs font-semibold">
                        Appeler {afficherNumero(b.phone)}
                      </span>
                    )}
                    {b.whatsapp && (
                      <span className="rounded-full border border-input px-3 py-1 text-xs font-semibold">
                        WhatsApp {afficherNumero(b.whatsapp)}
                      </span>
                    )}
                  </p>
                )}
              </div>
            </article>

            {/* ⚠ CE QUI MANQUE, NOMMÉ. Une fiche incomplète n'est pas refusée —
                seuls le nom, l'activité et le lieu sont exigés — mais elle
                remonte moins bien, et personne ne le devine. On le dit une fois,
                au moment où c'est encore le sujet. */}
            {(() => {
              const manques = [
                !b.cover_url && "une photo",
                !b.phone && !b.whatsapp && "un numéro",
                !b.short_desc && "quelques mots de présentation",
                !b.landmark && "un repère",
              ].filter(Boolean) as string[];
              if (!manques.length) return null;
              return (
                <p className="dk-secondaire rounded-xl border border-dashed border-border p-3 text-muted-foreground">
                  Il manque {manques.join(", ")}. Vous pourrez l'ajouter après —
                  mais une fiche complète remonte plus haut dans la recherche.
                </p>
              );
            })()}
          </>
        )}
      </div>

      <div className="mt-5 flex items-center gap-2">
        {etape > 0 && (
          <button
            onClick={() => maj("etape", etape - 1)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Retour
          </button>
        )}

        {etape < ETAPES.length - 1 ? (
          <button
            onClick={() => maj("etape", etape + 1)}
            disabled={!peutAvancer}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-6 font-medium text-primary-foreground disabled:opacity-40"
          >
            Continuer
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <button
            onClick={() => void creer()}
            disabled={envoi}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-6 font-medium text-primary-foreground disabled:opacity-50"
          >
            {envoi ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            Créer ma fiche
          </button>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Votre saisie est gardée sur cet appareil : vous pouvez fermer et revenir
        plus tard.
      </p>
    </div>
  );
}

/** L'identifiant de la fiche qu'on vient de créer, pour la compléter. */
async function fetchIdParSlug(slug: string): Promise<string> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.from("pages").select("id").eq("slug", slug).maybeSingle();
  if (!data) throw new Error("Fiche introuvable");
  return data.id;
}
