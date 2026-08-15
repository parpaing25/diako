import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, Inbox, MessageCircle, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { EmptyState, EtatErreur } from "@/components/Etats";
import { BadgeVerification } from "@/components/Badges";
import { Prix } from "@/components/Prix";
import { ariary } from "@/lib/etablissements";
import {
  creerProjet,
  monProjet,
  offresDuProjet,
  type Offre,
  type Projet as ProjetType,
} from "@/lib/decouverte";
import { cn } from "@/lib/utils";

/**
 * MON PROJET DE VOYAGE — /projet (écran N3 du design final).
 *
 * ⚠ C'EST L'INVERSE DE L'ANNONCE : ici c'est l'offre qui vient au voyageur. Il
 *   décrit son voyage une fois, les agences et les hôtels répondent. C'est la
 *   seule mécanique du produit qui ne demande PAS au voyageur de comparer 54
 *   fiches lui-même — et donc la seule qui fonctionne quand l'annuaire est
 *   encore mince.
 *
 * ⚠ UN SEUL PROJET ACTIF À LA FOIS, garanti par un index unique partiel en
 *   base (migration 0032). Sans lui, un voyageur en ouvrirait dix et les
 *   agences répondraient dix fois au même voyage.
 *
 * ⚠ CINQ PROPOSITIONS MAXIMUM PAR PROFESSIONNEL ET PAR PROJET, tenu par un
 *   trigger. Ce n'est pas une limite technique mais une protection : sans elle,
 *   une agence peut noyer un voyageur sous vingt offres et rendre l'écran
 *   inutilisable.
 *
 * ⚠ AUCUN VOCABULAIRE DE RÉSERVATION. « Demander », « Discuter », jamais
 *   « Réserver » ni « Payer » : Diako met en relation et n'encaisse rien.
 */

const ENVIES = [
  { code: "nature", label: "nature" },
  { code: "plage", label: "plage" },
  { code: "trek", label: "trek" },
  { code: "culture", label: "culture" },
  { code: "gastronomie", label: "gastronomie" },
  { code: "indecis", label: "je ne sais pas encore" },
];

export default function Projet() {
  useSEO({
    titre: "Mon projet de voyage — décrivez-le une fois, les pros répondent",
    description:
      "Décrivez votre voyage à Madagascar une seule fois : envies, dates, nombre de voyageurs, budget. Les agences et les hébergeurs vous répondent.",
    url: "https://diako.fonenako.mg/projet",
  });

  const { user } = useAuth();
  const navigate = useNavigate();
  const [projet, setProjet] = useState<ProjetType | null>(null);
  const [offres, setOffres] = useState<Offre[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);
  useReveal(projet?.id ?? "vide");

  // Formulaire
  const [envies, setEnvies] = useState<string[]>([]);
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  const [souplesse, setSouplesse] = useState(0);
  const [adultes, setAdultes] = useState(2);
  const [enfants, setEnfants] = useState("");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    if (!user) return setChargement(false);
    setChargement(true);
    setErreur(false);
    try {
      const p = await monProjet();
      setProjet(p);
      setOffres(p ? await offresDuProjet(p.id) : []);
    } catch {
      setErreur(true);
    } finally {
      setChargement(false);
    }
  }, [user]);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function envoyer() {
    if (!user) {
      toast("Connexion requise", { description: "Créez un compte pour décrire votre projet." });
      return navigate("/auth");
    }
    if (!envies.length) return toast.error("Choisissez au moins une envie.");
    setEnvoi(true);
    try {
      await creerProjet({
        envies,
        date_from: du || null,
        date_to: au || null,
        date_flex_days: souplesse || null,
        adults: adultes,
        // ⚠ Les ÂGES des enfants, pas leur nombre : les tarifs enfants
        //   dépendent de tranches, et un hébergeur ne peut pas chiffrer sans.
        children_ages: enfants
          .split(",")
          .map((x) => Number(x.trim()))
          .filter((n) => Number.isFinite(n) && n >= 0 && n < 18),
        budget_ar: budget ? Number(budget.replace(/\s/g, "")) : null,
        notes: notes.trim() || null,
      });
      toast.success("Projet publié. Les professionnels peuvent y répondre.");
      await charger();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "L'envoi a échoué.");
    } finally {
      setEnvoi(false);
    }
  }

  if (chargement) {
    return (
      <div className="space-y-3 px-4 py-5">
        <div className="dk-skeleton h-24 rounded-2xl" />
        <div className="dk-skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="px-4 py-5 xl:flex xl:items-start xl:gap-5">
      <div className="min-w-0 flex-1">
        {/* ── L'entête teal du modèle N3 ─────────────────────────────────── */}
        <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-80">
            Mon projet · un seul actif à la fois
          </p>
          <h1 className="mt-2 text-2xl font-bold leading-tight">
            Décrivez le voyage, les pros répondent
          </h1>
          <p className="mt-2 max-w-[60ch] text-sm leading-relaxed opacity-90">
            C'est l'inverse de l'annonce : ici c'est l'offre qui vient au
            voyageur.
          </p>
        </div>

        {erreur && <EtatErreur className="mt-5" onReessayer={() => void charger()} />}

        {projet ? (
          <RecapProjet projet={projet} />
        ) : (
          <div className="mt-5 space-y-4">
            <section>
              <h2 className="dk-etiquette">Envies</h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {ENVIES.map((e) => (
                  <li key={e.code}>
                    <button
                      onClick={() =>
                        setEnvies((l) =>
                          l.includes(e.code) ? l.filter((x) => x !== e.code) : [...l, e.code]
                        )
                      }
                      aria-pressed={envies.includes(e.code)}
                      className={cn(
                        "min-h-10 rounded-full border px-4 text-sm font-medium transition",
                        envies.includes(e.code)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card hover:border-primary hover:text-primary"
                      )}
                    >
                      {envies.includes(e.code) ? `envie : ${e.label}` : e.label}
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              <Bloc titre="Dates" aide="fixes ou ±N jours">
                <div className="flex flex-wrap gap-2">
                  <input type="date" value={du} onChange={(e) => setDu(e.target.value)} className={champ} />
                  <input type="date" value={au} onChange={(e) => setAu(e.target.value)} className={champ} />
                </div>
                <label className="dk-secondaire mt-2 flex items-center gap-2">
                  souplesse ±
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={souplesse}
                    onChange={(e) => setSouplesse(Number(e.target.value))}
                    className="w-16 rounded-lg border border-input bg-background px-2 py-1 text-[16px]"
                  />
                  jours
                </label>
              </Bloc>

              <Bloc titre="Voyageurs" aide="adultes · âges des enfants">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="dk-secondaire flex items-center gap-2">
                    adultes
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={adultes}
                      onChange={(e) => setAdultes(Number(e.target.value))}
                      className="w-16 rounded-lg border border-input bg-background px-2 py-1 text-[16px]"
                    />
                  </label>
                  <input
                    value={enfants}
                    onChange={(e) => setEnfants(e.target.value)}
                    placeholder="âges des enfants : 4, 9"
                    aria-label="Âges des enfants, séparés par des virgules"
                    className={champ}
                  />
                </div>
              </Bloc>
            </div>

            <Bloc titre="Budget total" aide="en ariary — laissez vide si vous ne savez pas encore">
              <input
                inputMode="numeric"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="par exemple 3 000 000"
                className={champ}
              />
              {budget && Number(budget.replace(/\s/g, "")) > 0 && (
                <p className="dk-secondaire mt-1.5 tabular-nums">
                  {ariary(Number(budget.replace(/\s/g, "")))} au total
                </p>
              )}
            </Bloc>

            <Bloc titre="Précisions" aide="ce qui compte pour vous, ce que vous voulez éviter">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className={champ}
              />
            </Bloc>

            <button
              onClick={() => void envoyer()}
              disabled={envoi}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-accent-strong text-[15px] font-semibold text-accent-foreground disabled:opacity-50 sm:w-auto sm:px-8"
            >
              {envoi ? "Publication…" : "Publier mon projet"}
            </button>

            <p className="dk-secondaire max-w-[70ch] leading-relaxed">
              Diako ne transmet ni votre nom ni votre téléphone. Les
              professionnels voient le voyage, pas le voyageur — le contact ne
              s'ouvre que si vous acceptez une proposition.
            </p>
          </div>
        )}
      </div>

      {/* ── Les offres reçues ────────────────────────────────────────────── */}
      <aside className="mt-6 shrink-0 space-y-3 xl:mt-0 xl:w-[360px]">
        <h2 className="dk-etiquette">Offres reçues</h2>

        {offres.length > 0 ? (
          <ul className="space-y-3">
            {offres.map((o) => (
              <li key={o.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="dk-secondaire inline-flex items-center gap-1.5">
                    {o.page?.name}
                    {o.page?.verification_status !== "none" && o.page && (
                      <BadgeVerification niveau={o.page.verification_status} />
                    )}
                  </p>
                  {o.status === "envoyee" && (
                    <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase text-accent-strong">
                      nouveau
                    </span>
                  )}
                </div>
                <p className="mt-1.5 font-semibold leading-tight">{o.title}</p>
                {o.body && <p className="dk-corps mt-1.5 text-muted-foreground">{o.body}</p>}
                {o.includes.length > 0 && (
                  <p className="dk-secondaire mt-2">Inclus : {o.includes.join(", ")}</p>
                )}
                {o.excludes.length > 0 && (
                  <p className="dk-secondaire">Non inclus : {o.excludes.join(", ")}</p>
                )}
                <Prix
                  montant={o.price_ar}
                  base={o.pax ? `pour ${o.pax} personne${o.pax > 1 ? "s" : ""}` : o.price_unit}
                  className="mt-3"
                />
                <div className="mt-3 flex gap-2">
                  <button className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Accepter
                  </button>
                  <button className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-input text-sm font-semibold">
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    Discuter
                  </button>
                  <button
                    aria-label="Refuser"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-input"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icone={Inbox}
            manque={
              projet
                ? "Aucune proposition pour l'instant."
                : "Vous n'avez pas encore de projet ouvert."
            }
            action={
              projet
                ? { libelle: "Voir les agences", lien: "/recherche?cat=agence_voyage" }
                : { libelle: "Décrire mon voyage", onClick: () => window.scrollTo({ top: 0, behavior: "smooth" }) }
            }
            contenuReel={
              <p className="dk-secondaire leading-relaxed">
                Diako compte aujourd'hui 54 établissements publiés, tous autour
                d'Ampefy. Les propositions arriveront à mesure que les agences
                s'inscrivent. Cinq au maximum par professionnel : personne ne
                pourra saturer votre projet.
              </p>
            }
          />
        )}

        <p className="dk-secondaire leading-relaxed">
          Aucune réservation en ligne, aucune date bloquée, aucun paiement.{" "}
          <Link to="/cgu" className="underline underline-offset-4">
            Conditions
          </Link>
        </p>
      </aside>
    </div>
  );
}

const champ = "min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-[16px]";

function Bloc({
  titre,
  aide,
  children,
}: {
  titre: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="dk-etiquette">{titre}</h2>
      {aide && <p className="dk-secondaire mt-0.5">{aide}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function RecapProjet({ projet }: { projet: ProjetType }) {
  return (
    <section className="mt-5 rounded-2xl border border-primary/30 bg-card p-5">
      <p className="dk-etiquette">Votre projet est ouvert</p>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {projet.envies.map((e) => (
          <li
            key={e}
            className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
          >
            envie : {e}
          </li>
        ))}
      </ul>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <Ligne t="Dates">
          {projet.date_from
            ? `${projet.date_from}${projet.date_to ? ` → ${projet.date_to}` : ""}${
                projet.date_flex_days ? ` (± ${projet.date_flex_days} j)` : ""
              }`
            : "à définir"}
        </Ligne>
        <Ligne t="Voyageurs">
          {projet.adults} adulte{projet.adults > 1 ? "s" : ""}
          {projet.children_ages.length
            ? ` · enfants de ${projet.children_ages.join(", ")} ans`
            : ""}
        </Ligne>
        <Ligne t="Budget">
          {projet.budget_ar != null ? ariary(projet.budget_ar) : "non communiqué"}
        </Ligne>
        <Ligne t="Ouvert depuis">
          {new Date(projet.created_at).toLocaleDateString("fr-FR")}
        </Ligne>
      </dl>
      {projet.notes && <p className="dk-corps mt-3 text-muted-foreground">{projet.notes}</p>}
    </section>
  );
}

function Ligne({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="dk-secondaire">{t}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
