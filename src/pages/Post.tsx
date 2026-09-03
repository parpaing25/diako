import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bookmark,
  Compass,
  Heart,
  MessageCircle,
  Phone,
  Send,
} from "lucide-react";
import { useRetour } from "@/hooks/useRetour";
import { useSEO } from "@/hooks/useSEO";
import { useReveal } from "@/hooks/useReveal";
import { useConnexionRequise } from "@/hooks/useConnexionRequise";
import { Carrousel } from "@/components/Carrousel";
import { TagRow } from "@/components/TagRow";
import { Commentaires } from "@/components/Commentaires";
import { PartagerMenu } from "@/components/PartagerMenu";
import { ImageProgressive } from "@/components/ImageProgressive";
import { Prix, UNITES, type Unite } from "@/components/Prix";
import { noterLieu } from "@/lib/affinites";
import { cn } from "@/lib/utils";
import { dateDuReleve, dateLongue, decouperRecit, numeroAppelable } from "@/lib/recit";
import { recitsParLieu } from "@/lib/etablissements";
import {
  basculerFavori,
  basculerReaction,
  chargerPost,
  type Media,
  type Post as TypePost,
} from "@/lib/api";

/**
 * Une publication seule, à son adresse propre.
 *
 * ⚠ POURQUOI CET ÉCRAN EXISTE. Le bouton « Partager » copiait l'URL
 *   `/?post=<id>` et toutes les notifications de réaction et de commentaire
 *   pointaient au même endroit — mais aucun écran ne lisait ce paramètre.
 *   Un récit qu'on ne peut pas envoyer par lien ne circule pas, et c'est
 *   pourtant exactement ce qu'on fait au retour d'un voyage.
 *
 * ⭐ REFAITE LE 03/09/2026, à la demande d'Andry : « si je clique sur une carte
 *   il s'ouvre en grand, et va dans la page de détails du récit ».
 *   Elle rendait jusqu'ici la CARTE DU FIL dans une colonne de 620 px : une
 *   photo de 330 px de large sur un écran de 1280, le texte coupé à 180
 *   caractères avec un « plus », un lien « Ouvrir » qui menait à la page où
 *   l'on se trouvait déjà, et le corps du bot affiché en un seul pavé —
 *   titre répété, citation noyée, téléphone qu'on ne pouvait pas composer.
 *
 *   Ici on vient pour REGARDER un lieu et LIRE ce qu'on en dit. D'où l'ordre :
 *   la photo d'abord, en grand ; le lieu comme titre ; puis le récit découpé
 *   bloc par bloc (`lib/recit.ts`).
 *
 * ⚠ AUCUNE DONNÉE N'EST TIRÉE DU TEXTE. Le lieu vient de `place`,
 *   l'établissement de `page_name`, le prix de `price_ar` — des colonnes. Le
 *   corps ne sert qu'à la mise en page : la ligne 📍 qu'il porte nomme
 *   l'établissement une fois sur deux et le lieu l'autre fois, sans rien qui
 *   dise laquelle.
 */
/** L'image qu'un média peut montrer en vignette : la photo, ou l'affiche d'une vidéo. */
function vignetteDe(m: Media): string | null {
  return m.type === "video" ? m.poster ?? null : m.url;
}

export default function Post() {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<TypePost | null>(null);
  /* 🔴 LA DÉPENDANCE, PAS LE VIDE. Sans elle, l'effet tourne avant que le
   *    récit soit là, `querySelectorAll('.dk-reveal')` ne trouve rien, et
   *    aucun observateur n'est créé : ce qui arrive ensuite reste à
   *    `opacity: 0` POUR TOUJOURS. Vérifié le 03/09/2026 sur le build en
   *    ligne — texte présent dans le DOM, écran vide, aucune erreur. */
  useReveal(post);
  const [etat, setEtat] = useState<"chargement" | "ok" | "absent" | "erreur">("chargement");
  const [partage, setPartage] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const [nbReactions, setNbReactions] = useState(0);
  const [favori, setFavori] = useState(false);
  const [nbReponses, setNbReponses] = useState(0);
  const [voisins, setVoisins] = useState<
    { id: string; place: string | null; media: Media[] }[]
  >([]);
  const connecte = useConnexionRequise();

  /**
   * ⚠ ON N'ARRIVE JAMAIS ICI PAR HASARD. Cet écran est la cible des
   *   notifications et du bouton Partager : on y vient TOUJOURS d'ailleurs, et
   *   rien ne ramenait à cet ailleurs. Repli sur le fil : un récit lu par un
   *   lien reçu n'a pas de destination propre.
   */
  const retour = useRetour("/");

  useSEO({
    titre: post?.place ? `Récit à ${post.place}` : "Récit de voyage",
    description: post?.body?.slice(0, 180) ?? undefined,
    image: post?.media?.[0]?.url ?? undefined,
    url: id ? `/post/${id}` : undefined,
    type: "article",
  });

  const charger = useCallback(async () => {
    if (!id) return;
    setEtat("chargement");
    try {
      const p = await chargerPost(id);
      if (!p) {
        setEtat("absent");
        return;
      }
      setPost(p);
      setReaction(p.ma_reaction);
      setNbReactions(p.reactions_count);
      setFavori(p.enregistre);
      setNbReponses(p.comments_count);
      setEtat("ok");
      /* La mémoire du visiteur : ouvrir un récit dit que ce lieu l'intéresse.
         Trois points — plus qu'un simple passage dans le fil, qui en vaut deux. */
      if (p.place_slug) noterLieu(p.place_slug, 3);
    } catch {
      setEtat("erreur");
    }
  }, [id]);

  useEffect(() => {
    void charger();
  }, [charger]);

  /* ⚠ LA SEULE SORTIE DE CE CUL-DE-SAC. La page est l'atterrissage des liens
       partagés : sans elle, un visiteur venu de WhatsApp lit un récit et
       repart. Chargée APRÈS le récit, jamais avant : elle ne doit pas retarder
       ce pour quoi on est venu. Muette quand le lieu est inconnu. */
  const lieuId = post?.place_id;
  const postId = post?.id;
  useEffect(() => {
    if (!lieuId || !postId) return;
    let annule = false;
    void recitsParLieu(lieuId, 7)
      .then((liste) => {
        if (annule) return;
        /* ⚠ Une vidéo sans affiche ne fait pas de vignette : on ne garde que
             ce qui a une image à montrer. */
        setVoisins(
          (liste as unknown as { id: string; place: string | null; media: Media[] }[])
            .filter((r) => r.id !== postId && (r.media ?? []).some(vignetteDe))
            .slice(0, 4),
        );
      })
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [lieuId, postId]);

  async function reagir() {
    if (!post || !connecte("réagir aux récits")) return;
    const avant = reaction;
    const delta = avant ? -1 : 1;
    setReaction(avant ? null : "utile");
    setNbReactions((n) => Math.max(0, n + delta));
    try {
      /* ⚠ LE TYPE COURANT, PAS « utile » EN DUR. Un membre qui avait réagi
         « Bon prix » depuis le fil et touchait le cœur pour RETIRER sa
         réaction la voyait remplacée par « utile » : côté serveur, un autre
         type fait un UPDATE, pas un DELETE — et le compteur restait faux
         jusqu'au rechargement. Le compteur se recalcule sur la RÉPONSE. */
      const nouvelle = await basculerReaction(post.id, avant ?? "utile");
      setReaction(nouvelle);
      setNbReactions((n) =>
        Math.max(0, n - delta + (avant ? (nouvelle ? 0 : -1) : nouvelle ? 1 : 0)),
      );
    } catch {
      setReaction(avant);
      setNbReactions((n) => Math.max(0, n - delta));
    }
  }

  async function enregistrer() {
    if (!post || !connecte("garder ce récit")) return;
    const avant = favori;
    setFavori(!avant);
    try {
      setFavori(await basculerFavori(post.id, avant));
    } catch {
      setFavori(avant);
    }
  }

  if (etat === "chargement") {
    return (
      <div className="dk-colonne md:px-4 md:py-5" aria-busy="true">
        <div className="dk-skeleton aspect-[4/5] max-h-[60dvh] w-full md:aspect-[4/3] md:max-h-none md:rounded-2xl" />
        <div className="px-4 md:px-0">
          <div className="dk-skeleton mt-4 h-7 w-40" />
          <div className="dk-skeleton mt-2 h-3 w-56" />
          <div className="dk-skeleton mt-4 h-24 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (etat === "erreur") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="font-medium">La publication n'a pas pu être chargée</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => void charger()}
            className="min-h-11 rounded-full border border-input px-5 text-sm font-medium"
          >
            Réessayer
          </button>
          {/* ⚠ Cet écran n'offrait QUE « Réessayer » : sur une coupure durable,
              zéro sortie. */}
          <Link to="/" className="text-sm font-medium text-primary underline underline-offset-4">
            Revenir au fil
          </Link>
        </div>
      </div>
    );
  }

  /* 🔴 CES DEUX BLOCS ÉTAIENT DANS LE MAUVAIS ORDRE. `!post` est vrai aussi
        quand la requête a échoué : une coupure réseau annonçait « Cette
        publication n'existe plus », sans bouton Réessayer. On dit à quelqu'un
        que son récit a été retiré parce que sa 3G a hoqueté. */
  if (etat === "absent" || !post) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Cette publication n'existe plus</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Elle a peut-être été retirée par son auteur.
        </p>
        <Link
          to="/"
          className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          Revenir au fil
        </Link>
      </div>
    );
  }

  const blocs = decouperRecit(post.body, { lieuConnu: !!(post.place || post.page_name) });
  /* ⚠ `price_unit` EST UNE COLONNE TEXTE : la base accepte des valeurs que le
       composant Prix ne connaît pas. On ne force pas le type — une unité
       inconnue devient `undefined`, et le prix s'affiche sans elle plutôt que
       de rendre un libellé vide. */
  const unite = UNITES.includes(post.price_unit as Unite)
    ? (post.price_unit as Unite)
    : undefined;
  const numero = numeroAppelable(blocs.telephone);
  const auteur = post.author.name || "Membre Diako";
  const titre = post.place || post.page_name || auteur;

  return (
    /* ═══ GABARIT G2 — LECTURE LONGUE ══════════════════════════════════════
       ⚠ LE TEXTE NE S'ÉLARGIT PAS, JAMAIS. Un récit fait 1 494 caractères en
         moyenne : au-delà de ~620 px de colonne, l'œil perd la ligne en
         revenant à la gauche. Ce qui change avec la place, c'est ce qui
         ACCOMPAGNE le texte — ici les commentaires, qui passent de dessous à
         côté à partir de `large` (1920 px).
       ⚠ LA COLONNE DE COMMENTAIRES NE DISPARAÎT PAS QUAND ELLE EST VIDE. Une
         page qui change de forme selon ce qu'elle contient est illisible. */
    <div className="pb-6 md:px-4 md:py-5 large:flex large:items-start large:justify-center large:gap-6">
      {partage && (
        <PartagerMenu
          url={`${window.location.origin}/post/${post.id}`}
          texte={post.place ?? post.body ?? ""}
          onFermer={() => setPartage(false)}
        />
      )}

      <div className="dk-colonne large:mx-0 large:w-[700px] large:max-w-[700px] large:shrink-0">
        {/* ⚠ AU-DESSUS DU RÉCIT, pas flottant : ici on lit, et une pastille
            posée sur le texte gênerait le défilement au pouce.
            ⚠ `min-h-11` = 44 px, et le libellé écrit donne la largeur. */}
        <button
          onClick={retour}
          className="mb-2 inline-flex min-h-11 items-center gap-1.5 px-4 text-sm font-medium text-muted-foreground hover:text-foreground md:px-0"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour
        </button>

        {/* ── LA PHOTO D'ABORD ──────────────────────────────────────────────
            ⚠ 4/5 SOUS md, PAS 4/3. Sur un écran de 390 px, le 4/3 ne donne que
              292 px de haut : la photo, seule raison d'ouvrir un récit,
              occupait un tiers de l'écran. Le 4/5 en donne 487, plafonné à
              60 % de la hauteur pour laisser voir le titre sans défiler.
            ⚠ Bord à bord sous md, arrondi à partir de md — la convention de
              toutes les cartes du site.
            ⭐ ICI, ET SEULEMENT ICI, la photo s'ouvre EN GRAND : dans le fil
              elle mène au récit (demande d'Andry), sur cette page il n'y a
              plus nulle part où aller. */}
        {post.media?.length > 0 && (
          <div className="aspect-[4/5] max-h-[60dvh] w-full overflow-hidden bg-muted md:aspect-[4/3] md:max-h-none md:rounded-2xl">
            <Carrousel
              images={post.media}
              alt={post.place ? `${post.place}, Madagascar` : auteur}
              prioritaire
              largeurAffichee="(min-width: 768px) 700px, 100vw"
            />
          </div>
        )}

        <div className="flex flex-col gap-4 px-4 pt-4 md:px-0">
          {/* ── LE LIEU EST LE TITRE ────────────────────────────────────────
              ⚠ La page n'avait AUCUN h1 dans son état normal.
              ⚠ La date en toutes lettres, pas un « il y a 1 j » : on arrive
                souvent ici par un lien reçu des semaines plus tard. */}
          <header className="flex flex-col gap-1">
            <h1 className="dk-titre">{titre}</h1>
            <p className="dk-secondaire">
              {post.page_name && post.page_name !== titre ? `${post.page_name} · ` : ""}
              <time dateTime={post.created_at}>{dateLongue(post.created_at)}</time>
            </p>
          </header>

          {/* ── LE PRIX, DATÉ ───────────────────────────────────────────────
              ⚠ Il vient de la COLONNE, pas du texte. La ligne 💰 du corps
                n'est affichée qu'à défaut : un tarif écrit deux fois, à deux
                dates, c'est un tarif faux. */}
          {post.price_ar ? (
            <div className="rounded-2xl bg-gold-soft px-4 py-3">
              {/* ⚠ PAS `confirmeLe` : c'est la règle des FICHES (« Nous
                  consulter » au-delà de 183 jours). Un récit est un RELEVÉ
                  daté : le montant reste, sa date dit ce qu'il vaut.
                  ⚠ Unité inconnue du composant : on la montre telle qu'écrite
                  (`base`), jamais le montant nu — « 80 000 Ar » sans « le
                  trajet » se lit « par personne ». */}
              <Prix
                montant={post.price_ar}
                unite={unite}
                base={unite ? undefined : post.price_unit ?? undefined}
                releve={
                  post.price_on
                    ? `Relevé le ${dateLongue(post.price_on)}`
                    : dateDuReleve(blocs.prix) ?? "Date du relevé inconnue"
                }
              />
            </div>
          ) : blocs.prix ? (
            <p className="dk-secondaire">{blocs.prix}</p>
          ) : null}

          {/* ── LA CITATION : le seul bloc mis en valeur ────────────────────
              C'est ce que la personne a écrit ; le reste est de la mise en
              page. */}
          {blocs.citation && (
            <blockquote className="rounded-r-2xl border-l-2 border-primary/35 bg-teal-soft/70 px-4 py-3">
              <p className="dk-corps whitespace-pre-line">{blocs.citation}</p>
            </blockquote>
          )}

          {/* Tout ce qu'aucun préfixe n'a reconnu : affiché tel quel, jamais
              perdu — le rendu ne doit pas dépendre d'un marqueur. */}
          {blocs.prose.map((ligne, i) => (
            <p key={i} className="dk-corps whitespace-pre-line">
              {ligne}
            </p>
          ))}

          {blocs.repere && (
            <p className="dk-secondaire flex items-start gap-2">
              <Compass className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {blocs.repere}
            </p>
          )}

          {/* ⚠ UN NUMÉRO SE COMPOSE. Il était affiché en texte mort au milieu
              du pavé : sur un téléphone, c'est le geste le plus utile de la
              page. */}
          {blocs.telephone &&
            (numero ? (
              <a
                href={`tel:${numero}`}
                className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-primary/30 px-4 text-sm font-semibold text-primary"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                {blocs.telephone}
              </a>
            ) : (
              <p className="dk-secondaire">{blocs.telephone}</p>
            ))}

          <TagRow
            lieu={post.place ? { nom: post.place, slug: post.place_slug } : null}
            etablissement={post.page_name ? { nom: post.page_name } : null}
            plat={post.dish ? { nom: post.dish } : null}
          />

          {/* ── L'AUTEUR, SOUS LE RÉCIT ─────────────────────────────────────
              Pas au-dessus : c'est l'écran où l'on découvre quelqu'un par un
              lien reçu, et on découvre d'abord le lieu. */}
          <Link
            to={`/user/${post.author.id}`}
            className="dk-carte flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
          >
            {post.author.avatar ? (
              <img
                src={post.author.avatar}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-soft text-sm font-bold text-primary">
                {auteur.slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{auteur}</span>
              <span className="dk-secondaire block">Voir ses récits</span>
            </span>
          </Link>

          {/* ── LA SOURCE ───────────────────────────────────────────────────
              Ce qui distingue une reprise honnête d'un recopiage : l'auteur
              d'origine reste nommé, et le lecteur voit d'où ça vient. */}
          {blocs.source && (
            <div className="flex flex-col gap-1 border-t border-line-soft pt-4">
              <span className="dk-etiquette">Source</span>
              <span className="dk-secondaire">{blocs.source}</span>
            </div>
          )}

          {/* ── LA BARRE D'ACTIONS, SUR TÉLÉPHONE ──────────────────────
              ⚠ COLLÉE AU RÉCIT, PAS À L'ÉCRAN. Elle tombait jusqu'ici vers
                460-520 px : pour aimer un récit qu'on venait de lire, il
                fallait remonter au-dessus de la photo. Mais `fixed` la faisait
                couvrir les 121 derniers pixels de la page — mesuré : le bas du
                pied de page passait dessous, sans moyen de le dégager.
                `sticky` règle les deux : la barre accompagne toute la lecture
                du récit, puis s'efface d'elle-même quand on arrive aux
                réponses — où le champ de saisie prend le relais.
              ⚠ `bottom-16` = au-dessus de la navigation basse (64 px), et
                `pb-[env(safe-area-inset-bottom)]` pour la barre d'accueil des
                iPhone récents.
              ⚠ Un `overflow: hidden` sur un ancêtre annulerait le `sticky` :
                la colonne n'en porte pas, ne pas en ajouter. */}
          <div className="sticky bottom-16 z-30 -mx-4 flex items-center gap-1 border-t border-line-soft bg-card px-2 pb-[env(safe-area-inset-bottom)] md:hidden">
        <button
          onClick={() => void reagir()}
          aria-pressed={!!reaction}
          className="flex h-14 min-w-11 items-center gap-1.5 px-3 font-semibold"
        >
          <Heart
            className={cn("h-6 w-6", reaction && "fill-current text-accent")}
            aria-hidden="true"
          />
          {nbReactions > 0 && <span className="text-sm">{nbReactions}</span>}
          <span className="sr-only">Réagir</span>
        </button>
        <a
          href="#titre-commentaires"
          className="flex h-14 min-w-11 items-center gap-1.5 px-3 font-semibold"
        >
          <MessageCircle className="h-6 w-6" aria-hidden="true" />
          {nbReponses > 0 && <span className="text-sm">{nbReponses}</span>}
          <span className="sr-only">Commenter</span>
        </a>
        <button onClick={() => setPartage(true)} className="grid h-14 w-11 place-items-center">
          <Send className="h-6 w-6" aria-hidden="true" />
          <span className="sr-only">Partager</span>
        </button>
        <span className="flex-1" />
        <button
          onClick={() => void enregistrer()}
          aria-pressed={favori}
          className="grid h-14 w-11 place-items-center"
        >
          <Bookmark
            className={cn("h-6 w-6", favori && "fill-current text-primary")}
            aria-hidden="true"
          />
          <span className="sr-only">Enregistrer</span>
        </button>
      </div>

          {/* Sur ordinateur, les mêmes gestes restent dans le flux : pas de
              barre flottante là où le pouce n'a rien à atteindre. */}
          <div className="hidden items-center gap-1 border-t border-line-soft pt-2 md:flex">
            <button
              onClick={() => void reagir()}
              aria-pressed={!!reaction}
              className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold hover:bg-muted"
            >
              <Heart
                className={cn("h-5 w-5", reaction && "fill-current text-accent")}
                aria-hidden="true"
              />
              {nbReactions > 0 ? `${nbReactions} réaction${nbReactions > 1 ? "s" : ""}` : "Réagir"}
            </button>
            <a
              href="#titre-commentaires"
              className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold hover:bg-muted"
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              {nbReponses > 0 ? `${nbReponses} réponse${nbReponses > 1 ? "s" : ""}` : "Répondre"}
            </a>
            <button
              onClick={() => setPartage(true)}
              className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold hover:bg-muted"
            >
              <Send className="h-5 w-5" aria-hidden="true" />
              Partager
            </button>
            <span className="flex-1" />
            <button
              onClick={() => void enregistrer()}
              aria-pressed={favori}
              className="grid h-11 w-11 place-items-center rounded-full hover:bg-muted"
            >
              <Bookmark
                className={cn("h-5 w-5", favori && "fill-current text-primary")}
                aria-hidden="true"
              />
              <span className="sr-only">Enregistrer</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── LA CONVERSATION ────────────────────────────────────────────────
          ⚠ UNE SEULE LISTE. La carte du fil en portait une autre, avec son
            propre champ : deux requêtes, deux « Aucun commentaire », et
            publier dans l'une ne mettait pas à jour le compteur de l'autre.
            C'est cette section qui fait foi — la carte n'est plus rendue ici. */}
      <div className="dk-colonne mt-6 flex flex-col gap-6 px-4 md:px-0 large:mx-0 large:mt-0 large:w-[518px] large:max-w-[518px] large:shrink-0">
        <section
          aria-labelledby="titre-commentaires"
          className="rounded-2xl border border-border bg-card p-4"
        >
          <h2 id="titre-commentaires" className="dk-sous-titre">
            {nbReponses > 0 ? `${nbReponses} réponse${nbReponses > 1 ? "s" : ""}` : "Commentaires"}
          </h2>
          <div className="mt-3">
            <Commentaires postId={post.id} onNombre={setNbReponses} />
          </div>
        </section>

        {voisins.length > 0 && (
          <section aria-labelledby="titre-voisins" className="flex flex-col gap-3">
            <h2 id="titre-voisins" className="dk-sous-titre">
              Autres récits {post.place ? `à ${post.place}` : "du même lieu"}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {voisins.map((r) => {
                const m = r.media.find(vignetteDe)!;
                return (
                  <Link key={r.id} to={`/post/${r.id}`} className="dk-carte flex flex-col gap-2">
                    <span className="dk-zoom block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted">
                      <ImageProgressive
                        src={vignetteDe(m)!}
                        alt=""
                        w={m.w}
                        h={m.h}
                        largeurAffichee="(min-width: 768px) 240px, 45vw"
                      />
                    </span>
                    {/* ⚠ Pas `dk-secondaire` ici : la classe impose sa couleur
                        grise, et un `text-foreground` à côté ne gagne pas. */}
                    <span className="truncate text-sm font-medium">{r.place ?? "Madagascar"}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>


    </div>
  );
}
