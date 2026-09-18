import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bookmark,
  Camera,
  Clock,
  Flag,
  Globe,
  MapPin,
  MessageCircle,
  Phone,
  Share2,
  Star,
} from "lucide-react";
import { BadgeVerification } from "@/components/Badges";
import { IconeCategorie } from "@/components/IconeCategorie";
import { PartagerMenu } from "@/components/PartagerMenu";
import { ProposerPhoto } from "@/components/ProposerPhoto";
import { memoriserSuite } from "@/lib/suite";
import { useAuth } from "@/contexts/AuthContext";
import { useUserData } from "@/contexts/UserDataContext";
import { useRetour } from "@/hooks/useRetour";
import { useSEO } from "@/hooks/useSEO";
import {
  construireCircuitJsonLd,
  construireFicheJsonLd,
  construireOffresChambres,
  filArianeFiche,
  poserJsonLd,
} from "@/lib/jsonld";
import { ImageProgressive } from "@/components/ImageProgressive";
import { Carrousel } from "@/components/Carrousel";
import { PanneauDemande } from "@/components/PanneauDemande";
import {
  ariary,
  avisDe,
  basculerFicheGardee,
  chargerFiche,
  descriptionPropre,
  ficheEstGardee,
  deposerAvis,
  ecrireALEtablissement,
  lambaDe,
  libelleCategories,
  LIBELLE_VEHICULE,
  recitsMentionnant,
  revendiquer,
  unite,
  vehiculesDe,
  type Avis,
  type Fiche,
  type OffreVehicule,
} from "@/lib/etablissements";
import { signaler } from "@/lib/api";
import { Revendication } from "@/components/Revendication";
import { afficherNumero, lienAppel, lienWhatsApp, peutRecevoirWhatsApp } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

/** Libellés des moyens de paiement (codes de `pages.payment_methods`). */
const LIBELLE_PAIEMENT: Record<string, string> = {
  especes: "Espèces",
  mvola: "MVola",
  orange_money: "Orange Money",
  airtel_money: "Airtel Money",
  carte: "Carte bancaire",
  virement: "Virement",
};

const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

const PENSION: Record<string, string> = {
  chambre_seule: "chambre seule",
  petit_dej: "petit déjeuner inclus",
  demi_pension: "demi-pension",
  pension_complete: "pension complète",
  all_in: "tout compris",
};

type Onglet = "chambres" | "vehicules" | "carte" | "activites" | "circuits" | "avis" | "infos";

/**
 * La fiche publique d'un établissement.
 *
 * ⚠ CE QUI A CHANGÉ. Cet écran lisait `PLACES.find(...) ?? PLACES[0]` dans un
 *   fichier de données fictives : n'importe quelle URL /p/xxx affichait le
 *   bungalow d'Ampefy avec ses tarifs, au lieu d'une 404. Pire, les onglets
 *   étaient des constantes globales écrites pour un hôtel-restaurant — une
 *   page d'AGENCE ouvrait donc sur « Chambres » et proposait un menu de
 *   ravitoto. Les trois boutons de contact n'étaient que des toasts
 *   « bientôt disponible ».
 *
 *   Désormais : une seule requête (get_page_by_slug), une vraie 404 quand le
 *   slug n'existe pas, et des onglets déduits de ce que l'établissement a
 *   RÉELLEMENT publié. Un hôtel sans restaurant n'a pas d'onglet Carte.
 */
/**
 * Affiche `pages.source` en rendant ses URL cliquables.
 *
 * ⚠ LA CHAINE EST CUMULATIVE. Une fiche relevee par OpenStreetMap puis decrite
 *   par Wikivoyage porte les DEUX provenances, separees par « · » — l'ODbL et la
 *   CC BY-SA l'exigent chacune de leur cote. On ne remplace jamais une source,
 *   on ajoute.
 */
function SourceLiee({ texte }: { texte: string }) {
  const bouts = texte.split(/(https?:\/\/\S+)/g);
  return (
    <p className="mt-2 text-xs italic text-muted-foreground">
      Source :{" "}
      {bouts.map((b, i) =>
        /^https?:\/\//.test(b) ? (
          <a
            key={i}
            href={b}
            target="_blank"
            rel="noreferrer noopener"
            className="underline"
          >
            {b.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}
          </a>
        ) : (
          <span key={i}>{b}</span>
        )
      )}
    </p>
  );
}

export default function PagePro() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  /** ⚠ Le PROFIL, pas seulement la session : c'est `account_type` qui decide
   *  qui peut revendiquer, et cette page ne le chargeait pas du tout. */
  const { profile, loading: profilEnCours, refresh: relireProfil } = useUserData();
  const estPro = profile?.account_type === "pro";
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  /** `?reprendre=1` : le gérant revient de la connexion pour reprendre SA
   *  fiche (voir `revendiquerFiche`). */
  const reprendre = params.get("reprendre") === "1";

  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "absente" | "erreur">("chargement");
  const [onglet, setOnglet] = useState<Onglet>("infos");
  const [avis, setAvis] = useState<Avis[]>([]);
  const [recits, setRecits] = useState<{ id: string; body: string | null }[]>([]);
  const [maNote, setMaNote] = useState(0);
  const [monAvis, setMonAvis] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [revendicationOuverte, setRevendicationOuverte] = useState(false);
  const [gardee, setGardee] = useState(false);
  /** La grille du loueur (0114) — chargée à part, voir `charger()`. */
  const [vehicules, setVehicules] = useState<OffreVehicule[]>([]);
  const [partageOuvert, setPartageOuvert] = useState(false);
  const fermerPartage = useCallback(() => setPartageOuvert(false), []);
  /** Vrai dès qu'un onglet a été CHOISI (clic, lien de reprise) : la grille
   *  des véhicules, qui arrive après la fiche, ne doit plus le remplacer sous
   *  les yeux de la personne. */
  const ongletChoisi = useRef(false);
  const blocReprise = useRef<HTMLElement>(null);
  const titreReprise = useRef<HTMLHeadingElement>(null);
  /** Compteur de demandes de défilement vers le bloc de reprise. */
  const [defiler, setDefiler] = useState(0);
  const repriseTraitee = useRef(false);
  const [profilRelu, setProfilRelu] = useState(false);

  /**
   * ⚠ LE REPLI N'EST PAS L'ACCUEIL. Cette fiche est ce qui se partage le plus
   *   par lien : celui qui l'ouvre depuis WhatsApp n'a RIEN derrière lui, et le
   *   déposer sur le fil d'actualité ne répond pas à ce qu'il cherchait. On le
   *   pose là où il aurait trouvé l'établissement lui-même — la destination
   *   dont il dépend, ou la recherche quand la fiche n'est rattachée à aucun
   *   lieu du référentiel.
   * ⚠ Le repli se recalcule quand la fiche arrive : tant qu'elle charge, le
   *   bouton n'est pas affiché, donc aucun clic ne peut partir sur /recherche
   *   par défaut.
   */
  const retour = useRetour(fiche?.place ? `/lieu/${fiche.place.slug}` : "/recherche");

  // Titre, description, aperçu de partage et canonique — tirés de la fiche.
  // Partager un hôtel sur WhatsApp montrait jusqu'ici le titre et l'image de
  // l'accueil : sur ce marché, c'est le canal d'acquisition n°1.
  useSEO({
    titre: fiche ? `${fiche.name}${fiche.place ? ` — ${fiche.place.name}` : ""}` : "Établissement",
    // Une fiche inexistante rend HTTP 200 (repli SPA) : `noindex` évite le soft 404 (audit 05/09/2026).
    noindex: etat === "absente",
    description:
      fiche?.short_desc ??
      (fiche
        ? `${fiche.name}${fiche.place ? ` à ${fiche.place.name}` : ""}${
            fiche.price_min_ar ? `, à partir de ${ariary(fiche.price_min_ar)}` : ""
          }. Coordonnées, tarifs et avis sur Diako.`
        : undefined),
    image: fiche?.cover_url ?? undefined,
    url: slug ? `/p/${slug}` : undefined,
  });

  // Données structurées : c'est ce qui fait afficher la note, la fourchette de
  // prix et le fil d'Ariane dans les résultats Google plutôt qu'une ligne bleue.
  useEffect(() => {
    if (!fiche) return;
    poserJsonLd("dk-jsonld-fiche", construireFicheJsonLd(fiche));
    poserJsonLd("dk-jsonld-ariane", filArianeFiche(fiche));
    poserJsonLd(
      "dk-jsonld-chambres",
      construireOffresChambres(
        fiche.slug,
        fiche.rooms.map((r) => ({
          name: r.name,
          description: r.description,
          max_adults: r.max_adults,
          base_price_ar: r.base_price_ar,
          price_unit: r.price_unit,
        }))
      )
    );
    poserJsonLd(
      "dk-jsonld-circuit",
      fiche.tours.length ? construireCircuitJsonLd(fiche.slug, fiche.tours[0]) : null
    );
    return () => {
      for (const id of [
        "dk-jsonld-fiche",
        "dk-jsonld-ariane",
        "dk-jsonld-chambres",
        "dk-jsonld-circuit",
      ])
        poserJsonLd(id, null);
    };
  }, [fiche]);

  const charger = useCallback(async () => {
    if (!slug) return;
    setEtat("chargement");
    // Une autre fiche (même composant, autre slug) repart de zéro.
    ongletChoisi.current = false;
    repriseTraitee.current = false;
    try {
      const f = await chargerFiche(slug);
      if (!f) {
        setEtat("absente");
        return;
      }
      setFiche(f);
      setEtat("ok");
      // L'onglet ouvert par défaut suit ce que l'établissement propose, au
      // lieu d'être « Chambres » pour tout le monde y compris une agence.
      const ongletDefaut: Onglet = f.rooms.length
        ? "chambres"
        : f.menu_items.length || f.menu_photos.length
          ? "carte"
          : f.tours.length
            ? "circuits"
            : f.activities.length
              ? "activites"
              : "infos";
      setOnglet(ongletDefaut);
      /* ⚠ LA GRILLE DES VÉHICULES (0114) N'EST PAS DANS get_page_by_slug —
         la RPC n'a pas été retouchée la veille du lancement. On ne paie
         l'aller-retour que pour les catégories qui peuvent en avoir une, et
         son échec est silencieux : la fiche vit très bien sans sa grille,
         l'inverse n'est pas vrai. */
      setVehicules([]);
      if (f.categories.includes("location_vehicule") || f.categories.includes("transporteur")) {
        void vehiculesDe(f.id)
          .then((v) => {
            setVehicules(v);
            // Un loueur n'a ni chambres ni carte : sans ceci, sa fiche
            // ouvrirait sur « Infos » alors que sa grille est LE contenu.
            if (v.length && ongletDefaut === "infos" && !ongletChoisi.current) setOnglet("vehicules");
          })
          .catch(() => undefined);
      }
      void avisDe(f.id).then(setAvis).catch(() => undefined);
      void ficheEstGardee(f.id).then(setGardee).catch(() => undefined);
      void recitsMentionnant(f.id).then(setRecits).catch(() => undefined);
    } catch {
      setEtat("erreur");
    }
  }, [slug]);

  useEffect(() => {
    void charger();
  }, [charger]);

  /** La description longue sans le chrome de Facebook recopié avec elle —
   *  à l'affichage seulement, la base garde le texte brut. */
  const description = useMemo(() => descriptionPropre(fiche?.long_desc), [fiche?.long_desc]);

  /**
   * ⭐ LE RETOUR DU GÉRANT : `/p/<slug>?reprendre=1`.
   *
   * 🔴 AUCUNE REPRISE N'A JAMAIS ABOUTI (3 412 fiches, `owner_id` nul
   *    partout, relevé le 18/09/2026). Le gérant qui touchait « C'est mon
   *    établissement » recevait un toast de 4 s, partait sur /auth, tombait
   *    sur l'onglet Connexion alors qu'il n'avait pas de compte, puis sur
   *    « Réservé aux professionnels » — et avait perdu sa fiche en route.
   *    Désormais la connexion le ramène ICI (`memoriserSuite`), et on reprend
   *    là où il s'était arrêté : le formulaire s'il est professionnel, le bloc
   *    qui explique la marche à suivre s'il ne l'est pas encore.
   *
   * ⚠ LE PROFIL EST RELU UNE FOIS avant de conclure « voyageur » : il vient
   *   peut-être de se déclarer professionnel sur /bienvenue, et un profil lu
   *   avant ce choix lui dirait le contraire de ce qu'il vient de faire.
   */
  useEffect(() => {
    if (!reprendre || repriseTraitee.current) return;
    if (etat !== "ok" || !fiche || profilEnCours) return;
    if (user && !estPro && !profilRelu) {
      void relireProfil().finally(() => setProfilRelu(true));
      return;
    }
    repriseTraitee.current = true;
    // Le paramètre a servi : un rechargement ou un retour arrière ne doit pas
    // rouvrir le formulaire.
    const reste = new URLSearchParams(params);
    reste.delete("reprendre");
    setParams(reste, { replace: true });
    if (fiche.owner_id) return;
    ongletChoisi.current = true;
    setOnglet("infos");
    if (user && estPro) setRevendicationOuverte(true);
    else setDefiler((n) => n + 1);
  }, [reprendre, etat, fiche, profilEnCours, user, estPro, profilRelu, relireProfil, params, setParams]);

  // Défilement vers le bloc de reprise, APRÈS le rendu de l'onglet Infos.
  useEffect(() => {
    if (!defiler) return;
    blocReprise.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    titreReprise.current?.focus({ preventScroll: true });
  }, [defiler]);

  /** Ouvre l'onglet Infos et amène le bloc « Vous gérez… ? » sous les yeux. */
  function allerAuBlocReprise() {
    ongletChoisi.current = true;
    setOnglet("infos");
    setDefiler((n) => n + 1);
  }

  /**
   * Envoie vers la connexion en mémorisant la page, pour y revenir ensuite.
   * ⚠ SANS TOAST : il disparaissait avant d'être lu, dans le même geste que
   *   le départ vers /auth. C'est le retour sur la page qui dit que ça a marché.
   */
  function seConnecterPuisRevenir() {
    memoriserSuite(location.pathname + location.search);
    navigate("/auth");
  }

  async function ecrire() {
    if (!fiche) return;
    if (!user) {
      seConnecterPuisRevenir();
      return;
    }
    try {
      const conv = await ecrireALEtablissement(fiche.id);
      navigate(`/messages?c=${conv}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "L'envoi n'a pas pu démarrer.");
    }
  }

  /** ⚠ UNE SEULE FONCTION POUR LES DEUX BOUTONS de revendication — celui de
   *  l'onglet « infos » et celui du panneau collant. Dupliquer la logique les
   *  aurait laisses diverger au premier changement. */
  function revendiquerFiche() {
    if (!fiche) return;
    // ⚠ SANS COMPTE : on part créer un compte (onglet Inscription) en
    //   mémorisant la fiche ET l'intention. Au retour, `?reprendre=1` rouvre
    //   le formulaire ; /bienvenue y lit aussi qu'il faut proposer
    //   « professionnel » d'abord.
    if (!user) {
      memoriserSuite(`/p/${fiche.slug}?reprendre=1`);
      navigate("/auth?mode=inscription");
      return;
    }
    // 🔴 LA BASE REFUSE DEJA (migration 0070), MAIS ELLE REFUSE EN POSTGRES.
    //    Sans ce test, un voyageur qui clique recevait l'exception brute
    //    « Seuls les comptes professionnels peuvent revendiquer un
    //    etablissement ». Le refus n'est plus un toast de quatre secondes :
    //    c'est une phrase dans le bloc de reprise, qui dit comment passer
    //    professionnel et reste à l'écran le temps qu'il faut pour la lire.
    // ⚠ Ce n'est PAS le controle de securite — celui-la est en base. C'est
    //   l'explication. Cacher un bouton n'a jamais empeche un appel d'API.
    if (!estPro) {
      allerAuBlocReprise();
      return;
    }
    setRevendicationOuverte(true);
  }

  /**
   * Signale une erreur sur la fiche.
   *
   * ⚠ ON DEMANDE CE QUI EST FAUX. Un signalement sans motif oblige a rouvrir la
   *   fiche pour deviner, et la plupart finissent au panier. `prompt` est
   *   rustique mais il marche partout, y compris sur les Android d'entree de
   *   gamme vises — une feuille de saisie sur mesure viendra avec la console
   *   de moderation.
   * ⚠ AUCUNE SUPPRESSION AUTOMATIQUE : le masquage au 3e signalement vaut pour
   *   du contenu abusif, pas pour un annuaire. Trois personnes agacees
   *   pourraient faire disparaitre un hotel qui existe.
   */
  async function signalerFiche() {
    if (!fiche) return;
    if (!user) {
      seConnecterPuisRevenir();
      return;
    }
    const motif = window.prompt(
      "Qu'est-ce qui est faux sur cette fiche ?\n(tarif, numéro, adresse, établissement fermé…)"
    );
    if (!motif?.trim()) return;
    try {
      await signaler("page", fiche.id, motif.trim().slice(0, 500));
      toast.success("Merci — c'est noté.", {
        description: "Nous vérifions et corrigeons la fiche.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Le signalement n'a pas pu partir.");
    }
  }

  async function noter() {
    if (!fiche || maNote < 1) return;
    if (!user) {
      seConnecterPuisRevenir();
      return;
    }
    setEnvoi(true);
    try {
      await deposerAvis(fiche.id, { note: maNote, body: monAvis });
      toast.success("Merci, votre avis est publié.");
      setMonAvis("");
      setAvis(await avisDe(fiche.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "L'avis n'a pas pu être enregistré.");
    } finally {
      setEnvoi(false);
    }
  }

  if (etat === "chargement") {
    return (
      <div className="space-y-4 px-4 py-5">
        {/* À la hauteur de la bande sans photo : c'est ce que 94 % des fiches
            afficheront, et un squelette plus haut fait sauter la page. */}
        <div className="dk-skeleton h-20 w-full rounded-2xl md:h-28" />
        <div className="dk-skeleton h-7 w-2/3" />
        <div className="dk-skeleton h-4 w-1/3" />
        <div className="dk-skeleton h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (etat === "erreur") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="font-medium">La fiche n'a pas pu être chargée</p>
        <button
          onClick={() => void charger()}
          className="mt-4 min-h-11 rounded-full border border-input px-5 text-sm font-medium"
        >
          Réessayer
        </button>
      </div>
    );
  }

  /* 🔴 L'ORDRE DE CES DEUX BLOCS ÉTAIT INVERSÉ, ET C'EST UN VRAI DÉFAUT.
        `!fiche` est vrai AUSSI quand la requête a échoué : une coupure réseau —
        banale en 3G malgache — affichait donc « Cet établissement n'existe
        pas », sans bouton Réessayer, sur l'écran le plus partagé par lien du
        produit. On dit à quelqu'un que son hôtel n'existe pas parce que sa
        connexion a hoqueté. Le cas ERREUR se traite d'abord ; ce qui reste ici
        est une vraie 404. */
  // Une vraie 404 : un lien périmé ne doit jamais présenter silencieusement
  // un AUTRE établissement avec ses tarifs.
  if (etat === "absente" || !fiche) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Cet établissement n'existe pas</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Le lien est peut-être périmé, ou la fiche a été retirée.
        </p>
        <Link
          to="/explorer"
          className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          Explorer les destinations
        </Link>
      </div>
    );
  }


  /* ⚠ L'ONGLET OUVERT PAR DÉFAUT EST TOUJOURS LE PREMIER DE LA BARRE. « Avis »
     passait avant « Infos » alors qu'« Infos » s'ouvrait par défaut sur 94 %
     des fiches, et qu'il n'existe aucun avis en base : le premier onglet de
     la barre était un onglet vide, le second celui qu'on lisait. L'ordre suit
     désormais celui de `ongletDefaut` dans `charger()`. */
  const onglets: { cle: Onglet; label: string; visible: boolean }[] = [
    { cle: "chambres", label: "Chambres", visible: fiche.rooms.length > 0 },
    {
      cle: "carte",
      label: "Carte",
      visible: fiche.menu_items.length > 0 || fiche.menu_photos.length > 0,
    },
    { cle: "circuits", label: "Circuits", visible: fiche.tours.length > 0 },
    { cle: "activites", label: "Activités", visible: fiche.activities.length > 0 },
    { cle: "vehicules", label: "Véhicules et tarifs", visible: vehicules.length > 0 },
    { cle: "infos", label: "Infos", visible: true },
    {
      cle: "avis",
      label: `Avis${fiche.rating_count ? ` (${fiche.rating_count})` : ""}`,
      visible: true,
    },
  ];

  const aujourdhui = fiche.hours.find((h) => h.jour === new Date().getDay());
  const avecCouverture = !!fiche.cover_url;
  /** « HÔTEL · RESTAURANT · AMPEFY » — ce qu'est l'endroit, et où. */
  const etiquette = [libelleCategories(fiche.categories), fiche.place?.name]
    .filter(Boolean)
    .join(" · ");
  /** Voyageur CONNECTÉ = non : la base refuserait sa revendication. Le
   *  visiteur sans compte, lui, peut encore se déclarer professionnel. */
  const peutRevendiquer = !user || estPro;
  /** Même condition que le lien « Voir sur la carte » de PanneauDemande. */
  const carteDansPanneau = !!(fiche.place || fiche.landmark) && fiche.lat != null && fiche.lng != null;

  return (
    <div className="pb-8">
      {/* ⭐ SANS PHOTO (94 % des fiches), UNE BANDE DE LAMBA, SANS TEXTE.
          C'était un aplat teal de 160 px qui répétait le nom en blanc juste
          au-dessus du h1, sans rien dire de ce qu'était l'endroit. La bande
          est un motif (la teinte suit la famille), le médaillon dessous porte
          l'icône, et le nom n'est écrit qu'une fois. */}
      <div
        className={cn(
          "relative w-full overflow-hidden md:rounded-2xl",
          avecCouverture ? "h-40 bg-muted md:h-64" : ["dk-lamba h-20 md:h-28", lambaDe(fiche.categories)]
        )}
      >
        {/* 🔴 CET ÉCRAN N'AVAIT AUCUN RETOUR. C'est pourtant celui qu'on ouvre
            depuis un lien reçu : sur téléphone, la seule sortie était le geste
            système, et le rater fait quitter le site.
            ⚠ POSÉ SUR LA COUVERTURE, pas au-dessus : une barre supplémentaire
              repousserait la photo, qui est l'image LCP de la page.
            ⚠ FOND OPAQUE OBLIGATOIRE — sur une façade blanche en plein soleil,
              une flèche nue devient invisible.
            ⚠ `dk-tap` porte la zone de frappe à 44 px sans grossir la
              pastille : c'est le premier geste de l'écran. */}
        <button
          onClick={retour}
          aria-label="Retour"
          className="dk-tap absolute left-2 top-2 z-10 grid h-10 w-10 place-items-center rounded-full bg-background/85 text-foreground shadow-sm backdrop-blur"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        {/* ⚠ LE PARTAGE EN MIROIR DU RETOUR. Il était seul sur sa ligne sous
            les boutons de contact, et sans `navigator.share` (navigateur
            intégré de Facebook sur Android, ordinateur) il copiait le lien EN
            SILENCE. Il ouvre maintenant le menu Facebook / WhatsApp / lien. */}
        <button
          onClick={() => setPartageOuvert(true)}
          aria-label="Partager"
          className="dk-tap absolute right-2 top-2 z-10 grid h-10 w-10 place-items-center rounded-full bg-background/85 text-foreground shadow-sm backdrop-blur"
        >
          <Share2 className="h-5 w-5" aria-hidden="true" />
        </button>
        {fiche.cover_url && (
          <ImageProgressive src={fiche.cover_url} alt={fiche.name} prioritaire ajustement="cover" plafond={960} />
        )}
      </div>

      {/* ⚠ DEUX COLONNES À PARTIR DE `xl` (écran W3). La fiche garde sa largeur
          de lecture ; le panneau de demande prend le reste. En dessous, une
          seule colonne : les boutons de contact de l'entête suffisent, on les
          retrouve d'un geste. */}
      <div className="px-4 xl:flex xl:items-start xl:gap-6">
        <div className="min-w-0 flex-1">
        {/* Le médaillon mord sur la bande (`-mt-8`). ⚠ `relative` : sans lui,
            la bande — positionnée — se peindrait PAR-DESSUS. */}
        {!avecCouverture && (
          <div
            aria-hidden="true"
            className="relative z-[1] -mt-8 grid h-16 w-16 place-items-center rounded-2xl border-4 border-background bg-card text-primary shadow-sm"
          >
            <IconeCategorie categories={fiche.categories} className="h-7 w-7" />
          </div>
        )}
        {etiquette && (
          <p className={cn("dk-etiquette", avecCouverture ? "mt-4" : "mt-3")}>{etiquette}</p>
        )}
        <div className={cn("flex items-start gap-2", etiquette ? "mt-1" : avecCouverture ? "mt-4" : "mt-3")}>
          <h1 className="dk-titre min-w-0 flex-1 break-words">{fiche.name}</h1>
          {fiche.verification_status !== "none" && (
            <BadgeVerification niveau={fiche.verification_status} className="mt-2 shrink-0" />
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {fiche.place && (
            <Link
              to={`/recherche?q=${encodeURIComponent(fiche.place.name)}`}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {fiche.place.name}
            </Link>
          )}
          {/* ⚠ Plus de « ★ 4.8 (9 avis) » en entête face à « Aucun avis » dans
              l'onglet : les deux viennent maintenant du même compteur. */}
          {fiche.rating_count > 0 && (
            <span className="inline-flex items-center gap-1">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
              {fiche.rating_avg.toFixed(1)}
              <span className="text-muted-foreground/80">({fiche.rating_count} avis)</span>
            </span>
          )}
          {/* Horaires du jour, lus en base. C'était « Ouvert · ferme à 22 h »
              affiché en dur pour tout le monde, agences comprises. */}
          {aujourdhui && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-4 w-4" aria-hidden="true" />
              {aujourdhui.ferme_journee
                ? "Fermé aujourd'hui"
                : `Aujourd'hui ${aujourdhui.ouvre?.slice(0, 5) ?? "—"} – ${aujourdhui.ferme?.slice(0, 5) ?? "—"}`}
            </span>
          )}
        </div>

        {/* Le tarif d'appel passe dans le panneau à partir de `xl` : l'afficher
            deux fois à 30 cm d'écart donne l'impression de deux prix. */}
        {fiche.price_min_ar != null && (
          <p className="mt-2 text-sm xl:hidden">
            À partir de{" "}
            <span className="font-semibold text-primary">{ariary(fiche.price_min_ar)}</span>{" "}
            <span className="text-muted-foreground">{unite(fiche.price_min_unit)}</span>
          </p>
        )}

        {fiche.short_desc && <p className="mt-3 text-[15px]">{fiche.short_desc}</p>}

        {/* Contact : de vrais liens, plus des toasts « bientôt disponible ». */}
        <div className="mt-4 flex flex-wrap gap-2">
          {fiche.phone && (
            <a
              href={lienAppel(fiche.phone)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground xl:hidden"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              Appeler
            </a>
          )}
          {fiche.whatsapp && peutRecevoirWhatsApp(fiche.whatsapp) && (
            <a
              href={lienWhatsApp(fiche.whatsapp, { etablissement: fiche.name })}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-input px-5 text-sm font-medium xl:hidden"
            >
              WhatsApp
            </a>
          )}
          <button
            onClick={() => void ecrire()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-input px-5 text-sm font-medium xl:hidden"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Écrire
          </button>
          {/* Ce qu'on garde en preparant un voyage, ce n'est pas un recit :
              c'est l'hotel ou on pense dormir. */}
          <button
            onClick={async () => {
              if (!user) return seConnecterPuisRevenir();
              const avant = gardee;
              setGardee(!avant);
              try {
                setGardee(await basculerFicheGardee(fiche.id, avant));
                toast.success(avant ? "Retiré de votre carnet." : "Gardé dans votre carnet.");
              } catch {
                setGardee(avant);
                toast.error("L'enregistrement a échoué.");
              }
            }}
            aria-pressed={gardee}
            aria-label={gardee ? "Retirer de mon carnet" : "Garder dans mon carnet"}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium",
              gardee ? "border-primary bg-secondary text-primary" : "border-input"
            )}
          >
            <Bookmark className={cn("h-4 w-4", gardee && "fill-current")} aria-hidden="true" />
            {gardee ? "Gardé" : "Garder"}
          </button>
        </div>

        {/* ⭐ LA PORTE DU GÉRANT, EN HAUT DE LA FICHE. Le bloc de reprise est
            au bas de l'onglet Infos : un hôtelier qui trouve sa fiche ne le
            voyait pas sans savoir qu'il existait. Cette ligne y mène.
            ⚠ Masquée à partir de `xl` quand le panneau de droite porte déjà
              son propre bouton ; laissée au voyageur connecté, à qui le bloc
              explique comment passer professionnel. */}
        {!fiche.owner_id && (
          <button
            type="button"
            onClick={allerAuBlocReprise}
            className={cn(
              "mt-1 inline-flex min-h-11 flex-wrap items-center gap-x-1 text-left text-sm text-muted-foreground",
              peutRevendiquer && "xl:hidden"
            )}
          >
            <span>Vous gérez {fiche.name} ?</span>
            <span className="font-semibold text-primary underline underline-offset-4">
              Reprendre la fiche
            </span>
          </button>
        )}

        {fiche.gallery.length > 0 && (
          <div className="mt-5 aspect-[16/10] w-full overflow-hidden rounded-2xl">
            <Carrousel
              images={fiche.gallery.map((url) => ({ url }))}
              alt={fiche.name}
              ajustement="couvrir"
              largeurAffichee="(min-width: 1280px) 620px, 100vw"
            />
          </div>
        )}

        <div
          role="tablist"
          aria-label="Sections de la fiche"
          /* ⚠ ACCROCHÉS SOUS L'ENTÊTE (écran W3). Une fiche complète fait
             plusieurs hauteurs d'écran : sans cela, passer des avis aux
             chambres oblige à remonter tout en haut. Le fond est opaque —
             translucide, le texte qui défile dessous les rendait illisibles. */
          /* ⚠ `top-[61px]` ET NON `top-14` : l'en-tête fait 61 px (frise 4 +
             barre 56 + bordure 1). À 56 px, la barre d'onglets glissait de
             5 px sous lui. */
          className="sticky top-[61px] z-20 -mx-4 mt-6 flex gap-1 overflow-x-auto border-b border-border bg-background px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {onglets
            .filter((o) => o.visible)
            .map((o) => (
              <button
                key={o.cle}
                role="tab"
                aria-selected={onglet === o.cle}
                onClick={() => {
                  ongletChoisi.current = true;
                  setOnglet(o.cle);
                }}
                className={cn(
                  "shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition",
                  onglet === o.cle
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {o.label}
              </button>
            ))}
        </div>

        <div className="mt-4">
          {onglet === "chambres" && (
            <ul className="space-y-3">
              {fiche.rooms.map((c) => (
                <li key={c.id} className="rounded-2xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{c.name}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[
                          c.max_adults && `${c.max_adults} adulte${c.max_adults > 1 ? "s" : ""}`,
                          c.max_children
                            ? `${c.max_children} enfant${c.max_children > 1 ? "s" : ""}`
                            : null,
                          c.view && `vue ${c.view}`,
                          c.hot_water ? "eau chaude" : null,
                          c.private_bath ? "salle d'eau privée" : "sanitaires partagés",
                          c.surface_m2 && `${c.surface_m2} m²`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <p className="shrink-0 text-right">
                      <span className="font-semibold text-primary">{ariary(c.base_price_ar)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {unite(c.price_unit)}
                      </span>
                    </p>
                  </div>

                  {c.description && (
                    <p className="mt-2 text-sm text-muted-foreground">{c.description}</p>
                  )}

                  {/* Les tarifs par saison : un hôtel n'a pas UN prix. */}
                  {c.rates.length > 0 && (
                    <ul className="mt-3 divide-y divide-border rounded-xl border border-border text-sm">
                      {c.rates.map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{t.season_label}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[
                                t.from_date &&
                                  t.to_date &&
                                  `${new Date(t.from_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – ${new Date(t.to_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`,
                                t.board && PENSION[t.board],
                                t.min_nights > 1 && `${t.min_nights} nuits minimum`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                          <span className="shrink-0 font-semibold">{ariary(t.price_ar)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* ── LA GRILLE TARIFAIRE DU LOUEUR (0114) ─────────────────────
              Même gabarit que les chambres : un type de véhicule par carte,
              le prix à droite. « Prix sur demande » quand price_day_ar est
              nul — une grille sans prix vaut mieux que pas de grille, mais
              JAMAIS un montant inventé. */}
          {onglet === "vehicules" && (
            <ul className="space-y-3">
              {vehicules.map((v) => (
                <li key={v.id} className="rounded-2xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">
                        {LIBELLE_VEHICULE[v.vehicle_type] ?? v.vehicle_type}
                        {v.model ? ` — ${v.model}` : ""}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[
                          v.seats && `${v.seats} place${v.seats > 1 ? "s" : ""}`,
                          v.with_driver ? "avec chauffeur" : "sans chauffeur",
                          /* ⚠ `null` = non précisé : on se TAIT. Écrire
                             « en sus » sur un carburant jamais renseigné
                             serait une donnée inventée. */
                          v.fuel_included === true
                            ? "carburant inclus"
                            : v.fuel_included === false
                              ? "carburant en sus"
                              : null,
                          v.km_included_per_day != null &&
                            `${v.km_included_per_day} km/jour inclus`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <p className="shrink-0 text-right">
                      {v.price_day_ar != null ? (
                        <>
                          <span className="font-semibold text-primary">
                            {ariary(v.price_day_ar)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            par jour
                          </span>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Prix sur demande
                        </span>
                      )}
                    </p>
                  </div>

                  {v.price_note && (
                    <p className="mt-2 text-sm text-muted-foreground">{v.price_note}</p>
                  )}

                  {(v.deposit_ar != null || v.price_on) && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {[
                        v.deposit_ar != null && `Caution : ${ariary(v.deposit_ar)}`,
                        /* La date du relevé, comme partout où le site montre
                           un prix : un tarif daté se juge, un tarif nu se
                           croit à tort. */
                        v.price_on &&
                          `Relevé le ${new Date(v.price_on).toLocaleDateString("fr-FR")}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {onglet === "carte" && (
            <div className="space-y-5">
              {fiche.menu_sections.map((s) => {
                const plats = fiche.menu_items.filter((p) => p.section_id === s.id);
                if (!plats.length) return null;
                return (
                  <section key={s.id}>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {s.name}
                    </h3>
                    <ul className="mt-2 divide-y divide-border rounded-2xl border border-border">
                      {plats.map((p) => (
                        <PlatLigne key={p.id} plat={p} />
                      ))}
                    </ul>
                  </section>
                );
              })}

              {fiche.menu_items.some((p) => !p.section_id) && (
                <section>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Autres
                  </h3>
                  <ul className="mt-2 divide-y divide-border rounded-2xl border border-border">
                    {fiche.menu_items
                      .filter((p) => !p.section_id)
                      .map((p) => (
                        <PlatLigne key={p.id} plat={p} />
                      ))}
                  </ul>
                </section>
              )}

              {/* Mode dégradé : la carte papier photographiée. Sans cette
                  échappatoire, une gargote de 45 plats ne publie jamais rien. */}
              {fiche.menu_photos.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    La carte en photo
                  </h3>
                  <div className="mt-2 aspect-[4/5] w-full max-w-md overflow-hidden rounded-2xl border border-border">
                    <Carrousel
                      images={fiche.menu_photos.map((m) => ({ url: m.url }))}
                      alt="Carte de l'établissement"
                      ajustement="contenir"
                      largeurAffichee="(min-width: 1280px) 620px, 100vw"
                    />
                  </div>
                </section>
              )}
            </div>
          )}

          {onglet === "activites" && (
            <ul className="space-y-3">
              {fiche.activities.map((a) => (
                <li key={a.id} className="rounded-2xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{a.name}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[
                          a.duration_h && `${a.duration_h} h`,
                          a.min_people && `à partir de ${a.min_people} personnes`,
                          a.max_people && `${a.max_people} maximum`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {a.price_ar != null && (
                      <p className="shrink-0 text-right">
                        <span className="font-semibold text-primary">{ariary(a.price_ar)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {unite(a.price_unit)}
                        </span>
                      </p>
                    )}
                  </div>
                  {a.description && (
                    <p className="mt-2 text-sm text-muted-foreground">{a.description}</p>
                  )}
                  {a.includes.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Comprend : {a.includes.join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {onglet === "circuits" && (
            <ul className="space-y-4">
              {fiche.tours.map((t) => (
                <li key={t.id} className="rounded-2xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{t.title}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[
                          `${t.duration_days} jour${t.duration_days > 1 ? "s" : ""}`,
                          t.duration_nights != null && `${t.duration_nights} nuits`,
                          t.difficulty,
                          t.format,
                          t.parks_included ? "droits de parc inclus" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {t.prices.length > 0 && (
                      <p className="shrink-0 text-right">
                        <span className="font-semibold text-primary">
                          {ariary(Math.min(...t.prices.map((p) => p.price_ar)))}
                        </span>
                        <span className="block text-xs text-muted-foreground">par personne</span>
                      </p>
                    )}
                  </div>

                  {t.summary && <p className="mt-2 text-sm">{t.summary}</p>}

                  {/* Le prix dépend du nombre de participants : à deux on paie
                      le double par personne de ce qu'on paie à huit. */}
                  {t.prices.length > 1 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {t.prices.map((p) => (
                        <span
                          key={p.base_pax}
                          className="rounded-full border border-border px-2.5 py-1 text-xs"
                        >
                          {p.base_pax} pers. · <strong>{ariary(p.price_ar)}</strong>
                        </span>
                      ))}
                    </div>
                  )}

                  {t.days.length > 0 && (
                    <ol className="mt-3 space-y-2 border-l-2 border-border pl-4">
                      {t.days.map((j) => (
                        <li key={j.jour}>
                          <p className="text-sm font-medium">
                            Jour {j.jour} — {j.titre}
                          </p>
                          {j.detail && <p className="text-sm text-muted-foreground">{j.detail}</p>}
                          {j.nuitee && (
                            <p className="text-xs text-muted-foreground">Nuit : {j.nuitee}</p>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}

                  {t.inclusions.length > 0 && (
                    <div className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
                      {t.inclusions.map((i, k) => (
                        <p
                          key={k}
                          className={i.inclus ? "text-foreground" : "text-muted-foreground"}
                        >
                          {i.inclus ? "✓" : "✗"} {i.libelle}
                        </p>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {onglet === "avis" && (
            <div className="space-y-4">
              {/* La RLS interdit déjà de se noter soi-même ; on ne propose
                  simplement pas le formulaire au propriétaire. */}
              {user && fiche.owner_id !== user.id && (
                <div className="rounded-2xl border border-border p-4">
                  <p className="text-sm font-medium">Vous y êtes allé ?</p>
                  <div className="mt-2 flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setMaNote(n)}
                        aria-label={`${n} sur 5`}
                        className="dk-tap p-0.5"
                      >
                        <Star
                          className={cn(
                            "h-6 w-6",
                            n <= maNote ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
                          )}
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={monAvis}
                    onChange={(e) => setMonAvis(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Ce qui vous a plu, ce qui vous a manqué…"
                    className="mt-2 w-full rounded-xl border border-input bg-background p-3 text-sm"
                  />
                  <button
                    onClick={() => void noter()}
                    disabled={maNote < 1 || envoi}
                    className="mt-2 min-h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {envoi ? "Envoi…" : "Publier mon avis"}
                  </button>
                </div>
              )}

              {avis.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
                  <p className="font-medium">Aucun avis pour le moment</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Soyez le premier à raconter votre passage.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {avis.map((a) => (
                    <li key={a.id} className="rounded-2xl border border-border p-4">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-0.5 text-sm font-semibold">
                          <Star
                            className="h-4 w-4 fill-amber-400 text-amber-400"
                            aria-hidden="true"
                          />
                          {a.note}
                        </span>
                        <Link to={`/user/${a.author.id}`} className="text-sm font-medium">
                          {a.author.name ?? "Membre Diako"}
                        </Link>
                        <time
                          dateTime={a.created_at}
                          className="ml-auto text-xs text-muted-foreground"
                        >
                          {new Date(a.created_at).toLocaleDateString("fr-FR")}
                        </time>
                      </div>
                      {a.body && <p className="mt-2 text-sm">{a.body}</p>}
                      {a.reponse && (
                        <div className="mt-3 rounded-xl bg-secondary/60 p-3">
                          <p className="text-xs font-semibold text-primary">
                            Réponse de l'établissement
                          </p>
                          <p className="mt-1 text-sm">{a.reponse.body}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {onglet === "infos" && (
            <div className="space-y-5">
              {/* ⚠ NETTOYÉE (`descriptionPropre`) : 164 des 251 descriptions
                  publiées portaient « Voir moins », « Écrivez un commentaire
                  public… », « · Suivre » ou « Audio d'origine », recopiés de
                  Facebook avec le texte. */}
              {description && (
                <p className="whitespace-pre-line text-[15px] leading-relaxed">{description}</p>
              )}

              {/* L'ÉTAT VIDE D'ABORD : dire ce qui manque, offrir une action.
                  ⚠ La photo proposée passe par la file de modération (0098) :
                    `dk_poser_photo` sait poser une couverture d'établissement,
                    rien n'est publié sans relecture. */}
              {!avecCouverture && fiche.gallery.length === 0 && (
                <section>
                  <h3 className="text-sm font-semibold">Photos</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pas encore de photo de {fiche.name}.
                  </p>
                  {user ? (
                    <ProposerPhoto
                      className="mt-3"
                      cibleType="etablissement"
                      cible={fiche.id}
                      nom={fiche.name}
                    />
                  ) : (
                    /* ⚠ PAS le lien nu de ProposerPhoto : il part sur /auth
                       sans mémoriser la fiche, et la connexion ramènerait à
                       l'accueil. */
                    <button
                      type="button"
                      onClick={seConnecterPuisRevenir}
                      className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-input px-4 text-sm font-semibold"
                    >
                      <Camera className="h-4 w-4" aria-hidden="true" />
                      Connectez-vous pour proposer une photo
                    </button>
                  )}
                  {!fiche.owner_id && (
                    <button
                      type="button"
                      onClick={allerAuBlocReprise}
                      className="mt-1 flex min-h-11 items-center text-left text-sm font-medium text-primary underline underline-offset-4"
                    >
                      C'est votre établissement ? Ajoutez vos photos en reprenant la fiche.
                    </button>
                  )}
                </section>
              )}

              {/* Le repère en clair : l'adressage normalisé n'existe pas à
                  Madagascar, c'est lui qui permet de trouver l'endroit. */}
              {(fiche.landmark || fiche.address || fiche.place) && (
                <section>
                  <h3 className="text-sm font-semibold">Où c'est</h3>
                  {fiche.address && <p className="mt-1 text-sm">{fiche.address}</p>}
                  {fiche.landmark && (
                    <p className="mt-1 text-sm text-muted-foreground">{fiche.landmark}</p>
                  )}
                  {/* ⚠ `xl:hidden` QUAND LE PANNEAU DE DROITE PORTE DÉJÀ CE
                      LIEN — deux fois à l'écran, c'était un de trop. Le
                      panneau ne le montre qu'avec des coordonnées : sans
                      elles, celui-ci reste le seul. */}
                  <Link
                    to={`/carte?focus=${fiche.slug}`}
                    className={cn(
                      "mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-medium",
                      carteDansPanneau && "xl:hidden"
                    )}
                  >
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    Voir sur la carte
                  </Link>
                </section>
              )}

              {fiche.hours.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold">Horaires</h3>
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {[...fiche.hours]
                      .sort((a, b) => ((a.jour + 6) % 7) - ((b.jour + 6) % 7))
                      .map((h) => (
                        <li key={h.jour} className="flex justify-between gap-4">
                          <span className="text-muted-foreground">{JOURS[h.jour]}</span>
                          <span>
                            {h.ferme_journee
                              ? "Fermé"
                              : `${h.ouvre?.slice(0, 5) ?? "—"} – ${h.ferme?.slice(0, 5) ?? "—"}`}
                          </span>
                        </li>
                      ))}
                  </ul>
                </section>
              )}

              {fiche.amenities.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold">Équipements et services</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {fiche.amenities.map((a) => (
                      <span
                        key={a.code}
                        className="rounded-full border border-border px-2.5 py-1 text-xs"
                      >
                        {a.label}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* ⚠ `payment_methods` vaut ['especes'] PAR DÉFAUT (0007). Sur une
                  fiche éditoriale, ce n'est pas un fait : on ne l'affiche que si
                  le gérant tient sa fiche. */}
              {fiche.owner_id && fiche.payment_methods.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold">Paiement accepté</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {fiche.payment_methods.map((m) => LIBELLE_PAIEMENT[m] ?? m).join(" · ")}
                  </p>
                </section>
              )}

              {(fiche.website || fiche.facebook || fiche.email) && (
                <section>
                  <h3 className="text-sm font-semibold">Liens</h3>
                  <div className="mt-1 flex flex-col gap-1 text-sm">
                    {fiche.website && (
                      <a
                        href={fiche.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-primary underline underline-offset-4"
                      >
                        <Globe className="h-4 w-4" aria-hidden="true" />
                        Site web
                      </a>
                    )}
                    {fiche.facebook && (
                      <a
                        href={fiche.facebook}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-4"
                      >
                        Page Facebook
                      </a>
                    )}
                    {fiche.email && (
                      <a
                        href={`mailto:${fiche.email}`}
                        className="text-primary underline underline-offset-4"
                      >
                        {fiche.email}
                      </a>
                    )}
                  </div>
                </section>
              )}

              {/* La preuve sociale : les récits qui citent l'établissement. */}
              {recits.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold">Ils en parlent</h3>
                  <ul className="mt-2 divide-y divide-border rounded-2xl border border-border">
                    {recits.map((r) => (
                      <li key={r.id}>
                        <Link to={`/post/${r.id}`} className="block px-4 py-3 hover:bg-muted/50">
                          <p className="line-clamp-2 text-sm">{r.body ?? "Publication photo"}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* La fraîcheur des tarifs est le nerf de la guerre : un prix de
                  l'an dernier vaut moins que pas de prix du tout. */}
              {fiche.rates_checked_at && (
                <p className="text-xs text-muted-foreground">
                  Tarifs vérifiés le {new Date(fiche.rates_checked_at).toLocaleDateString("fr-FR")}.
                </p>
              )}

              {/* 🔴 CE BOUTON N'EXISTAIT PAS, alors que le rail de droite
                  invitait deja a « signaler une erreur depuis la fiche ». La
                  phrase engageait le produit sur un geste qu'il n'offrait pas,
                  et sur le point le plus sensible — la fraicheur des prix.
                  ⚠ C'est devenu le canal le plus utile du site : 3 158 fiches
                    viennent d'OpenStreetMap, ou un releve peut dater de
                    plusieurs annees. Un etablissement ferme, deplace ou renomme
                    n'avait aucun moyen d'etre corrige. */}
              <button
                onClick={() => void signalerFiche()}
                className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-full border border-input px-4 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                Signaler une erreur sur cette fiche
              </button>

              {/* ⭐ FICHE ÉDITORIALE. Au lancement, c'est Diako qui saisit les
                  établissements : la fiche dit alors D'OÙ vient l'information
                  et propose au gérant de la reprendre. Afficher la source n'est
                  pas de la coquetterie — c'est ce qui distingue une donnée
                  relevée d'une donnée inventée, et ce projet a déjà payé pour
                  le savoir. */}
              {/* ⚠ LE BLOC DIT CE QU'IL FAUDRA AVANT LE CLIC : numéro, photo
                  prise sur place, NIF et STAT ou document. Le découvrir dans le
                  formulaire, après la création du compte, faisait abandonner.
                  🔴 `hidden={!!user && !estPro}` NE CACHAIT RIEN : la classe
                     `inline-flex` bat l'attribut `[hidden]`. Le bouton s'affiche
                     désormais par rendu conditionnel, et le voyageur lit à sa
                     place comment passer professionnel. */}
              {!fiche.owner_id && (
                <section
                  ref={blocReprise}
                  aria-labelledby="titre-reprise"
                  className="rounded-2xl border border-border bg-secondary/40 p-4"
                >
                  <h3
                    id="titre-reprise"
                    ref={titreReprise}
                    tabIndex={-1}
                    className="text-sm font-semibold focus:outline-none"
                  >
                    Vous gérez {fiche.name} ?
                  </h3>
                  <p className="mt-1 text-sm">
                    Reprenez cette fiche, c'est gratuit. Vous ajouterez vos
                    photos, vos chambres et vos tarifs, et recevrez les messages
                    des voyageurs.
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Il vous faudra un numéro où vous rappeler, une photo du lieu
                    prise sur place, et votre NIF et STAT ou un document à votre
                    nom. Nous vérifions chaque dossier à la main, puis nous vous
                    appelons.
                  </p>

                  {user && profilEnCours ? null : peutRevendiquer ? (
                    /* `xl:hidden` : à partir de `xl`, le panneau de droite
                       porte le même bouton. */
                    <button
                      type="button"
                      onClick={revendiquerFiche}
                      className="mt-3 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground xl:hidden"
                    >
                      C'est mon établissement
                    </button>
                  ) : (
                    <div className="mt-3 rounded-xl border border-border bg-card p-3">
                      <p className="text-sm">
                        Votre compte est un compte voyageur. Pour reprendre cette
                        fiche, passez-le d'abord en compte professionnel : dans
                        Mon compte, onglet Mon profil, touchez « Devenir
                        professionnel », puis revenez sur cette page.
                      </p>
                      <Link
                        to="/compte?onglet=profil"
                        className="mt-2 inline-flex min-h-11 items-center rounded-full border border-primary px-5 text-sm font-semibold text-primary"
                      >
                        Passer en compte professionnel
                      </Link>
                    </div>
                  )}

                  <p className="mt-3 text-xs text-muted-foreground">
                    Cette fiche est tenue par Diako : nous l'avons créée pour que
                    l'établissement soit trouvable.
                  </p>
                  {/* 🔴 LA SOURCE DOIT ETRE CLIQUABLE. Une partie des textes de
                      ces fiches vient de Wikivoyage, en CC BY-SA : la licence
                      exige de lier l'article precis — c'est lui qui porte
                      l'historique des auteurs. Une URL affichee en texte brut ne
                      satisfait pas cette obligation, et personne ne la recopie
                      a la main. */}
                  {fiche.source && <SourceLiee texte={fiche.source} />}
                </section>
              )}
            </div>
          )}
        </div>
        </div>

        <PanneauDemande
          fiche={fiche}
          onEcrire={() => void ecrire()}
          onRevendiquer={revendiquerFiche}
          peutRevendiquer={peutRevendiquer}
        />
      </div>

      {revendicationOuverte && (
        <Revendication ficheId={fiche.id} ficheNom={fiche.name} onFerme={() => setRevendicationOuverte(false)} />
      )}

      {partageOuvert && (
        <PartagerMenu
          url={`${window.location.origin}/p/${fiche.slug}`}
          texte={fiche.place ? `${fiche.name} — ${fiche.place.name}` : fiche.name}
          onFermer={fermerPartage}
        />
      )}
    </div>
  );
}

/**
 * « C'est mon établissement. »
 *
 * On demande un numéro de rappel plutôt que de valider automatiquement :
 * accepter une revendication donne accès aux messages des clients de
 * l'établissement. Un simple clic ne peut pas suffire — un coup de téléphone,
 * si.
 */

/** Une ligne de carte : le nom tel que le restaurateur l'écrit, et son prix. */
function PlatLigne({ plat }: { plat: Fiche["menu_items"][number] }) {
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {plat.name}
          {plat.is_signature && (
            // ⚠ `text-accent-strong` : le corail #F4633A ne porte jamais de
            //   texte (3,14:1). #BF4118 sur ce fond corail à 10 % : 4,7:1.
            <span className="ml-1.5 rounded-full bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent-strong">
              spécialité
            </span>
          )}
          {!plat.in_stock && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              — indisponible
            </span>
          )}
        </p>
        {plat.description && <p className="text-xs text-muted-foreground">{plat.description}</p>}
        {plat.side_dish && (
          <p className="text-xs text-muted-foreground">Servi avec {plat.side_dish}</p>
        )}
      </div>
      <span className="shrink-0 text-sm font-semibold text-primary">
        {plat.price_ar != null ? ariary(plat.price_ar) : "—"}
      </span>
    </li>
  );
}
