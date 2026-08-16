import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getThumbUrl } from "@/lib/imageThumb";
import { SITE } from "@/lib/jsonld";

/**
 * ⚠ `page_gestionnaires` N'EST PAS DANS `types.ts`. La migration 0076 a créé la
 *   table sans que les types soient régénérés, et `types.ts` reste hors du
 *   périmètre de ce chantier. On déclare donc la table ICI, une seule fois,
 *   avec ses vraies colonnes — plutôt que de semer des `as any` de fichier en
 *   fichier, ce que l'entête de `types.ts` interdit explicitement (« chaque
 *   contournement est un bug futur »). Une déclaration locale garde le
 *   contrôle des colonnes ; le jour où les types seront régénérés, ce bloc et
 *   `base` disparaissent sans qu'une seule requête change.
 */
type SchemaCogestion = {
  public: {
    Tables: {
      page_gestionnaires: {
        Row: { page_id: string; user_id: string; ajoute_par: string | null; ajoute_le: string };
        Insert: {
          page_id: string;
          user_id: string;
          ajoute_par?: string | null;
          ajoute_le?: string;
        };
        Update: {
          page_id?: string;
          user_id?: string;
          ajoute_par?: string | null;
          ajoute_le?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

const base = supabase as unknown as SupabaseClient<SchemaCogestion>;

/** L'identifiant de compte est un UUID : celui qu'on lit dans `/user/<id>`. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Ce qu'on accepte dans le champ d'invitation.
 *
 * ⚠ ON ACCEPTE LE LIEN ENTIER, pas seulement l'identifiant nu. Personne ne
 *   recopie un UUID à la main sans se tromper d'un caractère : ce qu'on
 *   s'envoie par WhatsApp, c'est l'adresse du profil. On y pêche l'identifiant
 *   plutôt que de renvoyer « format invalide » à quelqu'un qui a collé
 *   exactement ce qu'on lui a demandé.
 */
function identifiantDe(saisie: string): string | null {
  const trouve = saisie.trim().match(UUID);
  return trouve ? trouve[0].toLowerCase() : null;
}

function leJour(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

interface Gestionnaire {
  user_id: string;
  ajoute_le: string;
  /** `null` quand le profil n'est pas lisible — voir `chargerGestionnaires`. */
  nom: string | null;
  avatar: string | null;
}

/**
 * « EST-CE QUE JE GÈRE CETTE PAGE ? », posée une fois, au chargement.
 *
 * 🔴 SANS CETTE QUESTION, LA CO-GESTION N'EXISTAIT QUE DANS LA BASE. La console
 *    comparait `owner_id` à l'utilisateur courant : un gestionnaire nommé en
 *    bonne et due forme était éconduit exactement comme un inconnu, alors que
 *    la RLS lui accordait déjà tout — chambres, carte, activités, circuits.
 *
 * ⚠ ON NE DEMANDE QUE SA PROPRE LIGNE. La policy `pg_lecture` n'ouvre la liste
 *   complète qu'au propriétaire ; un gestionnaire qui interrogerait la table
 *   sans filtre recevrait une liste d'une seule ligne — la sienne — et en
 *   conclurait qu'il gère seul.
 *
 * ⚠ EN CAS D'ERREUR ON RÉPOND « NON ». Un réseau qui tombe ne doit pas ouvrir
 *   un formulaire d'édition : la RLS refuserait l'enregistrement, et la
 *   promesse d'écran serait tenue par personne.
 */
// eslint-disable-next-line react-refresh/only-export-components
export async function jeGereCettePage(pageId: string, userId: string): Promise<boolean> {
  const { data, error } = await base
    .from("page_gestionnaires")
    .select("user_id")
    .eq("page_id", pageId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return data !== null;
}

/**
 * La liste des gestionnaires d'une page, avec les noms quand ils sont lisibles.
 *
 * ⚠ LE NOM PEUT MANQUER, ET CE N'EST PAS UNE PANNE. Depuis 0073, un profil
 *   n'est lisible que s'il s'est déjà exprimé publiquement (récit, avis,
 *   commentaire, fiche publiée). Le cuisinier qu'on vient de nommer n'a peut-
 *   être jamais rien publié : sa ligne existe, son nom non. On affiche alors
 *   son identifiant abrégé plutôt que d'inventer un libellé.
 *
 * ⚠ DEUX REQUÊTES, PAS UNE JOINTURE IMBRIQUÉE : `page_gestionnaires` porte
 *   DEUX clés étrangères vers `profiles` (`user_id` et `ajoute_par`), et une
 *   imbrication PostgREST ambiguë part en erreur 300.
 */
async function chargerGestionnaires(pageId: string): Promise<Gestionnaire[]> {
  const { data, error } = await base
    .from("page_gestionnaires")
    .select("user_id, ajoute_le")
    .eq("page_id", pageId)
    .order("ajoute_le", { ascending: true })
    .limit(100);
  if (error) throw error;

  const lignes = data ?? [];
  if (lignes.length === 0) return [];

  const { data: profils } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in(
      "id",
      lignes.map((l) => l.user_id)
    );
  const parId = new Map((profils ?? []).map((p) => [p.id, p]));

  return lignes.map((l) => {
    const p = parId.get(l.user_id);
    return {
      user_id: l.user_id,
      ajoute_le: l.ajoute_le,
      nom: p?.display_name ?? null,
      avatar: p?.avatar_url ?? null,
    };
  });
}

/** Ce que la base répond quand l'invitation échoue, traduit pour un gérant. */
function pourquoiRefuse(code: string | undefined): string {
  if (code === "23503") return "Cet identifiant ne correspond à aucun compte Diako.";
  if (code === "23505") return "Cette personne gère déjà cette page.";
  if (code === "22P02") return "Cet identifiant n'a pas la bonne forme.";
  return "L'invitation a été refusée.";
}

/**
 * LA CO-GESTION D'UNE PAGE : qui la gère, qui on ajoute, qui on retire.
 *
 * La migration 0076 avait tout posé côté base — table, policies, et surtout
 * `page_a_moi()` que vingt-neuf policies interrogent déjà. Il manquait
 * l'écran : aucun moyen d'inviter, de lister ni de retirer qui que ce soit.
 *
 * ⚠ ON INVITE PAR IDENTIFIANT DE COMPTE, ET C'EST IMPOSÉ PAR 0073. Les profils
 *   ne sont plus énumérables : il n'existe aucune façon d'obtenir la liste des
 *   membres, donc aucune liste déroulante possible — et c'est voulu, c'est ce
 *   qui empêche d'aspirer le fichier des inscrits. Rechercher par nom
 *   demanderait une fonction dédiée côté base, qui n'existe pas. Reste ce que
 *   0076 avait prévu : la personne ouvre son profil, envoie le lien, le
 *   propriétaire le colle ici.
 *
 * ⚠ SEUL LE PROPRIÉTAIRE NOMME ET RÉVOQUE (policy `pg_proprietaire`). Le mode
 *   lecture seule existe pour ne pas afficher des boutons que la base
 *   refuserait — mais ProConsole ne monte ce panneau QUE pour le propriétaire,
 *   parce qu'un gestionnaire ne voit de toute façon que sa propre ligne
 *   (`pg_lecture`) : une liste d'une seule personne se lit comme une panne.
 *
 * ⚠ LE PROPRIÉTAIRE N'ENTRE PAS DANS CETTE LISTE. Il gère de droit, et une
 *   page dont le propriétaire se serait retiré n'a plus personne pour nommer
 *   qui que ce soit — elle est irrécupérable sans intervention manuelle.
 */
export function Cogestion({
  pageId,
  proprietaireId,
  estProprietaire,
}: {
  pageId: string;
  proprietaireId: string | null;
  estProprietaire: boolean;
}) {
  const [liste, setListe] = useState<Gestionnaire[] | null>(null);
  const [saisie, setSaisie] = useState("");
  const [envoi, setEnvoi] = useState(false);
  /** L'identifiant en cours de retrait, pour n'occuper que SA ligne. */
  const [retrait, setRetrait] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    try {
      setListe(await chargerGestionnaires(pageId));
    } catch {
      setListe([]);
      toast.error("La liste des gestionnaires n'a pas pu être lue.");
    }
  }, [pageId]);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  async function inviter() {
    const id = identifiantDe(saisie);
    if (!id) {
      toast.error("Collez le lien du profil, ou l'identifiant qu'il contient.");
      return;
    }
    // ⚠ Le propriétaire gère de droit : l'inscrire ici lui ferait croire qu'il
    //   peut se retirer de sa propre page.
    if (id === proprietaireId) {
      toast.error("Vous êtes le propriétaire : vous gérez cette page de droit.");
      return;
    }
    setEnvoi(true);
    try {
      // ⚠ JAMAIS `.single()` EN ÉCRITURE, et on vérifie que la ligne revient :
      //   une policy qui refuse rend zéro ligne SANS erreur, et l'invitation
      //   passerait pour un succès.
      const { data, error } = await base
        .from("page_gestionnaires")
        .insert({ page_id: pageId, user_id: id, ajoute_par: proprietaireId })
        .select("user_id");
      if (error) throw new Error(pourquoiRefuse(error.code));
      if (!data || data.length === 0)
        throw new Error("L'invitation n'a pas été enregistrée. Êtes-vous bien le propriétaire ?");
      setSaisie("");
      toast.success("Gestionnaire ajouté.", {
        description: "Prévenez-le : Diako ne lui envoie pas de message.",
      });
      await recharger();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "L'invitation a échoué.");
    } finally {
      setEnvoi(false);
    }
  }

  async function retirer(g: Gestionnaire) {
    const qui = g.nom || "cette personne";
    if (!confirm(`Retirer ${qui} de la gestion de cette page ?`)) return;
    setRetrait(g.user_id);
    try {
      const { data, error } = await base
        .from("page_gestionnaires")
        .delete()
        .eq("page_id", pageId)
        .eq("user_id", g.user_id)
        .select("user_id");
      if (error) throw error;
      if (!data || data.length === 0)
        throw new Error("Le retrait n'a pas eu lieu. Êtes-vous bien le propriétaire ?");
      toast.success("Gestionnaire retiré.");
      await recharger();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Le retrait a échoué.");
    } finally {
      setRetrait(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
        Qui gère cette page
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Le propriétaire reste unique. Les gestionnaires tiennent les chambres, la
        carte, les activités, les circuits et répondent aux demandes — ils ne
        peuvent ni céder la page, ni nommer quelqu'un d'autre.
      </p>

      {liste === null ? (
        <div className="mt-3 space-y-2">
          <div className="dk-skeleton h-10 w-full rounded-xl" />
          <div className="dk-skeleton h-10 w-2/3 rounded-xl" />
        </div>
      ) : liste.length === 0 ? (
        <p className="mt-3 rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
          Vous gérez seul pour l'instant.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
          {liste.map((g) => {
            /* Une ligne posée à la main sur le propriétaire lui-même : on
               l'affiche pour ce qu'elle est, sans bouton de retrait. */
            const cestLeProprietaire = g.user_id === proprietaireId;
            return (
              <li key={g.user_id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary">
                  {g.avatar ? (
                    <img
                      src={getThumbUrl(g.avatar)}
                      alt=""
                      width={36}
                      height={36}
                      className="h-9 w-9 object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-muted-foreground">
                      {(g.nom || "?").slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {/* ⚠ Pas de nom inventé : l'identifiant abrégé suffit à
                        reconnaître la ligne qu'on vient d'ajouter. */}
                    {g.nom || `Compte ${g.user_id.slice(0, 8)}`}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {cestLeProprietaire
                      ? "Propriétaire"
                      : `Gestionnaire depuis le ${leJour(g.ajoute_le)}`}
                  </span>
                </span>

                {estProprietaire && !cestLeProprietaire && (
                  <button
                    type="button"
                    onClick={() => void retirer(g)}
                    disabled={retrait === g.user_id}
                    aria-label={`Retirer ${g.nom || "ce gestionnaire"}`}
                    className="dk-tap grid h-9 w-9 shrink-0 place-items-center rounded-full border border-input text-destructive disabled:opacity-50"
                  >
                    {retrait === g.user_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <UserMinus className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {estProprietaire ? (
        <div className="mt-4 border-t border-border pt-4">
          <label className="block text-sm font-medium" htmlFor="cogestion-id">
            Ajouter un gestionnaire
          </label>
          {/* ⚠ ON DIT OÙ TROUVER L'IDENTIFIANT. Sans cette phrase, le champ est
              une énigme : personne ne sait spontanément qu'un compte porte un
              identifiant, ni qu'il est dans l'adresse de son profil. */}
          <p className="mt-0.5 text-xs text-muted-foreground">
            Demandez-lui d'ouvrir son profil sur Diako et de vous envoyer le lien
            {/* 🔴 CE DOMAINE ÉTAIT INVENTÉ : « diako.mg » n'existe pas. Le site
                vit sur diako.fonenako.mg — décrire au propriétaire un lien qu'il
                ne recevra jamais lui fait croire qu'il s'est trompé de personne.
                On lit donc le domaine réel plutôt que d'en écrire un. */}
            (il ressemble à{" "}
            <code className="text-[0.7rem]">{new URL(SITE).host}/user/…</code>). Collez-le
            ici : la personne doit déjà avoir un compte.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              id="cogestion-id"
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              placeholder="Lien du profil, ou identifiant"
              autoComplete="off"
              spellCheck={false}
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
            />
            <button
              type="button"
              onClick={() => void inviter()}
              disabled={envoi || !saisie.trim()}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {envoi ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <UserPlus className="h-4 w-4" aria-hidden="true" />
              )}
              Ajouter
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Seul le propriétaire peut ajouter ou retirer un gestionnaire.
        </p>
      )}
    </section>
  );
}
