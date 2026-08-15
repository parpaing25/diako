import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Image, Loader2, MapPin, Sparkles, UtensilsCrossed, X } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useAuth } from "@/contexts/AuthContext";
import { compressImage } from "@/lib/imageCompression";
import { uploadToO2Switch } from "@/lib/o2switchUpload";
import { publier, type Media } from "@/lib/api";
import { ApercuRecit } from "@/components/ApercuRecit";
import {
  chargerDestinations,
  chargerPlats,
  type Lieu,
  type Plat,
} from "@/lib/etablissements";

const TYPES = [
  { cle: "recit", label: "Récit de voyage", emoji: "✍️" },
  { cle: "photo", label: "Photo", emoji: "📷" },
  { cle: "bon_plan", label: "Bon plan", emoji: "✨" },
  { cle: "question", label: "Question", emoji: "❓" },
  { cle: "avis", label: "Avis", emoji: "⭐" },
];

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

  const [type, setType] = useState("recit");
  const [texte, setTexte] = useState("");
  const [lieu, setLieu] = useState("");
  const [plat, setPlat] = useState("");

  // ⚠ Le lieu et le plat étaient choisis dans deux listes de HUIT entrées
  // écrites en dur : Diego, Majunga, Tuléar, Ranomafana n'y figuraient pas.
  // Ils viennent maintenant du référentiel — 178 lieux, 95 plats — et on
  // enregistre l'IDENTIFIANT, pas seulement le libellé : c'est lui qui rend
  // la publication trouvable.
  const [destinations, setDestinations] = useState<Lieu[]>([]);
  const [plats, setPlats] = useState<Plat[]>([]);
  useEffect(() => {
    void chargerDestinations(200).then(setDestinations).catch(() => undefined);
    void chargerPlats(200).then(setPlats).catch(() => undefined);
  }, []);
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
        const dims = await new Promise<{ w: number; h: number }>((resolve) => {
          const img = new window.Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve({ w: 1200, h: 900 });
          img.src = URL.createObjectURL(compresse);
        });
        setPhotos((p) => [...p, { url: res.url as string, w: dims.w, h: dims.h }]);
      }
    } catch {
      toast.error("L'envoi des photos a échoué.");
    } finally {
      setEnvoiPhoto(false);
    }
  }

  async function envoyer() {
    if (envoi) return;
    if (!texte.trim() && photos.length === 0) {
      toast.error("Écrivez quelque chose ou ajoutez une photo.");
      return;
    }
    setEnvoi(true);
    try {
      await publier({
        kind: type,
        body: texte,
        media: photos,
        place: destinations.find((d) => d.id === lieu)?.name_fr ?? null,
        place_id: lieu || null,
        dish: plats.find((p) => p.id === plat)?.name_fr ?? null,
        dish_id: plat || null,
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

      <fieldset className="mt-5">
        <legend className="text-sm font-medium">Type de publication</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.cle}
              type="button"
              onClick={() => setType(t.cle)}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm transition ${
                type === t.cle ? "border-primary bg-secondary font-medium" : "border-border hover:bg-muted"
              }`}
            >
              <span aria-hidden="true">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-5">
        <label htmlFor="texte" className="mb-1 block text-sm font-medium">
          Votre texte
        </label>
        <textarea
          id="texte"
          rows={6}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          maxLength={5000}
          placeholder="Comment s'y rendre, combien ça coûte, ce qu'il faut savoir…"
          className="w-full rounded-xl border border-input bg-background p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
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

      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="lieu" className="mb-1 flex items-center gap-1.5 text-sm font-medium">
            <MapPin className="h-4 w-4 text-primary" aria-hidden="true" /> Lieu
          </label>
          <select
            id="lieu"
            value={lieu}
            onChange={(e) => setLieu(e.target.value)}
            className="h-12 w-full rounded-xl border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Choisir une destination…</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name_fr}
                {d.region ? ` — ${d.region}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="plat" className="mb-1 flex items-center gap-1.5 text-sm font-medium">
            <UtensilsCrossed className="h-4 w-4 text-accent" aria-hidden="true" /> Plat mentionné
          </label>
          <select
            id="plat"
            value={plat}
            onChange={(e) => setPlat(e.target.value)}
            className="h-12 w-full rounded-xl border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Aucun</option>
            {plats.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name_fr}
                {p.name_mg && p.name_mg !== p.name_fr ? ` — ${p.name_mg}` : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Indiquer le lieu rend votre publication trouvable : elle remonte
            sur la fiche de la destination et dans la recherche.
          </p>
        </div>
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
      </div>

      <ApercuRecit
        auteur={user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Vous"}
        avatar={user?.user_metadata?.avatar_url ?? null}
        texte={texte}
        lieu={lieu || null}
        plat={plat || null}
        photos={photos}
      />
    </div>
  );
}
