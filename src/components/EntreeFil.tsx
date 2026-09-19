import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, ChevronRight, Compass, MapPin, MessageCircle, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useConnexionRequise } from "@/hooks/useConnexionRequise";
import { useVu } from "@/hooks/useVu";
import { noterLieu } from "@/lib/affinites";
import { PartagerMenu } from "@/components/PartagerMenu";
import { Carrousel } from "@/components/Carrousel";
import { ImageProgressive } from "@/components/ImageProgressive";
import { basculerFavori, basculerReaction, type Post } from "@/lib/api";
import { gabarit, ratioDe } from "@/lib/gabaritPhotos";
import { decouperRecit } from "@/lib/recit";
import { adoucirCapitales } from "@/lib/casse";
import { provenanceCourte } from "@/lib/provenance";
import { cn } from "@/lib/utils";

/**
 * UNE ENTRÉE DU FIL — le fil v5 (maquette `docs/design/fil-v5.html`).
 *
 * 🔴 CE QUE ÇA REMPLACE, ET POURQUOI. Le fil précédent donnait tout l'écran à
 *    une photo : un créneau de 390 × 788 px CSS, soit 780 × 1576 pixels réels,
 *    pour des photos qui font 590 × 443. En `object-fit: cover` cela faisait
 *    **3,56× d'agrandissement et 33 % de la photo encore visible** — c'est
 *    exactement ce qu'Andry décrivait le 06/09/2026 : « les images se zooment
 *    et se pixellisent ». Ce n'était pas un réglage à corriger : c'est ce que
 *    produit un créneau PORTRAIT plein écran appliqué à un corpus PAYSAGE
 *    (424 photos sur 500, largeur médiane 590 px, recomptées en base).
 *
 * LES QUATRE DÉCISIONS, dans l'ordre où elles se voient à l'écran :
 *
 *  1. LE LIEU EST LE TITRE, et toute la ligne mène à sa fiche. 213
 *     publications sur 213 portent un lieu : c'est la seule donnée structurée
 *     fiable du corpus, donc la seule promesse qu'on puisse tenir à chaque
 *     entrée.
 *  2. LE TEXTE PASSE AVANT LA PHOTO. Médiane du corpus : 323 caractères,
 *     moyenne 468. Ce n'est pas une légende, c'est une note de voyage : elle
 *     se lit. Cinq lignes ouvertes, le reste d'un geste.
 *  3. LA PHOTO PREND LE GABARIT QU'ELLE DICTE (voir `gabarit()` plus bas), et
 *     jamais l'inverse. C'est ce qui ramène l'agrandissement à 1,21× au pire
 *     et rend la photo entière.
 *  4. CE QUI CONVERTIT EST CE QUI EST FORT. « Ouvrir ce lieu » est un bloc
 *     pleine largeur ; « J'y suis allé » et « Répondre » restent discrets tant
 *     que le fil compte un auteur, neuf réactions et zéro commentaire.
 */

/* Le corps s'ouvre sur CINQ lignes (`line-clamp-5`), le reste d'un geste.
   Médiane du corpus : 323 caractères — replier à deux lignes ne montrerait
   souvent que la salutation d'ouverture, qui n'apprend rien du lieu. */

export function EntreeFil({
  post,
  prioritaire = false,
  onCommenter,
}: {
  post: Post;
  prioritaire?: boolean;
  onCommenter: (p: Post) => void;
}) {
  const { user } = useAuth();
  const [reaction, setReaction] = useState<string | null>(post.ma_reaction);
  const [nbReactions, setNbReactions] = useState(post.reactions_count);
  const [favori, setFavori] = useState(post.enregistre);
  const [deplie, setDeplie] = useState(false);
  const [partage, setPartage] = useState(false);
  const racine = useRef<HTMLElement>(null);
  const corpsRef = useRef<HTMLParagraphElement>(null);
  const [deborde, setDeborde] = useState(false);
  useVu(racine, post.id);
  const connecte = useConnexionRequise();
  const interesse = (poids: number) => noterLieu(post.place_slug ?? post.place, poids);

  const photos = useMemo(() => gabarit(post.media), [post.media]);

  async function reagir() {
    if (!connecte("dire que vous y êtes allé")) return;
    const avant = reaction;
    const delta = avant ? -1 : 1;
    setReaction(avant ? null : "utile");
    setNbReactions((n) => n + delta);
    if (!avant) interesse(3);
    try {
      /* ⚠ LE TYPE COURANT, PAS « utile » EN DUR — sinon retirer une réaction
         « Bon prix » la remplace par « utile » au lieu de l'effacer. */
      const nouvelle = await basculerReaction(post.id, avant ?? "utile");
      setReaction(nouvelle);
      setNbReactions((n) => n - delta + (avant ? (nouvelle ? 0 : -1) : nouvelle ? 1 : 0));
    } catch {
      setReaction(avant);
      setNbReactions((n) => n - delta);
    }
  }

  async function enregistrer() {
    if (!connecte("garder ce récit")) return;
    const avant = favori;
    setFavori(!avant);
    if (!avant) interesse(3);
    try {
      setFavori(await basculerFavori(post.id, avant));
    } catch {
      setFavori(avant);
    }
  }

  const nom = post.author.name || "Membre Diako";
  const lieu = post.place;

  /* 🔴 LE CORPS N'EST PAS DE LA PROSE, et l'afficher brut redisait le titre.
     `posts.body` est fabriqué ligne à ligne par le bot : une ligne 📍 qui
     répète le lieu et le nom de la page, la citation de l'auteur entre
     guillemets, puis prix, téléphone et provenance collés au pied. Le fil
     précédent montrait tout ce bloc tel quel — les deux lignes les plus
     précieuses de la carte servaient donc à répéter le titre qui est juste
     au-dessus. `decouperRecit` fait déjà ce travail sur /post/<id> et il est
     testé : on le réutilise plutôt que d'écrire un second nettoyeur.
     ⚠ `lieuConnu` vaut faux quand la publication n'a PAS de lieu : la ligne 📍
       est alors le seul endroit qui dit où l'on est, et elle passe en prose. */
  const blocs = useMemo(() => decouperRecit(post.body, { lieuConnu: !!post.place }), [post.body, post.place]);
  /* Un paragraphe par bloc : la citation de l'auteur d'abord, puis ce que
     le bot a ajouté. `whitespace-pre-line` rend la séparation visible.
     ⚠ LES PARAGRAPHES TOUT EN CAPITALES passent en casse de phrase, à
       l'affichage seulement (src/lib/casse.ts) ; le lieu et le plat, connus
       par leurs colonnes, retrouvent leur majuscule. */
  const texte = useMemo(
    () =>
      adoucirCapitales(
        [blocs.citation, ...blocs.prose].filter(Boolean).join("\n\n").trim(),
        [post.place, post.dish]
      ),
    [blocs, post.place, post.dish]
  );

  /* ⚠ ON MESURE LE DÉBORDEMENT, ON NE LE DEVINE PAS. Un seuil en caractères se
     trompe dans les deux sens : le malgache a des mots plus longs, et la
     largeur change avec l'écran. Un « Lire la suite » qui ne révèle rien use
     la confiance aussi sûrement qu'un texte coupé sans le dire.
     ⚠ APRÈS `texte` : dans le tableau de dépendances, une constante encore
       non déclarée casse le rendu entier (zone morte temporelle). */
  useEffect(() => {
    const el = corpsRef.current;
    if (!el || deplie) return;
    const mesurer = () => setDeborde(el.scrollHeight > el.clientHeight + 1);
    mesurer();
    if (typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(mesurer);
    obs.observe(el);
    return () => obs.disconnect();
  }, [texte, deplie]);
  const versLieu = post.place_slug
    ? `/lieu/${post.place_slug}`
    : lieu
      ? `/recherche?q=${encodeURIComponent(lieu)}`
      : null;

  /* ⚠ « page_name » N'EST PAS UN ÉTABLISSEMENT. C'est le nom de la page
     Facebook d'origine (« Dimanche le 30 août 2026 »). On le présente comme
     une provenance, jamais comme un hôtel ou un restaurant.
     🔴 SOUS LE TITRE, PLUS EN BAS (18/09/2026) : « X · JJ/MM · via Facebook ».
        En pied de carte, on lisait tout le récit avant de savoir qui parlait. */
  const provenance = provenanceCourte(blocs.source, post.page_name);

  /* 🔴 UN SEUL BADGE DE TYPE, CELUI QUI CHANGE QUELQUE CHOSE (18/09/2026).
        Chaque carte portait « RÉCIT », « AVIS », « PHOTO »… — le même mot sur
        213 cartes n'apprend rien, et le type est parfois faux (« AVIS » sur un
        concert). Seule l'alerte mérite d'arrêter l'œil. Jetons `warn` et non
        des couleurs écrites en dur : le mode sombre les inverse. */
  const estAlerte = post.kind === "alerte";

  /** Le créneau réel de la colonne, dit au navigateur pour qu'il choisisse. */
  const LARGEUR_PLEINE = "(min-width:768px) 620px, calc(100vw - 32px)";
  const LARGEUR_DUO = "(min-width:768px) 306px, calc((100vw - 34px) / 2)";
  const LARGEUR_PLANCHE = "(min-width:768px) 150px, calc((100vw - 38px) / 4)";

  return (
    <article
      ref={racine}
      className={cn("relative border-b border-border bg-card pb-3.5", !prioritaire && "dk-reveal")}
    >
      {partage && (
        <PartagerMenu
          url={`${window.location.origin}/post/${post.id}`}
          texte={texte || lieu || ""}
          onFermer={() => setPartage(false)}
        />
      )}

      {/* 🔴 TOUTE LA CARTE OUVRE LA PUBLICATION. Demande d'Andry du 07/09/2026 :
          « qu'on puisse cliquer toute la partie de la carte, et que ça entre
          dedans ». Ça répare aussi une perte du fil v5 : la nouvelle carte
          menait au LIEU, aux plats, aux commentaires — mais plus jamais au
          récit lui-même, là où vivent le texte entier, toutes les photos, le
          prix et le téléphone. Un test de bout en bout l'avait attrapé.

          ⚠ UN LIEN DE COUVERTURE, PAS UN <a> AUTOUR DE TOUT : des liens
            imbriqués sont invalides et cassent la navigation au clavier.
          ⚠ z-[1] ET NON z-0 : l'enveloppe d'`ImageProgressive` est
            `position: relative`, donc une couverture laissée à z-auto passerait
            DESSOUS les photos et un clic sur l'image ne ferait rien.
          ⚠ Un nom accessible explicite : sans lui, un lecteur d'écran annonce
            « lien » sans dire vers quoi. */}
      <Link
        to={`/post/${post.id}`}
        onClick={() => interesse(2)}
        aria-label={lieu ? `Ouvrir le récit — ${lieu}` : "Ouvrir le récit"}
        className="absolute inset-0 z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />

      {/* ── 1. LE LIEU, EN TITRE ET EN LIEN ─────────────────────────────── */}
      {versLieu ? (
        <Link
          to={versLieu}
          onClick={() => interesse(2)}
          className="relative z-10 flex min-h-[52px] items-center gap-2.5 px-4 pb-0.5 pt-1.5"
        >
          <MapPin className="h-[17px] w-[17px] shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[22px] font-bold leading-tight tracking-tight text-primary">
            {lieu}
          </span>
          <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : provenance ? (
        /* ⚠ SANS LIEU, PAS LE NOM DU COMPTE EN TITRE. Les publications collectées
           sont postées par le compte « Diako » : le titre disait donc « Diako »
           au-dessus du texte de Cyrille Cornu (19/09/2026). La provenance, juste
           dessous, nomme déjà la vraie personne. */
        <div className="pt-3" />
      ) : (
        <div className="flex min-h-[52px] items-center gap-2.5 px-4 pb-0.5 pt-1.5">
          <span className="min-w-0 flex-1 truncate text-[22px] font-bold leading-tight tracking-tight text-foreground">
            {nom}
          </span>
        </div>
      )}

      {/* Qui parle, sous le titre — et non plus en pied de carte. */}
      {provenance && (
        <p className="mx-4 mb-2 truncate text-[13px] leading-snug text-muted-foreground">
          {provenance}
        </p>
      )}

      {estAlerte && (
        <span className="mx-4 mb-2 inline-block rounded-full bg-warn-soft px-2.5 py-[3px] text-[11px] font-bold uppercase leading-normal tracking-[0.1em] text-warn">
          Alerte
        </span>
      )}

      {/* ── 2. LE TEXTE, AVANT LA PHOTO ─────────────────────────────────── */}
      {texte && (
        <>
          <p
            ref={corpsRef}
            className={cn(
              "mx-4 whitespace-pre-line text-[15px] leading-[1.62] text-foreground/90",
              !deplie && "line-clamp-5",
              !deplie && deborde ? "mb-1" : "mb-3"
            )}
          >
            {texte}
          </p>
          {/* ⚠ UN LIEN EN LIGNE, PAS UN BLOC DE 44 PX. La règle des 44 px porte
              sur la CIBLE : `dk-tap` la pose en ::after sans épaissir la carte.
              `min-h-0` défait le plancher de 44 px que index.css met à tous les
              boutons sous 640 px. */}
          {!deplie && deborde && (
            <button
              onClick={() => setDeplie(true)}
              className="dk-tap relative z-10 mx-4 mb-3 block min-h-0 text-sm font-semibold text-primary-fort hover:underline"
            >
              Lire la suite
            </button>
          )}
        </>
      )}

      {/* ── 3. LES PHOTOS, AU GABARIT QU'ELLES DICTENT ──────────────────── */}
      {photos.forme === "video" && (
        <div className="relative z-10 mx-4 mb-3 aspect-[3/2] overflow-hidden rounded-[10px]">
          <Carrousel
            images={photos.media}
            alt={lieu ? `${lieu}, Madagascar` : nom}
            prioritaire={prioritaire}
            ajustement="contenir"
            largeurAffichee={LARGEUR_PLEINE}
            alClic={null}
          />
        </div>
      )}

      {photos.forme === "une" && (
        <div
          className="mx-4 mb-3 overflow-hidden rounded-[10px] bg-muted"
          style={{ aspectRatio: ratioDe(photos.grande) }}
        >
          <ImageProgressive
            src={photos.grande.url}
            alt={lieu ? `${lieu}, Madagascar` : ""}
            w={photos.grande.w}
            h={photos.grande.h}
            prioritaire={prioritaire}
            ajustement="cover"
            largeurAffichee={LARGEUR_PLEINE}
          />
        </div>
      )}

      {photos.forme === "duo" && (
        <div
          className="mx-4 mb-3 grid grid-cols-2 gap-0.5 overflow-hidden rounded-[10px] bg-muted"
          style={{ aspectRatio: `${photos.ratio * 2}` }}
        >
          {[photos.a, photos.b].map((m, i) => (
            <ImageProgressive
              key={m.url}
              src={m.url}
              alt={i === 0 && lieu ? `${lieu}, Madagascar` : ""}
              w={m.w}
              h={m.h}
              prioritaire={prioritaire && i === 0}
              ajustement="cover"
              largeurAffichee={LARGEUR_DUO}
            />
          ))}
        </div>
      )}

      {photos.forme === "planche" && (
        <>
          <div
            className="mx-4 mb-0.5 overflow-hidden rounded-t-[10px] bg-muted"
            style={{ aspectRatio: ratioDe(photos.grande) }}
          >
            <ImageProgressive
              src={photos.grande.url}
              alt={lieu ? `${lieu}, Madagascar` : ""}
              w={photos.grande.w}
              h={photos.grande.h}
              prioritaire={prioritaire}
              ajustement="cover"
              largeurAffichee={LARGEUR_PLEINE}
            />
          </div>
          <div
            className={cn(
              "mx-4 mb-3 grid gap-0.5 overflow-hidden rounded-b-[10px] bg-muted",
              photos.suite.length === 2 ? "grid-cols-2" : photos.suite.length === 3 ? "grid-cols-3" : "grid-cols-4"
            )}
            style={{ aspectRatio: `${photos.ratio * photos.suite.length}` }}
          >
            {photos.suite.map((m) => (
              <ImageProgressive
                key={m.url}
                src={m.url}
                alt=""
                w={m.w}
                h={m.h}
                ajustement="cover"
                largeurAffichee={LARGEUR_PLANCHE}
              />
            ))}
          </div>
          {post.media.length > 5 && (
            <p className="mx-4 mb-2 text-[13px] leading-snug text-muted-foreground">
              {post.media.length} photos dans cette publication — les autres sont dans le récit.
            </p>
          )}
        </>
      )}

      {/* ── 4. CE QUI CONVERTIT, EN FORT ────────────────────────────────── */}
      {/* 🔴 LE LIEU ÉTAIT ÉCRIT TROIS FOIS PAR CARTE (18/09/2026) : le titre,
            ce bloc de deux lignes avec son rond, et une pastille juste en
            dessous. Le titre reste — c'est lui le lien principal ; la pastille
            part ; ce bloc tient en UNE ligne de 44 px. */}
      {versLieu && lieu && (
        <Link
          to={versLieu}
          onClick={() => interesse(2)}
          className="relative z-10 mx-4 mb-3 flex min-h-11 items-center gap-2 rounded-xl border border-border bg-muted/60 px-3.5"
        >
          <Compass className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-snug text-foreground">
            Ouvrir {lieu}
          </span>
          <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}

      {/* 🔴 LE PLAT, SEULEMENT QUAND IL EXISTE (18/09/2026). Une pastille en
            pointillés « Plat à rattacher » s'affichait sur les 213 cartes :
            une étiquette de travail interne, montrée au public, qui ne lui
            apprenait rien. */}
      {post.dish && (
        <div className="mx-4 mb-2.5 flex min-h-11 flex-wrap items-center gap-1.5">
          <Link
            to={`/recherche?q=${encodeURIComponent(post.dish)}`}
            className="dk-tap relative z-10 inline-flex min-h-8 items-center rounded-full bg-accent/10 px-3 text-[13px] font-semibold text-accent-strong"
          >
            {post.dish}
          </Link>
        </div>
      )}

      {blocs.repere && (
        <div className="mx-4 mb-2.5 border-t border-border/60 pt-2.5 text-[13px] leading-snug text-muted-foreground">
          <p className="text-foreground/80">🧭 {blocs.repere}</p>
        </div>
      )}

      {/* Les gestes, discrets — le fil compte 0 commentaire et 9 réactions. */}
      <div className="mx-4 flex items-center gap-2">
        <button
          onClick={reagir}
          aria-pressed={!!reaction}
          className={cn(
            "relative z-10 inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border text-sm",
            reaction
              ? "border-primary bg-primary/10 font-semibold text-primary"
              : "border-border bg-card text-foreground/80"
          )}
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          J'y suis allé
          {nbReactions > 0 && <span className="tabular-nums text-muted-foreground">· {nbReactions}</span>}
        </button>
        <button
          onClick={() => {
            interesse(1);
            onCommenter(post);
          }}
          className="relative z-10 inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[10px] text-sm text-muted-foreground"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Répondre
          {post.comments_count > 0 && <span className="tabular-nums">· {post.comments_count}</span>}
        </button>
        <button
          onClick={() => {
            interesse(1);
            setPartage(true);
          }}
          aria-label="Partager"
          className="dk-tap relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground"
        >
          <Send className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
        {user && (
          <button
            onClick={enregistrer}
            aria-label={favori ? "Retirer de mon carnet" : "Garder dans mon carnet"}
            aria-pressed={favori}
            className={cn(
              "dk-tap relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full",
              favori ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Bookmark className={cn("h-[18px] w-[18px]", favori && "fill-current")} aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  );
}
