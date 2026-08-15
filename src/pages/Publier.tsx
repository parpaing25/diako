import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Image, Info, Loader2, Sparkles, UtensilsCrossed, X } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useAuth } from "@/contexts/AuthContext";
import { compressImage } from "@/lib/imageCompression";
import { uploadToO2Switch } from "@/lib/o2switchUpload";
import { publier, type Media } from "@/lib/api";
import { ApercuRecit } from "@/components/ApercuRecit";
import { chargerPlats, type Plat } from "@/lib/etablissements";
import { ChampLieu, type LieuChoisi } from "@/components/ChampLieu";
import { TYPES, UNITES, defDuType } from "@/lib/typesPublication";
import { cn } from "@/lib/utils";

/**
 * Quinze photos, pas quatre.
 *
 * On revient de deux semaines à Sainte-Marie avec beaucoup d'images, et un
 * récit de voyage n'a pas le même besoin qu'un bon plan. Quinze reste
 * raisonnable : à 2000 px chacune, le carrousel demande déjà de la patience
 * sur une 3G, et le chargement progressif (ImageProgressive) absorbe le reste.
 */
const MAX_PHOTOS = 15;

/**
 * Publier — pleinement fonctionnel.
 *
 * Les photos sont compressées DANS LE NAVIGATEUR (0,6 Mo / 1600 px) puis
 * envoyées sur o2switch, jamais sur Supabase Storage : c'est ce seul point qui
 * fait la différence entre ~70 Ko et ~1,2 Mo d'egress par visite. Le serveur
 * génère une vignette WebP à côté de l'original.
 */
export default function Publier() {
  useDocumentTitle("Publier");
  const navigate = useNavigate();
  const { user } = useAuth();

  /**
   * L'INTENTION VENUE DU COMPOSEUR.
   *
   * ⚠ Elle est lue UNE FOIS, au montage. La relire a chaque rendu re-ouvrirait
   *   le selecteur de fichiers a chaque frappe, et re-forcerait le type que la
   *   personne vient peut-etre de changer.
   */
  const [intention] = useState(() => new URLSearchParams(window.location.search));
  const [type, setType] = useState(() => {
    const t = intention.get("type");
    return t && TYPES.some((x) => x.cle === t) ? t : "recit";
  });
  const [texte, setTexte] = useState("");
  const [lieu, setLieu] = useState<LieuChoisi | null>(null);
  const [plat, setPlat] = useState("");
  const [montant, setMontant] = useState("");
  const [unite, setUnite] = useState("personne");
  // ⚠ Par defaut AUJOURD'HUI, parce que c'est le cas de loin le plus frequent —
  //   on publie un tarif qu'on vient de payer. Mais le champ reste modifiable :
  //   forcer la date du jour sur un souvenir de l'an dernier fabriquerait une
  //   fraicheur que personne n'a constatee.
  const [dateReleve, setDateReleve] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const zoneTexte = useRef<HTMLTextAreaElement>(null);
  const def = defDuType(type);

  // ⚠ Le lieu et le plat étaient choisis dans deux listes de HUIT entrées
  // écrites en dur : Diego, Majunga, Tuléar, Ranomafana n'y figuraient pas.
  // Ils viennent maintenant du référentiel — 178 lieux, 95 plats — et on
  // enregistre l'IDENTIFIANT, pas seulement le libellé : c'est lui qui rend
  // la publication trouvable.
  const [plats, setPlats] = useState<Plat[]>([]);
  /**
   * DONNER SUITE A L'INTENTION, une fois la page montee.
   *
   * ⚠ `?photo=1` ouvre le selecteur de fichiers ; `?champ=lieu|plat` amene le
   *   champ concerne et lui donne le focus. Sans cela, le bouton « Photo » du
   *   composeur menait au formulaire vierge et il fallait re-chercher le
   *   bouton d'ajout — le geste etait annonce puis pas tenu.
   *
   * ⚠ LE SELECTEUR DE FICHIERS EST OUVERT DANS UN `setTimeout`. Ouvert
   *   synchroniquement au montage, certains navigateurs mobiles le bloquent :
   *   ils exigent que l'ouverture descende d'un geste utilisateur recent, et
   *   le clic du composeur a eu lieu sur l'ecran precedent. Un tour de boucle
   *   suffit a le rattacher au cycle courant.
   */
  useEffect(() => {
    if (!user) return;
    if (intention.get("photo") === "1") {
      const t = window.setTimeout(() => fileRef.current?.click(), 120);
      return () => window.clearTimeout(t);
    }
    const champ = intention.get("champ");
    if (champ === "lieu" || champ === "plat") {
      const t = window.setTimeout(() => {
        const el = document.getElementById(champ) as HTMLElement | null;
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.focus({ preventScroll: true });
      }, 200);
      return () => window.clearTimeout(t);
    }
  }, [intention, user]);

  useEffect(() => {
    void chargerPlats(200).then(setPlats).catch(() => undefined);
  }, []);

  // ⚠ L'unite suit le TYPE : une assiette se paie a la portion, un bon plan de
  //   transport au trajet. Laisser « par personne » partout ferait publier des
  //   prix justes sous une unite fausse — pire qu'un prix absent.
  useEffect(() => {
    if (def.uniteParDefaut) setUnite(def.uniteParDefaut);
  }, [def.uniteParDefaut]);
  const [photos, setPhotos] = useState<Media[]>([]);
  const [envoiPhoto, setEnvoiPhoto] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
          <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">Connectez-vous pour publier</h1>
        <p className="mt-2 text-muted-foreground">
          Partager un voyage, une adresse ou un bon plan demande un compte — pour
          que les autres sachent qui parle.
        </p>
        <Link
          to="/auth"
          className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
        >
          Créer mon compte
        </Link>
      </div>
    );
  }

  async function ajouterPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const fichiers = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!fichiers.length) return;

    const place = MAX_PHOTOS - photos.length;
    if (place <= 0) {
      toast.error(`${MAX_PHOTOS} photos au maximum.`);
      return;
    }

    // ⚠ On DIT ce qu'on écarte. Avant, sélectionner 15 fichiers en envoyait
    // silencieusement 4 : l'auteur ne s'en apercevait qu'en relisant sa
    // publication, quand il était trop tard pour la refaire.
    if (fichiers.length > place) {
      toast.warning(
        `${place} photo${place > 1 ? "s" : ""} sur ${fichiers.length} ${place > 1 ? "seront ajoutées" : "sera ajoutée"} — la limite est de ${MAX_PHOTOS}.`
      );
    }

    setEnvoiPhoto(true);
    try {
      for (const f of fichiers.slice(0, place)) {
        if (!f.type.startsWith("image/")) continue;
        const compresse = await compressImage(f);
        const res = await uploadToO2Switch(compresse, "posts");
        if (!res.success || !res.url) {
          toast.error(res.error || "Une photo n'a pas pu être envoyée.");
          continue;
        }
        // On mesure la taille pour réserver le ratio à l'affichage (anti-saut).
        // ⚠ L'URL D'OBJET EST REVOQUEE. Sans `revokeObjectURL`, le navigateur
        //   garde l'image compressee en memoire jusqu'au rechargement de la
        //   page : jusqu'a dix photos par publication, soit ~9 Mo retenus sur
        //   un Android d'entree de gamme qui en a deja peu.
        const dims = await new Promise<{ w: number; h: number }>((resolve) => {
          const img = new window.Image();
          const objet = URL.createObjectURL(compresse);
          const finir = (d: { w: number; h: number }) => {
            URL.revokeObjectURL(objet);
            resolve(d);
          };
          img.onload = () => finir({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => finir({ w: 1200, h: 900 });
          img.src = objet;
        });
        setPhotos((p) => [...p, { url: res.url as string, w: dims.w, h: dims.h }]);
      }
    } catch {
      toast.error("L'envoi des photos a échoué.");
    } finally {
      setEnvoiPhoto(false);
    }
  }

  /** Le montant tel que la base l'attend, ou `null`. */
  const montantAr = (() => {
    const n = Number(montant.replace(/[^\d]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  /**
   * Ce qui manque encore, DIT À L'ÉCRAN.
   *
   * ⚠ On ne se contente pas de refuser à l'envoi : le bouton reste actif et la
   *   raison est affichée en permanence sous le formulaire. Un bouton grisé
   *   sans explication laisse chercher ce qui cloche.
   */
  const manques: string[] = [];
  if (def.texteObligatoire && !texte.trim()) manques.push(def.labelTexte.toLowerCase());
  if (def.photos === true && photos.length === 0) manques.push("au moins une photo");
  if (def.plat === true && !plat) manques.push("le plat");
  if (def.prix === true && montantAr === null) manques.push("le montant");
  if (!def.texteObligatoire && def.photos !== true && !texte.trim() && photos.length === 0)
    manques.push("un texte ou une photo");

  async function envoyer() {
    if (envoi) return;
    if (manques.length) {
      toast.error(`Il manque ${manques.join(", ")}.`);
      return;
    }
    setEnvoi(true);
    try {
      await publier({
        kind: type,
        body: texte,
        media: photos,
        // ⚠ Le NOM part toujours, l'identifiant seulement s'il existe : un lieu
        //   ecrit a la main reste affichable et cherchable par son nom.
        place: lieu?.nom ?? null,
        place_id: lieu?.id ?? null,
        dish: plats.find((p) => p.id === plat)?.name_fr ?? null,
        dish_id: plat || null,
        price_ar: def.prix === null ? null : montantAr,
        price_unit: unite,
        price_on: dateReleve || null,
      });
      toast.success("Publié !");
      navigate("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "La publication a échoué.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    /* ═══ GABARIT G6 — SAISIE ET APERCU ═══════════════════════════════════
       ⚠ LE GRAND ECRAN SERT A VOIR L'EFFET DE CE QU'ON SAISIT. Ce qu'on ecrit
         dans un formulaire ne ressemble jamais a ce que les autres verront :
         le texte est coupe a 180 caracteres dans le fil, la photo passe en
         16/9, et les trois tags apparaissent sous elle. Sans apercu, on
         decouvre la coupure APRES avoir publie. */
    <div className="mx-auto flex max-w-[1250px] items-start justify-center gap-6 px-4 py-5">
      <div className="min-w-0 max-w-2xl flex-1">
      <h1 className="text-2xl font-semibold">Publier</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Racontez, partagez une adresse, signalez un bon plan.
      </p>

      {/* ⚠ LE TYPE DÉCIDE DU FORMULAIRE, il n'est donc pas un détail de
          classement : il est en haut, en grand, et il annonce ce qu'il va
          demander. Choisir « Bon plan » puis découvrir un champ « montant »
          obligatoire est une surprise ; l'annoncer ne l'est pas. */}
      <fieldset className="mt-5">
        <legend className="text-sm font-medium">Que voulez-vous publier&nbsp;?</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {TYPES.map((t) => {
            const Icone = t.icone;
            const actif = type === t.cle;
            return (
              <button
                key={t.cle}
                type="button"
                onClick={() => setType(t.cle)}
                aria-pressed={actif}
                className={cn(
                  "flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-sm transition",
                  actif
                    ? "border-primary bg-secondary font-semibold text-primary"
                    : "border-border hover:border-primary/50 hover:bg-muted"
                )}
              >
                <Icone className="h-5 w-5" aria-hidden="true" />
                {t.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{def.promesse}</p>
      </fieldset>

      <div className="mt-5">
        <label htmlFor="texte" className="mb-1 block text-sm font-medium">
          {def.labelTexte}
          {def.texteObligatoire && <span className="text-accent-strong"> *</span>}
        </label>
        <textarea
          id="texte"
          ref={zoneTexte}
          rows={type === "question" ? 4 : 7}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          maxLength={5000}
          placeholder={def.placeholder}
          className="w-full rounded-xl border border-input bg-background p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        {/* 🔴 « RACONTEZ VOTRE EXPÉRIENCE » NE FAIT ÉCRIRE PERSONNE. Sur ce
            marché l'information qui manque est toujours la même : combien,
            comment on y va, ce qu'on aurait aimé savoir. Ces amorces posent la
            question à la place de l'auteur — c'est la différence entre un fil
            de photos et un fil qui sert à préparer un voyage.
            ⚠ Elles s'AJOUTENT au texte, elles ne le remplacent jamais : on
              peut en empiler plusieurs, et rien de saisi n'est perdu. */}
        {def.amorces.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">À ne pas oublier&nbsp;:</span>
            {def.amorces.map((a) => (
              <button
                key={a}
                type="button"
                disabled={texte.includes(a)}
                onClick={() => {
                  setTexte((t) => (t.trim() ? `${t.replace(/\s+$/, "")}

${a} ` : `${a} `));
                  requestAnimationFrame(() => {
                    const el = zoneTexte.current;
                    el?.focus();
                    el?.setSelectionRange(el.value.length, el.value.length);
                  });
                }}
                className="min-h-8 rounded-full border border-dashed border-input px-3 text-xs text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-40"
              >
                {a}
              </button>
            ))}
          </div>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{texte.length} / 5000</p>
      </div>

      {photos.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {photos.map((p, i) => (
            <div key={p.url} className="relative overflow-hidden rounded-xl bg-muted">
              <img src={p.url} alt="" className="aspect-square w-full object-cover" />
              <button
                type="button"
                onClick={() => setPhotos((l) => l.filter((_, j) => j !== i))}
                aria-label="Retirer cette photo"
                className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={envoiPhoto || photos.length >= MAX_PHOTOS}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-8 text-sm text-muted-foreground hover:bg-muted disabled:opacity-60"
      >
        {envoiPhoto ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Envoi en cours…
          </>
        ) : (
          <>
            <Image className="h-5 w-5" aria-hidden="true" />
            Ajouter des photos ({photos.length}/{MAX_PHOTOS})
          </>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void ajouterPhotos(e)}
      />
      <p className="mt-1 text-xs text-muted-foreground">
        Les photos sont compressées dans votre navigateur avant l'envoi — pour
        ménager votre forfait.
      </p>

      {/* ═══ CE QUE CE TYPE DEMANDE, ET RIEN D'AUTRE ═══════════════════════
          🔴 LE FORMULAIRE POSAIT LES MÊMES QUESTIONS À TOUT LE MONDE : un
             grand cadre de texte, un lieu, un plat, des photos — qu'on
             raconte deux semaines à Sainte-Marie ou qu'on signale le prix
             d'un taxi-brousse. Les bons plans arrivaient donc SANS PRIX, la
             seule chose qui fait un bon plan ; les assiettes n'étaient
             reliées à aucun plat de l'atlas. */}
      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="lieu" className="mb-1 block text-sm font-medium">
            Lieu
          </label>
          <ChampLieu id="lieu" valeur={lieu} onChange={setLieu} />
          <p className="mt-1 text-xs text-muted-foreground">
            Le lieu rend votre publication trouvable : elle remonte sur la fiche
            de la destination et dans la recherche.
          </p>
        </div>

        {def.plat !== null && (
          <div>
            <label htmlFor="plat" className="mb-1 flex items-center gap-1.5 text-sm font-medium">
              <UtensilsCrossed className="h-4 w-4 text-accent-strong" aria-hidden="true" />
              Plat
              {def.plat === true && <span className="text-accent-strong">*</span>}
            </label>
            <select
              id="plat"
              value={plat}
              onChange={(e) => setPlat(e.target.value)}
              className="h-12 w-full rounded-xl border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{def.plat === true ? "Choisir le plat…" : "Aucun"}</option>
              {plats.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name_fr}
                  {p.name_mg && p.name_mg !== p.name_fr ? ` — ${p.name_mg}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {def.prix !== null && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium">
              Prix payé
              {def.prix === true && <span className="text-accent-strong"> *</span>}
            </p>
            {/* ⚠ LES TROIS VONT ENSEMBLE. Un montant sans unité ne veut rien
                dire — 50 000 Ar la nuit ou par groupe ? — et sans date il se
                lit comme un prix d'aujourd'hui. La base refuse d'ailleurs un
                montant sans unité. */}
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
              <div className="relative">
                <input
                  id="montant"
                  type="text"
                  inputMode="numeric"
                  value={montant}
                  onChange={(e) => setMontant(e.target.value.replace(/[^0-9 ]/g, ""))}
                  placeholder="15 000"
                  className="h-12 w-full rounded-xl border border-input bg-background pl-4 pr-12 tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  Ar
                </span>
              </div>
              <select
                value={unite}
                onChange={(e) => setUnite(e.target.value)}
                aria-label="Unité du prix"
                className="h-12 rounded-xl border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {UNITES.map((u) => (
                  <option key={u.cle} value={u.cle}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label htmlFor="releve" className="text-xs text-muted-foreground">
                Payé le
              </label>
              <input
                id="releve"
                type="date"
                value={dateReleve}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDateReleve(e.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="text-xs text-muted-foreground">
                Un tarif garde sa valeur tant qu'on sait de quand il date.
              </span>
            </div>
          </div>
        )}

        {def.raisonExigence && (
          <p className="flex gap-2 rounded-xl bg-secondary p-3 text-xs leading-relaxed">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            {def.raisonExigence}
          </p>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => void envoyer()}
          disabled={envoi || envoiPhoto}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary font-medium text-primary-foreground disabled:opacity-60"
        >
          {envoi && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {envoi ? "Publication…" : "Publier"}
        </button>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="h-12 rounded-xl border border-input px-5 font-medium"
        >
          Annuler
        </button>
      </div>

      {/* ⚠ ON DIT CE QUI MANQUE, on ne grise pas le bouton en silence : un
          bouton inerte sans explication laisse chercher ce qui cloche. */}
      {manques.length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Il manque encore&nbsp;: {manques.join(", ")}.
        </p>
      )}
      </div>

      {/* 🔴 DEFAUT CORRIGE : l'apercu recevait `lieu` et `plat` bruts, qui sont
          les IDENTIFIANTS des selecteurs (`value={d.id}`), pas les noms. Il
          affichait donc « 3f2b9c4e-… » dans la ligne de lieu et dans les deux
          tags, avec deux liens morts vers `/recherche?q=<uuid>`. La fonction
          d'envoi, elle, traduisait bien id -> nom : l'apercu etait le seul a ne
          pas le faire, et c'est precisement lui qui pretend montrer le resultat. */}
      <ApercuRecit
        auteur={user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Vous"}
        avatar={user?.user_metadata?.avatar_url ?? null}
        texte={texte}
        lieu={lieu?.nom ?? null}
        plat={plats.find((p) => p.id === plat)?.name_fr ?? null}
        photos={photos}
        prix={
          def.prix !== null && montantAr !== null
            ? { montant: montantAr, unite, le: dateReleve || null }
            : null
        }
      />
    </div>
  );
}
