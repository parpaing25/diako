import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, MapPin, MessageCircleQuestion, Send, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ariary } from "@/lib/etablissements";
import { cn } from "@/lib/utils";

/**
 * L'agent Diako — la bulle de conversation du site.
 *
 * Même dispositif que sur le projet frère, avec sa leçon principale : **les
 * faits viennent de la base, le modèle ne sert qu'à la langue**. Ce composant
 * ne fait donc aucune supposition ; il affiche ce que la fonction `agent-diako`
 * lui rend, et les établissements sont montrés en CARTES cliquables plutôt que
 * noyés dans le texte — un numéro de téléphone qu'on peut composer d'un doigt
 * vaut mieux qu'un numéro dans un paragraphe.
 *
 * L'identifiant anonyme est stable et local : il porte la mémoire de la
 * conversation (« et à Majunga ? » hérite de la catégorie cherchée juste
 * avant) sans jamais demander de compte.
 */

interface Etablissement {
  nom: string;
  slug: string;
  url: string;
  destination: string | null;
  repere: string | null;
  resume: string | null;
  telephone: string | null;
  whatsapp: string | null;
  prix_a_partir_de_ar: number | null;
  unite: string | null;
  equipements: string[];
  note: number | null;
  nb_avis: number;
}

interface Bulle {
  de: "moi" | "diako";
  texte: string;
  etablissements?: Etablissement[];
}

const EXEMPLES = [
  "Un hôtel à Ampefy avec piscine, moins de 150 000 Ar",
  "Un itinéraire dans le Sud par la RN7",
  "Comment aller à Ampefy depuis Tana ?",
  "Où manger du ravitoto ?",
];

/** Identifiant local et stable : il porte la mémoire, pas l'identité. */
function idAnonyme(): string {
  const cle = "diako_agent_uid";
  let v = localStorage.getItem(cle);
  if (!v) {
    v = `anon:${crypto.randomUUID()}`;
    localStorage.setItem(cle, v);
  }
  return v;
}

export function AgentDiako() {
  const [ouvert, setOuvert] = useState(false);
  const [bulles, setBulles] = useState<Bulle[]>([]);
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  const historique = useRef<{ role: string; content: string }[]>([]);

  useEffect(() => {
    if (ouvert) fin.current?.scrollIntoView({ behavior: "smooth" });
  }, [bulles, ouvert]);

  // Échap ferme le panneau : geste attendu, et ça évite de piéger le clavier.
  useEffect(() => {
    if (!ouvert) return;
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    document.addEventListener("keydown", auClavier);
    return () => document.removeEventListener("keydown", auClavier);
  }, [ouvert]);

  const envoyer = useCallback(async (texte: string) => {
    const t = texte.trim();
    if (!t || enCours) return;

    setBulles((b) => [...b, { de: "moi", texte: t }]);
    setSaisie("");
    setEnCours(true);

    try {
      const { data, error } = await supabase.functions.invoke("agent-diako", {
        body: { message: t, userId: idAnonyme(), history: historique.current.slice(-8) },
      });
      if (error) throw error;

      const reponse = String(data?.reply ?? "").trim();
      historique.current = [
        ...historique.current,
        { role: "user", content: t },
        { role: "assistant", content: reponse },
      ].slice(-10);

      setBulles((b) => [
        ...b,
        {
          de: "diako",
          texte:
            reponse ||
            "Je n'ai pas bien compris. Reformulez en une phrase — une destination, un type d'établissement, un budget.",
          etablissements: Array.isArray(data?.etablissements) ? data.etablissements : undefined,
        },
      ]);
    } catch {
      setBulles((b) => [
        ...b,
        {
          de: "diako",
          texte:
            "Je n'arrive pas à joindre le service pour l'instant. Réessayez dans un moment — ou passez par la recherche, qui marche sans moi.",
        },
      ]);
    } finally {
      setEnCours(false);
    }
  }, [enCours]);

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        aria-label="Demander à l'agent Diako"
        className="fixed bottom-20 right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105 lg:bottom-6"
      >
        <Sparkles className="h-6 w-6" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(680px,85dvh)] sm:w-[420px] sm:rounded-2xl sm:border sm:border-border sm:shadow-2xl">
      <div className="flex items-center gap-2 border-b border-border bg-primary px-4 py-3 text-primary-foreground sm:rounded-t-2xl">
        <Sparkles className="h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">Agent Diako</p>
          <p className="text-xs text-primary-foreground/80">
            Où dormir, où manger, quel itinéraire
          </p>
        </div>
        <button
          onClick={() => setOuvert(false)}
          aria-label="Fermer"
          className="dk-tap grid h-9 w-9 place-items-center rounded-full hover:bg-white/15"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain bg-background px-4 py-4">
        {bulles.length === 0 && (
          <div>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary">
              <MessageCircleQuestion className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <p className="mt-3 font-medium">Posez votre question</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Je réponds avec ce qui est réellement référencé sur Diako. Quand je
              n'ai pas l'information, je le dis — je préfère ça à une réponse
              inventée.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {EXEMPLES.map((e) => (
                <button
                  key={e}
                  onClick={() => void envoyer(e)}
                  className="rounded-xl border border-border px-3 py-2.5 text-left text-sm hover:bg-muted"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {bulles.map((b, i) => (
            <div key={i}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  b.de === "moi"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                )}
              >
                {b.texte}
              </div>

              {/* Les établissements en cartes : le téléphone doit être
                  composable d'un doigt, pas recopié depuis un paragraphe. */}
              {b.etablissements && b.etablissements.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {b.etablissements.map((e) => (
                    <li key={e.slug} className="rounded-xl border border-border p-3">
                      <Link to={e.url} onClick={() => setOuvert(false)} className="block">
                        <p className="font-medium leading-tight">{e.nom}</p>
                        {e.destination && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {e.destination}
                          </p>
                        )}
                        {e.prix_a_partir_de_ar != null && (
                          <p className="mt-1 text-sm">
                            <span className="font-semibold text-primary">
                              {ariary(e.prix_a_partir_de_ar)}
                            </span>{" "}
                            <span className="text-xs text-muted-foreground">
                              {e.unite === "nuit" ? "la nuit" : e.unite === "plat" ? "le plat" : ""}
                            </span>
                          </p>
                        )}
                        {e.equipements.length > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {e.equipements.slice(0, 4).join(" · ")}
                          </p>
                        )}
                      </Link>
                      {e.telephone && (
                        <a
                          href={`tel:${e.telephone.replace(/\s/g, "")}`}
                          className="mt-2 inline-flex min-h-9 items-center rounded-full bg-secondary px-3 text-xs font-medium text-primary"
                        >
                          Appeler {e.telephone}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {enCours && (
            <div className="inline-flex items-center gap-2 rounded-2xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Je cherche…
            </div>
          )}
        </div>
        <div ref={fin} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void envoyer(saisie);
        }}
        className="flex items-center gap-2 border-t border-border bg-background px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:rounded-b-2xl sm:pb-3"
      >
        <label htmlFor="agent-saisie" className="sr-only">
          Votre question
        </label>
        <input
          id="agent-saisie"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder="Un hôtel, une table, un itinéraire…"
          maxLength={500}
          enterKeyHint="send"
          className="h-11 w-full min-w-0 rounded-full border border-input bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={!saisie.trim() || enCours}
          aria-label="Envoyer"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
        >
          <Send className="h-5 w-5" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
