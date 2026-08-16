import { useCallback, useEffect, useState } from "react";
import { useRetour } from "@/hooks/useRetour";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, Eye, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { ApercuMobile } from "@/components/ApercuMobile";
import { Cogestion, jeGereCettePage } from "@/components/Cogestion";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { compressImage } from "@/lib/imageCompression";
import { uploadToO2Switch } from "@/lib/o2switchUpload";
import {
  activitesDe,
  ajouterPhotoCarte,
  ariary,
  carteDe,
  chambresDe,
  chargerDestinations,
  chargerEquipements,
  chargerFiche,
  chargerPlats,
  circuitsDe,
  definirEquipements,
  enregistrerActivite,
  enregistrerChambre,
  enregistrerCircuit,
  chargerJoursCircuit,
  enregistrerJoursCircuit,
  enregistrerPlat,
  enregistrerPrixCircuit,
  enregistrerSection,
  enregistrerTarif,
  majEtablissement,
  supprimerActivite,
  supprimerChambre,
  supprimerCircuit,
  supprimerPlat,
  supprimerTarif,
  tarifsDe,
  type Fiche,
  type Lieu,
  type Plat,
} from "@/lib/etablissements";
import { cn } from "@/lib/utils";

type Onglet = "infos" | "chambres" | "carte" | "activites" | "circuits";

/** Les deux façons d'avoir le droit d'être ici — elles ne donnent PAS la même
 *  chose, et l'écran doit le dire. */
type Role = "proprietaire" | "gestionnaire";

const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

/** Les mêmes libellés que sur la fiche publique : le gérant doit lire dans sa
 *  console exactement le mot que verra le voyageur. */
const PENSION: Record<string, string> = {
  chambre_seule: "Chambre seule",
  petit_dej: "Petit déjeuner",
  demi_pension: "Demi-pension",
  pension_complete: "Pension complète",
  all_in: "Tout compris",
};

/**
 * La console de gestion d'un établissement.
 *
 * C'est ici qu'un gérant d'Ifaty saisit ses douze chambres à 85 000 Ar et son
 * ravitoto à 12 000 Ar. Rien de tout cela n'existait : /pro affichait six
 * boutons « Bientôt disponible », et src/components/guards/ était un dossier
 * VIDE — aucune route n'était protégée.
 *
 * Deux partis pris de saisie, tirés du terrain :
 *
 *  ① UN SEUL TARIF SUFFIT. La chambre porte un prix de référence ; les saisons
 *    sont facultatives. Beaucoup d'établissements malgaches pratiquent un tarif
 *    ferme toute l'année — si on impose quatre saisons, personne ne remplit.
 *
 *  ② LA CARTE PEUT ÊTRE UNE PHOTO. Saisir quarante-cinq plats prend une
 *    soirée, photographier la carte papier prend trente secondes. Le mode
 *    dégradé n'est pas un pis-aller, c'est ce qui décide qu'une gargote publie
 *    ou renonce.
 *
 * Le rattachement d'un plat au référentiel reste FACULTATIF, mais c'est lui
 * qui fait remonter l'établissement dans « où manger du ravitoto ». On le dit
 * à l'écran plutôt que de l'imposer.
 */
export default function ProConsole() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  /** ⚠ Repli sur /pro seulement si on est arrive ici DIRECTEMENT. */
  const retour = useRetour("/pro");

  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "refus" | "absente">("chargement");
  const [role, setRole] = useState<Role | null>(null);
  const [onglet, setOnglet] = useState<Onglet>("infos");
  /** Incrémenté après chaque enregistrement : l'aperçu se recharge alors seul. */
  const [versionApercu, setVersionApercu] = useState(0);

  useDocumentTitle(fiche ? `Gérer — ${fiche.name}` : "Espace professionnel");

  const recharger = useCallback(async () => {
    if (!slug) return;
    try {
      const f = await chargerFiche(slug);
      if (!f) return setEtat("absente");
      // Garde d'accès : la RLS bloque déjà toute écriture, mais afficher
      // un formulaire qu'on n'a pas le droit d'enregistrer est une promesse
      // qu'on ne tient pas.
      if (!user) return setEtat("refus");
      // 🔴 LA GARDE COMPARAIT `owner_id`, ET RIEN D'AUTRE. La co-gestion
      //    existait pourtant en base depuis 0076 : un gestionnaire nommé par le
      //    propriétaire, à qui la RLS accorde déjà les chambres, la carte, les
      //    activités et les demandes, était éconduit d'ici exactement comme un
      //    inconnu. La table était donc sans effet — même remplie à la main.
      //
      // ⚠ LE COURT-CIRCUIT N'EST PAS COSMÉTIQUE : le propriétaire, qui est le
      //   cas courant, ne paie aucun aller-retour de plus. Et cet appel vit
      //   dans le CHARGEMENT, jamais dans le rendu — `recharger` rejoue après
      //   chaque enregistrement, pas à chaque frappe.
      const proprietaire = f.owner_id === user.id;
      if (!proprietaire && !(await jeGereCettePage(f.id, user.id))) return setEtat("refus");
      setRole(proprietaire ? "proprietaire" : "gestionnaire");
      setFiche(f);
      setEtat("ok");
    } catch {
      setEtat("absente");
    }
  }, [slug, user]);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  /**
   * Ce que chaque onglet appelle après avoir enregistré : on relit la fiche ET
   * on fait rejouer l'aperçu. Les deux ensemble, jamais l'un sans l'autre — un
   * aperçu figé sur l'état d'avant est pire que pas d'aperçu du tout.
   */
  const majEtApercu = useCallback(async () => {
    await recharger();
    setVersionApercu((n) => n + 1);
  }, [recharger]);

  if (etat === "chargement") {
    return (
      <div className="space-y-3 px-4 py-6">
        <div className="dk-skeleton h-8 w-1/2" />
        <div className="dk-skeleton h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (etat === "refus" || etat === "absente" || !fiche) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">
          {etat === "refus" ? "Vous ne gérez pas cette fiche" : "Fiche introuvable"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {etat === "refus"
            ? "Son propriétaire, ou une personne qu'il a nommée pour l'aider, peut la modifier."
            : "Le lien est peut-être périmé."}
        </p>
        <Link
          to="/pro"
          className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          Mon espace professionnel
        </Link>
      </div>
    );
  }

  const onglets: { cle: Onglet; label: string }[] = [
    { cle: "infos", label: "Ma fiche" },
    { cle: "chambres", label: `Chambres (${fiche.rooms.length})` },
    { cle: "carte", label: `Carte (${fiche.menu_items.length})` },
    { cle: "activites", label: `Activités (${fiche.activities.length})` },
    { cle: "circuits", label: `Circuits (${fiche.tours.length})` },
  ];

  return (
    <div className="px-4 py-5">
      <div className="flex items-center gap-2">
        <button
          onClick={retour}
          aria-label="Retour"
          className="dk-tap grid h-9 w-9 place-items-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{fiche.name}</h1>
        {/* À quel titre on est ici. Sur téléphone la place manque : c'est le
            bandeau ci-dessous qui porte l'information, en toutes lettres. */}
        <span
          className={cn(
            "hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold sm:inline",
            role === "proprietaire" ? "bg-primary/10 text-primary" : "bg-secondary"
          )}
        >
          {role === "proprietaire" ? "Propriétaire" : "Gestionnaire"}
        </span>
        <Link
          to={`/p/${fiche.slug}`}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-input px-3 text-sm"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          Voir
        </Link>
      </div>

      {/* ⚠ UN GESTIONNAIRE DOIT SAVOIR CE QU'IL N'EST PAS. Il ouvre exactement
          la même console que le propriétaire : sans ce bandeau, il croit tenir
          la fiche entière et découvre le contraire au premier refus — ou pire,
          promet à quelqu'un un transfert qu'il ne peut pas faire. */}
      {role === "gestionnaire" && (
        <p className="mt-3 flex gap-2 rounded-xl bg-secondary p-3 text-xs leading-relaxed">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <strong className="font-semibold">Vous gérez cette fiche</strong> sans en
            être le propriétaire. Chambres, carte, activités, circuits, demandes des
            voyageurs : tout cela est à vous. En revanche la page ne peut pas vous
            être transférée depuis cet écran, et vous ne pouvez pas nommer d'autres
            gestionnaires — cela reste au propriétaire.
          </span>
        </p>
      )}

      <div
        role="tablist"
        className="mt-4 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {onglets.map((o) => (
          <button
            key={o.cle}
            role="tab"
            aria-selected={onglet === o.cle}
            onClick={() => setOnglet(o.cle)}
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

      {/* ⚠ L'APERÇU N'APPARAÎT QU'À PARTIR DE `xl`. En dessous, la console
          elle-même a besoin de toute la largeur : un aperçu de 400 px collé à
          côté d'un formulaire écrasé n'aide personne. Le bouton « Voir » de
          l'entête reste la porte de sortie sur les écrans plus étroits. */}
      <div className="mt-5 xl:flex xl:items-start xl:gap-6">
        <div className="min-w-0 flex-1">
          {onglet === "infos" && <OngletInfos fiche={fiche} onMaj={majEtApercu} />}
          {onglet === "chambres" && <OngletChambres fiche={fiche} onMaj={majEtApercu} />}
          {onglet === "carte" && <OngletCarte fiche={fiche} onMaj={majEtApercu} />}
          {onglet === "activites" && <OngletActivites fiche={fiche} onMaj={majEtApercu} />}
          {onglet === "circuits" && <OngletCircuits fiche={fiche} onMaj={majEtApercu} />}

          {/* ⚠ RÉSERVÉ AU PROPRIÉTAIRE, et pas seulement parce que la policy
              `pg_proprietaire` le veut : `pg_lecture` ne montre à un
              gestionnaire que SA propre ligne. Monté pour lui, ce panneau
              afficherait une liste d'une seule personne — il en conclurait
              qu'il gère seul, ce qui serait faux.

              Il vit sous « Ma fiche » : c'est l'onglet de l'identité de
              l'établissement, pas celui des tarifs. */}
          {onglet === "infos" && role === "proprietaire" && (
            <div className="mt-4">
              <Cogestion
                pageId={fiche.id}
                proprietaireId={fiche.owner_id}
                estProprietaire
              />
            </div>
          )}
        </div>

        <ApercuMobile slug={fiche.slug} publiee={fiche.is_published} version={versionApercu} />
      </div>
    </div>
  );
}

/* ══ Champs communs ════════════════════════════════════════════════════ */

function Champ({
  label,
  aide,
  children,
}: {
  label: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {aide && <span className="mt-0.5 block text-xs text-muted-foreground">{aide}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const champCss = "w-full rounded-xl border border-input bg-background p-2.5 text-sm";

/** Envoi d'image vers o2switch — jamais vers Supabase Storage (règle du projet). */
async function envoyerImage(f: File, dossier: "pages" | "posts" = "pages") {
  const compresse = await compressImage(f);
  const res = await uploadToO2Switch(compresse, dossier);
  if (!res.success || !res.url) throw new Error(res.error || "L'image n'a pas pu être envoyée.");
  return res.url;
}

/* ══ Onglet : ma fiche ═════════════════════════════════════════════════ */

function OngletInfos({ fiche, onMaj }: { fiche: Fiche; onMaj: () => Promise<void> }) {
  const [f, setF] = useState({
    name: fiche.name,
    short_desc: fiche.short_desc ?? "",
    long_desc: fiche.long_desc ?? "",
    place_id: fiche.place?.id ?? "",
    address: fiche.address ?? "",
    landmark: fiche.landmark ?? "",
    phone: fiche.phone ?? "",
    whatsapp: fiche.whatsapp ?? "",
    email: fiche.email ?? "",
    website: fiche.website ?? "",
    facebook: fiche.facebook ?? "",
    is_published: fiche.is_published !== false,
  });
  const [destinations, setDestinations] = useState<Lieu[]>([]);
  const [equipements, setEquipements] = useState<
    Awaited<ReturnType<typeof chargerEquipements>>
  >([]);
  const [coches, setCoches] = useState<string[]>(fiche.amenities.map((a) => a.code));
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    void chargerDestinations(200).then(setDestinations).catch(() => undefined);
    void chargerEquipements().then(setEquipements).catch(() => undefined);
  }, []);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    try {
      await majEtablissement(fiche.id, {
        name: f.name.trim(),
        short_desc: f.short_desc.trim() || null,
        long_desc: f.long_desc.trim() || null,
        place_id: f.place_id || null,
        address: f.address.trim() || null,
        landmark: f.landmark.trim() || null,
        phone: f.phone.trim() || null,
        whatsapp: f.whatsapp.trim() || null,
        email: f.email.trim() || null,
        website: f.website.trim() || null,
        facebook: f.facebook.trim() || null,
        is_published: f.is_published,
      });
      await definirEquipements(fiche.id, coches);
      toast.success("Fiche enregistrée.");
      await onMaj();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "L'enregistrement a échoué.");
    } finally {
      setEnCours(false);
    }
  }

  async function changerCouverture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setEnCours(true);
    try {
      const url = await envoyerImage(file);
      await majEtablissement(fiche.id, { cover_url: url });
      toast.success("Photo de couverture mise à jour.");
      await onMaj();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setEnCours(false);
    }
  }

  async function ajouterGalerie(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setEnCours(true);
    try {
      const urls: string[] = [];
      for (const file of files.slice(0, 12)) urls.push(await envoyerImage(file));
      await majEtablissement(fiche.id, { gallery: [...fiche.gallery, ...urls] });
      toast.success(`${urls.length} photo${urls.length > 1 ? "s" : ""} ajoutée${urls.length > 1 ? "s" : ""}.`);
      await onMaj();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={enregistrer} className="space-y-4">
      <div className="rounded-2xl border border-border p-4">
        <p className="text-sm font-medium">Photos</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-input px-4 text-sm">
            <input type="file" accept="image/*" onChange={changerCouverture} className="sr-only" />
            {fiche.cover_url ? "Changer la couverture" : "Ajouter une couverture"}
          </label>
          <label className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-input px-4 text-sm">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={ajouterGalerie}
              className="sr-only"
            />
            Ajouter à la galerie ({fiche.gallery.length})
          </label>
        </div>
      </div>

      <Champ label="Nom">
        <input
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          maxLength={120}
          className={champCss}
        />
      </Champ>

      <Champ label="En une phrase" aide="C'est ce qui s'affiche dans les résultats de recherche.">
        <input
          value={f.short_desc}
          onChange={(e) => setF({ ...f, short_desc: e.target.value })}
          maxLength={200}
          className={champCss}
        />
      </Champ>

      <Champ label="Présentation">
        <textarea
          value={f.long_desc}
          onChange={(e) => setF({ ...f, long_desc: e.target.value })}
          rows={5}
          maxLength={4000}
          className={champCss}
        />
      </Champ>

      <Champ label="Destination">
        <select
          value={f.place_id}
          onChange={(e) => setF({ ...f, place_id: e.target.value })}
          className={champCss}
        >
          <option value="">Choisir…</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name_fr}
              {d.region ? ` — ${d.region}` : ""}
            </option>
          ))}
        </select>
      </Champ>

      <Champ label="Adresse">
        <input
          value={f.address}
          onChange={(e) => setF({ ...f, address: e.target.value })}
          className={champCss}
        />
      </Champ>

      {/* Le repère en clair vaut mieux qu'une adresse : l'adressage normalisé
          n'existe pas à Madagascar, et c'est ce qu'on donne au taxi. */}
      <Champ
        label="Le repère"
        aide="« En face de la station Jovenna, après le pont. » C'est souvent plus utile que l'adresse."
      >
        <input
          value={f.landmark}
          onChange={(e) => setF({ ...f, landmark: e.target.value })}
          className={champCss}
        />
      </Champ>

      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Téléphone">
          <input
            value={f.phone}
            onChange={(e) => setF({ ...f, phone: e.target.value })}
            inputMode="tel"
            className={champCss}
          />
        </Champ>
        <Champ label="WhatsApp" aide="Avec l'indicatif : +261 34 …">
          <input
            value={f.whatsapp}
            onChange={(e) => setF({ ...f, whatsapp: e.target.value })}
            inputMode="tel"
            className={champCss}
          />
        </Champ>
        <Champ label="E-mail">
          <input
            type="email"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
            className={champCss}
          />
        </Champ>
        <Champ label="Site web">
          <input
            value={f.website}
            onChange={(e) => setF({ ...f, website: e.target.value })}
            className={champCss}
          />
        </Champ>
      </div>

      <Champ label="Page Facebook">
        <input
          value={f.facebook}
          onChange={(e) => setF({ ...f, facebook: e.target.value })}
          className={champCss}
        />
      </Champ>

      {/* Une case cochée est filtrable ; un mot dans une description ne l'est
          pas. C'est toute la différence entre « on a une piscine » et
          « les voyageurs qui cherchent une piscine nous trouvent ». */}
      <div className="rounded-2xl border border-border p-4">
        <p className="text-sm font-medium">Équipements et services</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Ce sont des filtres : cocher « piscine » vous fait apparaître dans les
          recherches avec piscine.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {equipements.map((a) => {
            const actif = coches.includes(a.code);
            return (
              <button
                key={a.code}
                type="button"
                onClick={() =>
                  setCoches((l) => (actif ? l.filter((c) => c !== a.code) : [...l, a.code]))
                }
                aria-pressed={actif}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-xs transition",
                  actif
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                )}
              >
                {a.label_fr}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex items-center gap-2.5 rounded-2xl border border-border p-4">
        <input
          type="checkbox"
          checked={f.is_published}
          onChange={(e) => setF({ ...f, is_published: e.target.checked })}
          className="h-4 w-4"
        />
        <span className="text-sm">
          <span className="font-medium">Fiche visible du public</span>
          <span className="block text-xs text-muted-foreground">
            Décochez pour la retirer le temps de la compléter.
          </span>
        </span>
      </label>

      <button
        type="submit"
        disabled={enCours}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 font-medium text-primary-foreground disabled:opacity-50"
      >
        {enCours && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Enregistrer
      </button>
    </form>
  );
}

/* ══ Onglet : chambres ═════════════════════════════════════════════════ */

function OngletChambres({ fiche, onMaj }: { fiche: Fiche; onMaj: () => Promise<void> }) {
  const [chambres, setChambres] = useState<Awaited<ReturnType<typeof chambresDe>>>([]);
  const [ouvert, setOuvert] = useState<string | "nouveau" | null>(null);

  const recharger = useCallback(async () => {
    setChambres(await chambresDe(fiche.id));
  }, [fiche.id]);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  return (
    <div className="space-y-3">
      {/* ⚠ LE TABLEAU EST LA FORME DE L'ÉCRAN W4, et il n'apparaît qu'à partir
          de `lg`. Un catalogue, ça se relit en colonne : le gérant vérifie que
          ses six chambres n'ont pas un prix aberrant en balayant UNE colonne,
          pas en dépliant six cartes. En dessous de 1024 px, la même table
          demanderait un défilement horizontal — les cartes restent meilleures.

          ⚠ LES TARIFS DE SAISON SONT DES LIGNES FILLES de leur chambre, pas
          une liste à part. Séparés, on ne voit plus quel prix appartient à
          quoi — et c'est exactement l'erreur qui fait facturer la basse saison
          au tarif de Noël. */}
      {chambres.length > 0 && (
        <div className="hidden overflow-hidden rounded-2xl border border-border lg:block">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Chambres et tarifs de saison de {fiche.name}
            </caption>
            <thead className="bg-secondary/60 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Chambre</th>
                <th scope="col" className="px-3 py-2 font-semibold">Unités</th>
                <th scope="col" className="px-3 py-2 font-semibold">Capacité</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Prix de référence</th>
                <th scope="col" className="px-3 py-2 font-semibold">État</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {chambres.map((c) => (
                <LigneChambre
                  key={c.id}
                  chambre={c}
                  ouverte={ouvert === c.id}
                  onBasculer={() => setOuvert(ouvert === c.id ? null : c.id)}
                  onSupprimer={async () => {
                    if (!confirm(`Supprimer « ${c.name} » et ses tarifs ?`)) return;
                    await supprimerChambre(c.id);
                    await recharger();
                    await onMaj();
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Le formulaire d'édition reste sous le tableau : une chambre ouverte
          dans une cellule de tableau ne tient pas, et l'imbriquer casserait la
          sémantique de la table pour les lecteurs d'écran. */}
      {ouvert && ouvert !== "nouveau" && chambres.some((c) => c.id === ouvert) && (
        <div className="hidden rounded-2xl border border-primary/30 p-4 lg:block">
          <p className="font-medium">
            {chambres.find((c) => c.id === ouvert)!.name}
          </p>
          <FormChambre
            pageId={fiche.id}
            chambre={chambres.find((c) => c.id === ouvert)!}
            onFini={async () => {
              setOuvert(null);
              await recharger();
              await onMaj();
            }}
          />
        </div>
      )}

      {/* La forme carte, sur téléphone et tablette. */}
      {chambres.map((c) => (
        <div key={c.id} className="rounded-2xl border border-border p-4 lg:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">
                {c.units_count} unité{c.units_count > 1 ? "s" : ""} ·{" "}
                {ariary(c.base_price_ar)} de référence
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => setOuvert(ouvert === c.id ? null : c.id)}
                className="min-h-9 rounded-full border border-input px-3 text-sm"
              >
                {ouvert === c.id ? "Fermer" : "Modifier"}
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Supprimer « ${c.name} » et ses tarifs ?`)) return;
                  await supprimerChambre(c.id);
                  await recharger();
                  await onMaj();
                }}
                aria-label="Supprimer"
                className="dk-tap grid h-9 w-9 place-items-center rounded-full border border-input text-destructive"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          {ouvert === c.id && (
            <FormChambre
              pageId={fiche.id}
              chambre={c}
              onFini={async () => {
                setOuvert(null);
                await recharger();
                await onMaj();
              }}
            />
          )}
        </div>
      ))}

      {ouvert === "nouveau" ? (
        <div className="rounded-2xl border border-border p-4">
          <p className="font-medium">Nouvelle chambre</p>
          <FormChambre
            pageId={fiche.id}
            onFini={async () => {
              setOuvert(null);
              await recharger();
              await onMaj();
            }}
          />
        </div>
      ) : (
        <button
          onClick={() => setOuvert("nouveau")}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-5 font-medium text-primary-foreground"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Ajouter une chambre
        </button>
      )}
    </div>
  );
}

/**
 * Une chambre dans le tableau, suivie de ses tarifs de saison en lignes
 * filles (écran W4).
 *
 * ⚠ LES TARIFS SONT CHARGÉS À L'OUVERTURE DE LA LIGNE, pas au montage du
 *   tableau. Une requête par chambre au chargement, c'est six allers-retours
 *   pour un gérant qui ne venait vérifier qu'un prix.
 */
function LigneChambre({
  chambre,
  ouverte,
  onBasculer,
  onSupprimer,
}: {
  chambre: Awaited<ReturnType<typeof chambresDe>>[number];
  ouverte: boolean;
  onBasculer: () => void;
  onSupprimer: () => Promise<void>;
}) {
  const [tarifs, setTarifs] = useState<Awaited<ReturnType<typeof tarifsDe>> | null>(null);
  const [deplie, setDeplie] = useState(false);

  useEffect(() => {
    if (!deplie || tarifs) return;
    void tarifsDe(chambre.id).then(setTarifs);
  }, [deplie, tarifs, chambre.id]);

  const capacite = [
    chambre.max_adults && `${chambre.max_adults} adulte${chambre.max_adults > 1 ? "s" : ""}`,
    chambre.max_children && `${chambre.max_children} enfant${chambre.max_children > 1 ? "s" : ""}`,
  ]
    .filter(Boolean)
    .join(" + ");

  return (
    <>
      <tr className={cn(ouverte && "bg-secondary/40")}>
        <th scope="row" className="px-3 py-2.5 text-left font-medium">
          <button
            onClick={() => setDeplie(!deplie)}
            aria-expanded={deplie}
            className="inline-flex items-center gap-1.5 text-left"
          >
            <ChevronRight
              className={cn("h-4 w-4 shrink-0 transition-transform", deplie && "rotate-90")}
              aria-hidden="true"
            />
            {chambre.name}
          </button>
        </th>
        <td className="px-3 py-2.5 tabular-nums">{chambre.units_count}</td>
        <td className="px-3 py-2.5 text-muted-foreground">{capacite || "—"}</td>
        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
          {ariary(chambre.base_price_ar)}
        </td>
        <td className="px-3 py-2.5">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              chambre.status === "active"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            {chambre.status === "active" ? "En ligne" : "Masquée"}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex justify-end gap-1.5">
            <button
              onClick={onBasculer}
              className="min-h-8 rounded-full border border-input px-3 text-xs font-medium"
            >
              {ouverte ? "Fermer" : "Modifier"}
            </button>
            <button
              onClick={() => void onSupprimer()}
              aria-label={`Supprimer ${chambre.name}`}
              className="grid h-8 w-8 place-items-center rounded-full border border-input text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </td>
      </tr>

      {/* ── Les lignes filles : un tarif de saison par ligne ───────────── */}
      {deplie &&
        (tarifs === null ? (
          <tr>
            <td colSpan={6} className="px-3 py-2">
              <div className="dk-skeleton h-4 w-40" />
            </td>
          </tr>
        ) : tarifs.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-3 py-2 pl-10 text-xs text-muted-foreground">
              Aucun tarif de saison. C'est le prix de référence qui s'affiche toute
              l'année — une réponse valable, pas un oubli.
            </td>
          </tr>
        ) : (
          tarifs.map((t) => (
            <tr key={t.id} className="bg-muted/25 text-xs">
              <td className="py-2 pl-10 pr-3">
                <span className="font-medium">{t.season_label}</span>
                {t.from_date && t.to_date && (
                  <span className="ml-1.5 text-muted-foreground">
                    {t.from_date} → {t.to_date}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {t.min_nights > 1 ? `${t.min_nights} nuits mini` : "—"}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {t.board ? PENSION[t.board] ?? t.board : "—"}
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">
                {ariary(t.price_ar)}
              </td>
              <td className="px-3 py-2 text-muted-foreground" colSpan={2}>
                {/* Le tarif résident est une réalité du tourisme malgache : il
                    est affiché, jamais confondu avec le prix public. */}
                {t.resident_price_ar != null
                  ? `Résident ${ariary(t.resident_price_ar)}`
                  : ""}
              </td>
            </tr>
          ))
        ))}
    </>
  );
}

function FormChambre({
  pageId,
  chambre,
  onFini,
}: {
  pageId: string;
  chambre?: Awaited<ReturnType<typeof chambresDe>>[number];
  onFini: () => Promise<void>;
}) {
  const [f, setF] = useState({
    name: chambre?.name ?? "",
    description: chambre?.description ?? "",
    units_count: chambre?.units_count ?? 1,
    max_adults: chambre?.max_adults ?? 2,
    max_children: chambre?.max_children ?? 0,
    view: chambre?.view ?? "",
    hot_water: chambre?.hot_water ?? false,
    private_bath: chambre?.private_bath ?? true,
    base_price_ar: chambre?.base_price_ar ?? 0,
    price_unit: chambre?.price_unit ?? "chambre",
  });
  const [tarifs, setTarifs] = useState<Awaited<ReturnType<typeof tarifsDe>>>([]);
  const [enCours, setEnCours] = useState(false);

  const rechargerTarifs = useCallback(async () => {
    if (chambre) setTarifs(await tarifsDe(chambre.id));
  }, [chambre]);

  useEffect(() => {
    void rechargerTarifs();
  }, [rechargerTarifs]);

  async function enregistrer() {
    if (!f.name.trim() || f.base_price_ar <= 0) {
      toast.error("Un nom et un prix de référence sont nécessaires.");
      return;
    }
    setEnCours(true);
    try {
      await enregistrerChambre(pageId, {
        id: chambre?.id,
        name: f.name.trim(),
        description: f.description.trim() || null,
        units_count: f.units_count,
        max_adults: f.max_adults,
        max_children: f.max_children,
        view: f.view.trim() || null,
        hot_water: f.hot_water,
        private_bath: f.private_bath,
        base_price_ar: f.base_price_ar,
        price_unit: f.price_unit,
      });
      toast.success("Chambre enregistrée.");
      await onFini();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <Champ label="Nom de la chambre">
        <input
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          placeholder="Bungalow vue mer"
          className={champCss}
        />
      </Champ>

      <div className="grid gap-3 sm:grid-cols-3">
        <Champ label="Nombre d'unités">
          <input
            type="number"
            min={1}
            value={f.units_count}
            onChange={(e) => setF({ ...f, units_count: Number(e.target.value) })}
            className={champCss}
          />
        </Champ>
        <Champ label="Adultes">
          <input
            type="number"
            min={1}
            value={f.max_adults}
            onChange={(e) => setF({ ...f, max_adults: Number(e.target.value) })}
            className={champCss}
          />
        </Champ>
        <Champ label="Enfants">
          <input
            type="number"
            min={0}
            value={f.max_children}
            onChange={(e) => setF({ ...f, max_children: Number(e.target.value) })}
            className={champCss}
          />
        </Champ>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Champ label="Vue" aide="mer, lagon, jardin, rizières…">
          <input
            value={f.view}
            onChange={(e) => setF({ ...f, view: e.target.value })}
            className={champCss}
          />
        </Champ>
        <Champ label="Prix de référence (Ar)" aide="Le tarif habituel, hors saison particulière.">
          <input
            type="number"
            min={0}
            step={1000}
            value={f.base_price_ar}
            onChange={(e) => setF({ ...f, base_price_ar: Number(e.target.value) })}
            className={champCss}
          />
        </Champ>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={f.hot_water}
            onChange={(e) => setF({ ...f, hot_water: e.target.checked })}
            className="h-4 w-4"
          />
          Eau chaude
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={f.private_bath}
            onChange={(e) => setF({ ...f, private_bath: e.target.checked })}
            className="h-4 w-4"
          />
          Salle d'eau privée
        </label>
      </div>

      <Champ label="Description">
        <textarea
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
          rows={2}
          className={champCss}
        />
      </Champ>

      <button
        onClick={() => void enregistrer()}
        disabled={enCours}
        className="min-h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {enCours ? "Enregistrement…" : "Enregistrer la chambre"}
      </button>

      {/* Les saisons sont FACULTATIVES : un tarif ferme est une réponse
          valable, et l'imposer ferait renoncer la moitié des établissements. */}
      {chambre && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-sm font-medium">Tarifs par saison</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Facultatif. Sans saison, c'est le prix de référence qui s'affiche.
          </p>

          {tarifs.length > 0 && (
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border text-sm">
              {tarifs.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 truncate">
                    {t.season_label}
                    {t.from_date && t.to_date && (
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        ({t.from_date} → {t.to_date})
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-semibold">{ariary(t.price_ar)}</span>
                  <button
                    onClick={async () => {
                      await supprimerTarif(t.id);
                      await rechargerTarifs();
                      await onFini();
                    }}
                    aria-label="Supprimer ce tarif"
                    className="dk-tap shrink-0 text-destructive"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <FormTarif
            roomTypeId={chambre.id}
            onFini={async () => {
              await rechargerTarifs();
              await onFini();
            }}
          />
        </div>
      )}
    </div>
  );
}

function FormTarif({ roomTypeId, onFini }: { roomTypeId: string; onFini: () => Promise<void> }) {
  const [label, setLabel] = useState("Haute saison");
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  const [prix, setPrix] = useState(0);
  const [pension, setPension] = useState("");

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Nom de la saison"
        className={champCss}
      />
      <input
        type="number"
        min={0}
        step={1000}
        value={prix}
        onChange={(e) => setPrix(Number(e.target.value))}
        placeholder="Prix en Ar"
        className={champCss}
      />
      <input type="date" value={du} onChange={(e) => setDu(e.target.value)} className={champCss} />
      <input type="date" value={au} onChange={(e) => setAu(e.target.value)} className={champCss} />
      <select value={pension} onChange={(e) => setPension(e.target.value)} className={champCss}>
        <option value="">Sans précision</option>
        <option value="chambre_seule">Chambre seule</option>
        <option value="petit_dej">Petit déjeuner inclus</option>
        <option value="demi_pension">Demi-pension</option>
        <option value="pension_complete">Pension complète</option>
        <option value="all_in">Tout compris</option>
      </select>
      <button
        onClick={async () => {
          if (prix <= 0) return toast.error("Indiquez un prix.");
          try {
            await enregistrerTarif(roomTypeId, {
              season_label: label.trim() || "Toute l'année",
              from_date: du || null,
              to_date: au || null,
              price_ar: prix,
              board: pension || null,
            });
            setPrix(0);
            setDu("");
            setAu("");
            toast.success("Tarif ajouté.");
            await onFini();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Ajout impossible.");
          }
        }}
        className="min-h-10 rounded-full border border-input px-4 text-sm font-medium"
      >
        Ajouter ce tarif
      </button>
    </div>
  );
}

/* ══ Onglet : carte ════════════════════════════════════════════════════ */

function OngletCarte({ fiche, onMaj }: { fiche: Fiche; onMaj: () => Promise<void> }) {
  const [carte, setCarte] = useState<Awaited<ReturnType<typeof carteDe>>>({
    sections: [],
    plats: [],
  });
  const [plats, setPlats] = useState<Plat[]>([]);
  const [nouvelleSection, setNouvelleSection] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const recharger = useCallback(async () => {
    setCarte(await carteDe(fiche.id));
  }, [fiche.id]);

  useEffect(() => {
    void recharger();
    void chargerPlats(200).then(setPlats).catch(() => undefined);
  }, [recharger]);

  async function photoCarte(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setEnvoi(true);
    try {
      await ajouterPhotoCarte(fiche.id, await envoyerImage(file));
      toast.success("Photo de la carte ajoutée.");
      await onMaj();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Le mode dégradé mis en avant, pas caché en bas : c'est lui qui décide
          qu'une gargote de 45 plats publie quelque chose plutôt que rien. */}
      <div className="rounded-2xl border border-border bg-secondary/40 p-4">
        <p className="text-sm font-medium">Pas le temps de tout saisir ?</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Photographiez votre carte papier. Elle s'affichera sur votre fiche. Vous
          pourrez saisir les plats plus tard — c'est la saisie qui vous fait
          remonter dans « où manger du ravitoto », mais la photo vaut mieux que
          rien.
        </p>
        <label className="mt-3 inline-flex min-h-10 cursor-pointer items-center rounded-full border border-input bg-background px-4 text-sm">
          <input type="file" accept="image/*" onChange={photoCarte} className="sr-only" />
          {envoi ? "Envoi…" : `Photographier ma carte (${fiche.menu_photos.length})`}
        </label>
      </div>

      {carte.sections.map((s) => (
        <section key={s.id} className="rounded-2xl border border-border p-4">
          <p className="font-medium">{s.name}</p>
          <ul className="mt-2 divide-y divide-border">
            {carte.plats
              .filter((p) => p.section_id === s.id)
              .map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate text-sm">
                    {p.name}
                    {!p.dish_id && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        (non rattaché)
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-semibold">{ariary(p.price_ar)}</span>
                  <button
                    onClick={async () => {
                      await supprimerPlat(p.id);
                      await recharger();
                      await onMaj();
                    }}
                    aria-label="Supprimer"
                    className="dk-tap shrink-0 text-destructive"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
          </ul>
          <FormPlat
            pageId={fiche.id}
            sectionId={s.id}
            plats={plats}
            onFini={async () => {
              await recharger();
              await onMaj();
            }}
          />
        </section>
      ))}

      <div className="rounded-2xl border border-dashed border-border p-4">
        <p className="text-sm font-medium">Nouvelle section</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Entrées, Laoka, Grillades, Desserts, Boissons…
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={nouvelleSection}
            onChange={(e) => setNouvelleSection(e.target.value)}
            placeholder="Nom de la section"
            className={champCss}
          />
          <button
            onClick={async () => {
              if (!nouvelleSection.trim()) return;
              await enregistrerSection(fiche.id, {
                name: nouvelleSection.trim(),
                sort_order: carte.sections.length,
              });
              setNouvelleSection("");
              await recharger();
            }}
            className="min-h-10 shrink-0 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

function FormPlat({
  pageId,
  sectionId,
  plats,
  onFini,
}: {
  pageId: string;
  sectionId: string;
  plats: Plat[];
  onFini: () => Promise<void>;
}) {
  const [nom, setNom] = useState("");
  const [dishId, setDishId] = useState("");
  const [prix, setPrix] = useState(0);

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <input
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        placeholder="Le nom tel que vous l'écrivez"
        className={champCss}
      />
      <input
        type="number"
        min={0}
        step={500}
        value={prix}
        onChange={(e) => setPrix(Number(e.target.value))}
        placeholder="Prix en Ar"
        className={champCss}
      />
      {/* ⭐ Le rattachement au référentiel : facultatif, mais c'est LUI qui
          fait remonter le restaurant dans « qui sert du ravitoto ». */}
      <select
        value={dishId}
        onChange={(e) => setDishId(e.target.value)}
        className={cn(champCss, "sm:col-span-2")}
      >
        <option value="">De quel plat s'agit-il ? (facultatif, aide la recherche)</option>
        {plats.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name_fr}
            {p.name_mg && p.name_mg !== p.name_fr ? ` — ${p.name_mg}` : ""}
          </option>
        ))}
      </select>
      <button
        onClick={async () => {
          if (!nom.trim()) return toast.error("Indiquez le nom du plat.");
          try {
            await enregistrerPlat(pageId, {
              section_id: sectionId,
              name: nom.trim(),
              dish_id: dishId || null,
              price_ar: prix || null,
            });
            setNom("");
            setDishId("");
            setPrix(0);
            await onFini();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Ajout impossible.");
          }
        }}
        className="min-h-10 rounded-full border border-input px-4 text-sm font-medium sm:col-span-2"
      >
        Ajouter ce plat
      </button>
    </div>
  );
}

/* ══ Onglet : activités ════════════════════════════════════════════════ */

function OngletActivites({ fiche, onMaj }: { fiche: Fiche; onMaj: () => Promise<void> }) {
  const [liste, setListe] = useState<Awaited<ReturnType<typeof activitesDe>>>([]);
  const [nom, setNom] = useState("");
  const [duree, setDuree] = useState(0);
  const [prix, setPrix] = useState(0);
  const [desc, setDesc] = useState("");

  const recharger = useCallback(async () => {
    setListe(await activitesDe(fiche.id));
  }, [fiche.id]);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  return (
    <div className="space-y-3">
      {liste.map((a) => (
        <div key={a.id} className="flex items-start justify-between gap-3 rounded-2xl border border-border p-4">
          <div className="min-w-0">
            <p className="font-medium">{a.name}</p>
            <p className="text-xs text-muted-foreground">
              {[a.duration_h && `${a.duration_h} h`, a.price_ar && ariary(a.price_ar)]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <button
            onClick={async () => {
              await supprimerActivite(a.id);
              await recharger();
              await onMaj();
            }}
            aria-label="Supprimer"
            className="dk-tap grid h-9 w-9 shrink-0 place-items-center rounded-full border border-input text-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}

      <div className="rounded-2xl border border-dashed border-border p-4">
        <p className="text-sm font-medium">Nouvelle activité</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Sortie en pirogue, snorkeling, visite guidée, cours de cuisine…
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Nom"
            className={cn(champCss, "sm:col-span-3")}
          />
          <input
            type="number"
            min={0}
            step={0.5}
            value={duree}
            onChange={(e) => setDuree(Number(e.target.value))}
            placeholder="Durée (heures)"
            className={champCss}
          />
          <input
            type="number"
            min={0}
            step={1000}
            value={prix}
            onChange={(e) => setPrix(Number(e.target.value))}
            placeholder="Prix par personne (Ar)"
            className={champCss}
          />
          <button
            onClick={async () => {
              if (!nom.trim()) return toast.error("Indiquez un nom.");
              await enregistrerActivite(fiche.id, {
                name: nom.trim(),
                description: desc.trim() || null,
                duration_h: duree || null,
                price_ar: prix || null,
              });
              setNom("");
              setDuree(0);
              setPrix(0);
              setDesc("");
              await recharger();
              await onMaj();
            }}
            className="min-h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            Ajouter
          </button>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={2}
            placeholder="Ce qui est compris, le déroulé…"
            className={cn(champCss, "sm:col-span-3")}
          />
        </div>
      </div>
    </div>
  );
}

/* ══ Onglet : circuits ═════════════════════════════════════════════════ */

function OngletCircuits({ fiche, onMaj }: { fiche: Fiche; onMaj: () => Promise<void> }) {
  const [liste, setListe] = useState<Awaited<ReturnType<typeof circuitsDe>>>([]);
  const [titre, setTitre] = useState("");
  const [jours, setJours] = useState(1);
  const [resume, setResume] = useState("");
  const [prix2, setPrix2] = useState(0);
  const [prix4, setPrix4] = useState(0);

  const recharger = useCallback(async () => {
    setListe(await circuitsDe(fiche.id));
  }, [fiche.id]);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  return (
    <div className="space-y-3">
      {liste.map((t) => (
        <div key={t.id} className="rounded-2xl border border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{t.title}</p>
              <p className="text-xs text-muted-foreground">
                {t.duration_days} jour{t.duration_days > 1 ? "s" : ""}
                {t.difficulty ? ` · ${t.difficulty}` : ""}
              </p>
            </div>
            <button
              onClick={async () => {
                if (!confirm(`Supprimer « ${t.title} » ?`)) return;
                await supprimerCircuit(t.id);
                await recharger();
                await onMaj();
              }}
              aria-label="Supprimer"
              className="dk-tap grid h-9 w-9 shrink-0 place-items-center rounded-full border border-input text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <JoursCircuit tourId={t.id} nbJours={t.duration_days} onFini={onMaj} />
        </div>
      ))}

      <div className="rounded-2xl border border-dashed border-border p-4">
        <p className="text-sm font-medium">Nouveau circuit</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder="Titre — « RN7, de Tana à Tuléar »"
            className={cn(champCss, "sm:col-span-2")}
          />
          <input
            type="number"
            min={1}
            value={jours}
            onChange={(e) => setJours(Number(e.target.value))}
            placeholder="Nombre de jours"
            className={champCss}
          />
          <input
            value={resume}
            onChange={(e) => setResume(e.target.value)}
            placeholder="En une phrase"
            className={champCss}
          />
          {/* Le prix dépend du nombre de participants : à deux on paie le
              double par personne de ce qu'on paie à huit. Une colonne unique
              ne peut pas le dire. */}
          <input
            type="number"
            min={0}
            step={10000}
            value={prix2}
            onChange={(e) => setPrix2(Number(e.target.value))}
            placeholder="Prix / pers. à 2"
            className={champCss}
          />
          <input
            type="number"
            min={0}
            step={10000}
            value={prix4}
            onChange={(e) => setPrix4(Number(e.target.value))}
            placeholder="Prix / pers. à 4"
            className={champCss}
          />
          <button
            onClick={async () => {
              if (!titre.trim()) return toast.error("Indiquez un titre.");
              try {
                const id = await enregistrerCircuit(fiche.id, {
                  title: titre.trim(),
                  duration_days: jours,
                  summary: resume.trim() || null,
                });
                const prix = [
                  prix2 > 0 ? { base_pax: 2, price_ar: prix2 } : null,
                  prix4 > 0 ? { base_pax: 4, price_ar: prix4 } : null,
                ].filter(Boolean) as { base_pax: number; price_ar: number }[];
                if (prix.length) await enregistrerPrixCircuit(id, prix);
                setTitre("");
                setResume("");
                setJours(1);
                setPrix2(0);
                setPrix4(0);
                toast.success("Circuit créé.");
                await recharger();
                await onMaj();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Création impossible.");
              }
            }}
            className="min-h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground sm:col-span-2"
          >
            Créer le circuit
          </button>
        </div>
      </div>
    </div>
  );
}

/** L'itinéraire jour par jour : c'est ce qu'un voyageur lit avant de choisir. */
function JoursCircuit({
  tourId,
  nbJours,
  onFini,
}: {
  tourId: string;
  nbJours: number;
  onFini: () => Promise<void>;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [jours, setJours] = useState(
    Array.from({ length: nbJours }, (_, i) => ({ jour: i + 1, titre: "", detail: "" }))
  );

  // 🔴 LE FORMULAIRE NE RELISAIT JAMAIS CE QUI EXISTE. Il partait de jours
  //    vides, et l'enregistrement supprime avant d'inserer : rouvrir
  //    l'itineraire d'un circuit deja rempli puis enregistrer l'effacait
  //    entierement, sans un mot.
  useEffect(() => {
    if (!ouvert) return;
    void chargerJoursCircuit(tourId)
      .then((deja) => {
        if (!deja.length) return;
        setJours(
          Array.from({ length: nbJours }, (_, i) => {
            const j = deja.find((x) => x.jour === i + 1);
            return { jour: i + 1, titre: j?.titre ?? "", detail: j?.detail ?? "" };
          })
        );
      })
      .catch(() => undefined);
  }, [ouvert, tourId, nbJours]);

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        className="mt-3 text-sm font-medium text-primary underline underline-offset-4"
      >
        Décrire l'itinéraire jour par jour
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      {jours.map((j, i) => (
        <div key={j.jour} className="grid gap-2 sm:grid-cols-[auto_1fr]">
          <span className="self-center text-sm font-medium text-muted-foreground">
            Jour {j.jour}
          </span>
          <input
            value={j.titre}
            onChange={(e) => {
              const copie = [...jours];
              copie[i] = { ...copie[i], titre: e.target.value };
              setJours(copie);
            }}
            placeholder="Étape — « Tana → Antsirabe »"
            className={champCss}
          />
        </div>
      ))}
      <button
        onClick={async () => {
          try {
            await enregistrerJoursCircuit(
              tourId,
              jours.filter((j) => j.titre.trim()).map((j) => ({ jour: j.jour, titre: j.titre.trim() }))
            );
            toast.success("Itinéraire enregistré.");
            setOuvert(false);
            await onFini();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Enregistrement impossible.");
          }
        }}
        className="min-h-10 rounded-full border border-input px-4 text-sm font-medium"
      >
        Enregistrer l'itinéraire
      </button>
    </div>
  );
}
