import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Bookmark,
  Flag,
  Heart,
  SmilePlus,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Send,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getThumbUrl } from "@/lib/imageThumb";
import { Carrousel } from "@/components/Carrousel";
import { cn } from "@/lib/utils";

/** Les six reactions de la maquette. « J'y vais » et « bon prix » disent des
 *  choses qu'un coeur ne dit pas — et ce sont elles qui nourrissent le
 *  classement du fil. Les codes sont ceux ecrits en base. */
const REACTIONS = [
  { code: "jaime", label: "J'aime" },
  { code: "utile", label: "Utile" },
  { code: "beau", label: "Beau" },
  { code: "jy_vais", label: "J'y vais" },
  { code: "bon_prix", label: "Bon prix" },
  { code: "prudence", label: "Prudence" },
] as const;
import {
  basculerFavori,
  basculerReaction,
  chargerCommentaires,
  commenter,
  signaler,
  supprimerPost,
  type Commentaire,
  type Post,
} from "@/lib/api";

function ilYA(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 604800) return `il y a ${Math.floor(s / 86400)} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

const SEUIL_TEXTE = 180;

/**
 * Publication — mise en page façon Instagram.
 *
 * L'image d'abord, en grand, bord à bord sur téléphone. Le texte vient
 * ENSUITE et se replie au-delà de quelques lignes : sur un récit de voyage de
 * 2 000 caractères, tout afficher noierait la photo et rendrait le défilement
 * interminable.
 */
export function PostCard({
  post,
  onSupprime,
}: {
  post: Post;
  onSupprime?: (id: string) => void;
}) {
  const { user } = useAuth();
  const [reaction, setReaction] = useState<string | null>(post.ma_reaction);
  const [nbReactions, setNbReactions] = useState(post.reactions_count);
  const [favori, setFavori] = useState(post.enregistre);
  const [nbCommentaires, setNbCommentaires] = useState(post.comments_count);
  const [deplie, setDeplie] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [commentaires, setCommentaires] = useState<Commentaire[]>([]);
  const [saisie, setSaisie] = useState("");
  const [menu, setMenu] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const connecte = () => {
    if (!user) {
      toast("Connexion requise", { description: "Créez un compte pour participer." });
      return false;
    }
    return true;
  };

  // ⚠ SIX REACTIONS, PAS UNE. Le modele les portait deja (`reactions.type`)
  //   mais l'interface n'envoyait jamais que « jaime » : cinq colonnes de
  //   nuance ecrites en base et jamais utilisees. Sur un site de voyage
  //   « j'y vais » et « bon prix » disent des choses qu'un coeur ne dit pas —
  //   et ce sont ces signaux qui alimentent le classement du fil.
  const [choixOuvert, setChoixOuvert] = useState(false);

  // ⚠ L'animation ne se rejoue pas si la classe reste posee : on la retire au
  //   bout de son temps, sinon le deuxieme clic ne montre rien.
  const [pulseCoeur, setPulseCoeur] = useState(false);
  const [pulseSignet, setPulseSignet] = useState(false);

  async function reagir(type = "jaime") {
    if (!connecte()) return;
    const avant = reaction;
    // Toucher la meme reaction la retire ; en toucher une autre la remplace.
    const vise = avant === type ? null : type;
    setReaction(vise);
    setNbReactions((n) => n + (avant ? (vise ? 0 : -1) : 1));
    setChoixOuvert(false);
    try {
      const nouvelle = await basculerReaction(post.id, type);
      setReaction(nouvelle);
      if (nouvelle) {
        setPulseCoeur(true);
        window.setTimeout(() => setPulseCoeur(false), 520);
      }
    } catch {
      setReaction(avant);
      setNbReactions((n) => n + (avant ? 1 : -1));
      toast.error("La réaction n'a pas pu être enregistrée.");
    }
  }

  async function enregistrer() {
    setPulseSignet(true);
    window.setTimeout(() => setPulseSignet(false), 460);
    if (!connecte()) return;
    const avant = favori;
    setFavori(!avant);
    try {
      setFavori(await basculerFavori(post.id, avant));
    } catch {
      setFavori(avant);
      toast.error("Impossible d'enregistrer.");
    }
  }

  async function ouvrirCommentaires() {
    const suivant = !ouvert;
    setOuvert(suivant);
    if (suivant && commentaires.length === 0) {
      try {
        setCommentaires(await chargerCommentaires(post.id));
      } catch {
        toast.error("Les commentaires n'ont pas pu être chargés.");
      }
    }
  }

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (!connecte() || !saisie.trim() || envoi) return;
    setEnvoi(true);
    try {
      await commenter(post.id, saisie);
      setSaisie("");
      setCommentaires(await chargerCommentaires(post.id));
      setNbCommentaires((n) => n + 1);
    } catch {
      toast.error("Le commentaire n'a pas pu être publié.");
    } finally {
      setEnvoi(false);
    }
  }

  async function partager() {
    const url = `${window.location.origin}/post/${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Diako", text: post.body?.slice(0, 100) ?? "", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Lien copié");
      }
    } catch {
      /* partage annulé */
    }
  }

  const estMien = user?.id === post.author.id;
  const texte = post.body ?? "";
  const long = texte.length > SEUIL_TEXTE;
  const visible = deplie || !long ? texte : texte.slice(0, SEUIL_TEXTE).trimEnd() + "…";
  const nom = post.author.name || "Membre Diako";

  return (
    <article className="dk-reveal dk-carte border-b border-border bg-card pb-2 md:rounded-2xl md:border">
      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 py-3">
        <Link
          to={`/user/${post.author.id}`}
          className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary-soft text-xs font-semibold text-primary-foreground"
        >
          {post.author.avatar ? (
            <img src={getThumbUrl(post.author.avatar)} alt="" width={36} height={36} className="h-9 w-9 object-cover" />
          ) : (
            nom.slice(0, 1).toUpperCase()
          )}
        </Link>

        <div className="min-w-0 flex-1 leading-tight">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Link to={`/user/${post.author.id}`} className="truncate hover:underline">
              {nom}
            </Link>
            {post.author.verification !== "none" && (
              <span className="shrink-0 text-primary" title="Compte vérifié" aria-label="vérifié">
                ✓
              </span>
            )}
          </p>
          {post.place && (
            <Link
              to={`/recherche?q=${encodeURIComponent(post.place)}`}
              className="flex items-center gap-0.5 text-xs text-muted-foreground hover:underline"
            >
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {post.place}
            </Link>
          )}
        </div>

        <div className="relative shrink-0">
          <button
            onClick={() => setMenu((v) => !v)}
            aria-label="Options"
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
          {menu && (
            <>
              <button className="fixed inset-0 z-10 cursor-default" aria-hidden="true" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-9 z-20 w-48 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                {estMien ? (
                  <button
                    onClick={async () => {
                      setMenu(false);
                      try {
                        await supprimerPost(post.id);
                        onSupprime?.(post.id);
                        toast.success("Publication supprimée");
                      } catch {
                        toast.error("Suppression impossible.");
                      }
                    }}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-destructive hover:bg-destructive/5"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" /> Supprimer
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      setMenu(false);
                      if (!connecte()) return;
                      try {
                        await signaler("post", post.id, "signalement depuis le fil");
                        toast.success("Signalement envoyé");
                      } catch {
                        toast.error("Le signalement n'a pas pu être envoyé.");
                      }
                    }}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-muted"
                  >
                    <Flag className="h-4 w-4" aria-hidden="true" /> Signaler
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── L'image, en grand ───────────────────────────────────────────── */}
      {post.media?.length > 0 && (
        <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
          <Carrousel
            images={post.media}
            alt={post.place ? `${post.place}, Madagascar` : nom}
          />
        </div>
      )}

      {/* ── Actions, juste sous la photo ────────────────────────────────── */}
      <div className="flex items-center gap-1 px-2 pt-2">
        <button
          onClick={() => void reagir()}
          onContextMenu={(e) => {
            e.preventDefault();
            setChoixOuvert((o) => !o);
          }}
          aria-pressed={!!reaction}
          aria-label="J'aime"
          className={cn(
            "relative grid h-10 w-10 place-items-center rounded-full hover:bg-muted",
            reaction ? "text-accent" : "text-foreground",
            pulseCoeur && "dk-halo"
          )}
        >
          <Heart
            className={cn("h-6 w-6", reaction && "fill-current", pulseCoeur && "dk-coeur-actif")}
            aria-hidden="true"
          />
        </button>
        <button
          onClick={() => setChoixOuvert((o) => !o)}
          aria-expanded={choixOuvert}
          aria-label="Choisir une réaction"
          className="grid h-10 w-10 place-items-center rounded-full text-foreground hover:bg-muted"
        >
          <SmilePlus className="h-6 w-6" aria-hidden="true" />
        </button>
        <button
          onClick={ouvrirCommentaires}
          aria-label="Commenter"
          className="grid h-10 w-10 place-items-center rounded-full text-foreground transition hover:bg-muted"
        >
          <MessageCircle className="h-6 w-6" aria-hidden="true" />
        </button>
        <button
          onClick={partager}
          aria-label="Partager"
          className="grid h-10 w-10 place-items-center rounded-full text-foreground transition hover:bg-muted"
        >
          <Send className="h-6 w-6" aria-hidden="true" />
        </button>
        <button
          onClick={enregistrer}
          aria-pressed={favori}
          aria-label="Enregistrer"
          className={cn(
            "ml-auto grid h-10 w-10 place-items-center rounded-full hover:bg-muted",
            favori ? "text-primary" : "text-foreground"
          )}
        >
          <Bookmark
            className={cn("h-6 w-6", favori && "fill-current", pulseSignet && "dk-signet-actif")}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* ⚠ LES SIX NUANCES DE LA MAQUETTE. Elles ne remplacent pas le coeur :
          un appui simple aime, un appui long ouvre le choix. Imposer six
          boutons a tout le monde ralentirait le geste le plus frequent du
          site, alors que la nuance n'interesse qu'une partie des lecteurs. */}
      {choixOuvert && (
        <div className="dk-scale-in flex flex-wrap gap-1.5 px-2 pt-2">
          {REACTIONS.map((r) => (
            <button
              key={r.code}
              onClick={() => void reagir(r.code)}
              aria-pressed={reaction === r.code}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold",
                reaction === r.code
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:border-primary hover:text-primary"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Compteur + texte ────────────────────────────────────────────── */}
      <div className="px-4">
        {nbReactions > 0 && (
          <p className="text-sm font-semibold">
            {nbReactions} j'aime
          </p>
        )}

        {texte && (
          <p className="mt-1 max-w-[68ch] whitespace-pre-line text-sm leading-relaxed">
            <Link to={`/user/${post.author.id}`} className="font-semibold hover:underline">
              {nom}
            </Link>{" "}
            {visible}
            {long && !deplie && (
              <button
                onClick={() => setDeplie(true)}
                className="ml-1 text-muted-foreground hover:underline"
              >
                plus
              </button>
            )}
          </p>
        )}

        {post.dish && (
          <Link
            to={`/recherche?q=${encodeURIComponent(post.dish)}`}
            className="mt-2 inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"
          >
            <UtensilsCrossed className="h-3 w-3 text-accent" aria-hidden="true" />
            {post.dish}
          </Link>
        )}

        {nbCommentaires > 0 && !ouvert && (
          <button
            onClick={ouvrirCommentaires}
            className="mt-1 block text-sm text-muted-foreground hover:underline"
          >
            Voir les {nbCommentaires} commentaire{nbCommentaires > 1 ? "s" : ""}
          </button>
        )}

        <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          {ilYA(post.created_at)}
        </p>
      </div>

      {/* ── Commentaires ────────────────────────────────────────────────── */}
      {ouvert && (
        <div className="mt-3 border-t border-border px-4 pt-3">
          {commentaires.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun commentaire. Soyez le premier à répondre.
            </p>
          ) : (
            <ul className="space-y-3">
              {commentaires.map((c) => (
                <li key={c.id} className="flex gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-xs font-semibold">
                    {c.auteur.avatar ? (
                      <img src={getThumbUrl(c.auteur.avatar)} alt="" width={32} height={32} className="h-8 w-8 object-cover" />
                    ) : (
                      (c.auteur.name || "?").slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-semibold">{c.auteur.name || "Membre"}</span>{" "}
                      {c.body}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{ilYA(c.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {user && (
            <form onSubmit={envoyer} className="mt-3 flex items-center gap-2">
              <label htmlFor={`c-${post.id}`} className="sr-only">
                Écrire un commentaire
              </label>
              <input
                id={`c-${post.id}`}
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                placeholder="Ajouter un commentaire…"
                maxLength={2000}
                className="h-10 min-w-0 flex-1 rounded-full bg-muted px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="submit"
                disabled={!saisie.trim() || envoi}
                className="shrink-0 text-sm font-semibold text-primary disabled:opacity-40"
              >
                Publier
              </button>
            </form>
          )}
        </div>
      )}
    </article>
  );
}
