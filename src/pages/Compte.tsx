import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Bookmark,
  Camera,
  Eye,
  EyeOff,
  LayoutGrid,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  Settings,
  Store,
  User,
  UtensilsCrossed,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserData } from "@/contexts/UserDataContext";
import { compressImage } from "@/lib/imageCompression";
import { uploadToO2Switch } from "@/lib/o2switchUpload";
import { getAvatarUrl } from "@/lib/supabaseImage";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  changerVisibilite,
  mesPublications,
  monActivite,
  ouvrirMesLieux,
  type MonActivite,
  type PublicationMienne,
} from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * MON COMPTE — le hub, gabarit G6.
 *
 * 🔴 CE QUE ÇA REMPLACE. Un formulaire de trois champs. Tout le reste de ce que
 *    la personne a fait sur Diako — ses récits, ses bons plans, ses assiettes,
 *    ses adresses gardées, ses plats goûtés — vivait dans des écrans séparés
 *    qu'aucun chemin ne reliait à son compte.
 *
 * ⚠ LA VUE PAR DÉFAUT EST L'HISTORIQUE, pas le formulaire. On ouvre son compte
 *   pour retrouver ce qu'on a fait, pas pour changer son nom.
 *
 * ⚠ CHAQUE ONGLET A UNE SOURCE DE DONNÉES RÉELLE. La règle du projet interdit
 *   une entrée vers un écran non branché : c'est pourquoi il n'y a ici ni
 *   jetons, ni abonnement, ni paiements — ils n'existent pas sur Diako, et ils
 *   viendront après le lancement.
 *
 * ⚠ PAGINATION PAR CURSEUR sur l'historique — il grandit, et un offset décale
 *   tout dès qu'une publication s'ajoute pendant la lecture.
 */

const PAR_PAGE = 12;

type Onglet = "activite" | "profil" | "carnet" | "pages";

const ONGLETS: { cle: Onglet; label: string; icon: typeof User; proSeul?: boolean }[] = [
  { cle: "activite", label: "Mes publications", icon: LayoutGrid },
  { cle: "profil", label: "Mon profil", icon: User },
  { cle: "carnet", label: "Mes carnets", icon: Bookmark },
  // ⚠ N'apparaît que pour un pro : un voyageur n'a pas d'établissement, et lui
  //   montrer l'onglet serait promettre un écran qui ne le concerne pas.
  { cle: "pages", label: "Mes établissements", icon: Store, proSeul: true },
];

const LIBELLE_TYPE: Record<string, string> = {
  recit: "Récit",
  assiette: "Assiette",
  bon_plan: "Bon plan",
  question: "Question",
  photo: "Photo",
  avis: "Avis",
};

export default function Compte() {
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, loading, refresh } = useUserData();
  const [params, setParams] = useSearchParams();
  useDocumentTitle("Mon compte");

  const estPro = profile?.account_type === "pro";
  const demande = params.get("onglet") as Onglet | null;
  const onglet: Onglet =
    demande && ONGLETS.some((x) => x.cle === demande && (!x.proSeul || estPro))
      ? demande
      : "activite";

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
  }, [user, authLoading, navigate]);

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-[1250px] space-y-3 px-4 py-6">
        <div className="dk-skeleton h-28 w-full rounded-2xl" />
        <div className="dk-skeleton h-10 w-full" />
        <div className="dk-skeleton h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1250px] px-4 py-5">
      <EnTeteCompte />

      {/* ⚠ Onglets, pas liens : on reste sur la page. L'URL porte quand même
          l'onglet, pour qu'un partage ou un retour arrière retombe juste. */}
      <div role="tablist" aria-label="Mon compte" className="mt-5 flex flex-wrap gap-1.5">
        {ONGLETS.filter((o) => !o.proSeul || estPro).map(({ cle, label, icon: Icone }) => (
          <button
            key={cle}
            role="tab"
            aria-selected={onglet === cle}
            onClick={() =>
              setParams(cle === "activite" ? {} : { onglet: cle }, { replace: true })
            }
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition",
              onglet === cle
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:border-primary hover:text-primary"
            )}
          >
            <Icone className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {onglet === "activite" && <OngletActivite />}
        {onglet === "profil" && <OngletProfil onEnregistre={refresh} />}
        {onglet === "carnet" && <OngletCarnets />}
        {onglet === "pages" && <OngletPages />}
      </div>

      <button
        onClick={() => void signOut().then(() => navigate("/"))}
        className="mt-8 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-input text-muted-foreground"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" /> Se déconnecter
      </button>
    </div>
  );
}

/* ── L'en-tête : qui je suis, en un coup d'œil ────────────────────────────── */

function EnTeteCompte() {
  const { user } = useAuth();
  const { profile } = useUserData();
  const [a, setA] = useState<MonActivite | null>(null);

  useEffect(() => {
    monActivite().then(setA).catch(() => undefined);
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-muted">
          {profile?.avatar_url ? (
            <img
              src={getAvatarUrl(profile.avatar_url, 64)}
              alt=""
              width={64}
              height={64}
              className="h-16 w-16 object-cover"
            />
          ) : (
            <User className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">
            {profile?.display_name || "Mon compte"}
          </h1>
          <p className="dk-secondaire truncate">
            {profile?.account_type === "pro" ? "Compte professionnel" : "Voyageur"}
            {profile?.home_place ? ` · ${profile.home_place}` : ""}
          </p>
          {/* ⚠ Le profil public est un ÉCRAN DIFFÉRENT : ce lien est le seul
              moyen de voir ce que les autres voient réellement. */}
          {user && (
            <Link
              to={`/user/${user.id}`}
              className="dk-secondaire mt-0.5 inline-flex items-center gap-1 text-primary"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              Voir mon profil public
            </Link>
          )}
        </div>
      </div>

      {/* ⚠ DES FAITS COMPTÉS EN BASE, jamais d'estimation : `mon_activite()` ne
          rend que des `count(*)`. Si c'est zéro, l'écran affiche zéro. */}
      {a && (
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Compteur n={a.publications} quoi="publications" />
          <Compteur n={a.lieux} quoi="lieux visités" />
          <Compteur n={a.plats_goutes} quoi="plats goûtés" />
          <Compteur n={a.carnet} quoi="adresses gardées" />
        </div>
      )}
    </div>
  );
}

function Compteur({ n, quoi }: { n: number; quoi: string }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2">
      <p className="text-xl font-bold leading-none tabular-nums text-primary">{n}</p>
      <p className="dk-secondaire mt-1">{quoi}</p>
    </div>
  );
}

/* ── Onglet 1 · l'historique, avec sa visibilité ─────────────────────────── */

const TYPES_FILTRE = ["recit", "assiette", "bon_plan", "question", "photo"];

function OngletActivite() {
  const [liste, setListe] = useState<PublicationMienne[]>([]);
  const [chargement, setChargement] = useState(true);
  const [fini, setFini] = useState(false);
  const [filtre, setFiltre] = useState<string | null>(null);
  const version = useRef(0);

  const charger = useCallback(
    async (curseur?: string | null) => {
      const mien = ++version.current;
      if (!curseur) setChargement(true);
      try {
        const page = await mesPublications({ curseur, kind: filtre, limite: PAR_PAGE });
        if (mien !== version.current) return;
        setFini(page.length < PAR_PAGE);
        setListe((avant) => {
          if (!curseur) return page;
          const vus = new Set(avant.map((p) => p.id));
          return [...avant, ...page.filter((p) => !vus.has(p.id))];
        });
      } catch {
        if (mien === version.current) toast.error("L'historique n'a pas pu être chargé.");
      } finally {
        if (mien === version.current) setChargement(false);
      }
    },
    [filtre]
  );

  useEffect(() => {
    void charger(null);
  }, [charger]);

  async function basculer(p: PublicationMienne) {
    const prive = p.visibilite !== "prive";
    try {
      await changerVisibilite(p.id, prive);
      setListe((l) =>
        l.map((x) => (x.id === p.id ? { ...x, visibilite: prive ? "prive" : "public" } : x))
      );
      toast.success(prive ? "Gardé pour vous." : "Rendu public.");
    } catch {
      toast.error("Le changement n'a pas pu être enregistré.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        <Puce actif={!filtre} onClick={() => setFiltre(null)}>
          Tout
        </Puce>
        {TYPES_FILTRE.map((t) => (
          <Puce key={t} actif={filtre === t} onClick={() => setFiltre(t)}>
            {LIBELLE_TYPE[t] ?? t}
          </Puce>
        ))}
      </div>

      {chargement && (
        <ul className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="dk-skeleton h-24 rounded-xl" />
          ))}
        </ul>
      )}

      {!chargement && liste.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-border px-5 py-12 text-center">
          <p className="font-medium">
            {filtre ? "Rien de ce type pour l'instant" : "Vous n'avez encore rien publié"}
          </p>
          <p className="dk-secondaire mx-auto mt-2 max-w-md leading-relaxed">
            Vos récits, vos bons plans et vos assiettes se retrouveront ici — avec
            la possibilité de garder chacun pour vous.
          </p>
          <Link
            to="/publier"
            className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"
          >
            Publier
          </Link>
        </div>
      )}

      {!chargement && liste.length > 0 && (
        <ul className="mt-4 space-y-2">
          {liste.map((p) => (
            <li
              key={p.id}
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="dk-etiquette">
                  {LIBELLE_TYPE[p.kind] ?? p.kind}
                  {p.place ? ` · ${p.place}` : ""}
                  {" · "}
                  {new Date(p.created_at).toLocaleDateString("fr-FR")}
                </p>
                <Link to={`/post/${p.id}`} className="mt-0.5 block">
                  <span className="line-clamp-2 text-sm">
                    {p.body?.trim() || "(sans texte)"}
                  </span>
                </Link>
                <p className="dk-secondaire mt-1">
                  {p.reactions_count} réaction{p.reactions_count > 1 ? "s" : ""} ·{" "}
                  {p.comments_count} commentaire{p.comments_count > 1 ? "s" : ""}
                </p>
              </div>

              {/* ⚠ LE GESTE EST SUR CHAQUE LIGNE : la personne décide
                  publication par publication, jamais en bloc. */}
              <button
                onClick={() => void basculer(p)}
                aria-pressed={p.visibilite === "prive"}
                className={cn(
                  "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold",
                  p.visibilite === "prive"
                    ? "border-accent-strong text-accent-strong"
                    : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                )}
              >
                {p.visibilite === "prive" ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> Privé
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Public
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!chargement && liste.length > 0 && !fini && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => void charger(liste[liste.length - 1].created_at)}
            className="min-h-11 rounded-full border border-input px-6 text-sm font-semibold hover:border-primary hover:text-primary"
          >
            Voir plus
          </button>
        </div>
      )}
    </div>
  );
}

function Puce({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={actif}
      className={cn(
        "min-h-9 rounded-full border px-3.5 text-xs font-semibold transition",
        actif
          ? "border-accent-strong bg-accent-strong text-accent-foreground"
          : "border-border bg-card hover:border-primary hover:text-primary"
      )}
    >
      {children}
    </button>
  );
}

/* ── Onglet 2 · le profil ────────────────────────────────────────────────── */

function OngletProfil({ onEnregistre }: { onEnregistre: () => Promise<void> | void }) {
  const { user } = useAuth();
  const { profile } = useUserData();
  const [nom, setNom] = useState("");
  const [bio, setBio] = useState("");
  const [ville, setVille] = useState("");
  const [lieuxOuverts, setLieuxOuverts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    setNom(profile.display_name ?? "");
    setBio(profile.bio ?? "");
    setVille(profile.home_place ?? "");
    setLieuxOuverts(Boolean((profile as { lieux_publics?: boolean }).lieux_publics));
  }, [profile]);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!user || busy) return;
    if (nom.trim().length < 2) {
      toast.error("Indiquez un nom d'au moins 2 caractères.");
      return;
    }
    setBusy(true);
    // ⚠ Jamais .single() en écriture : il lève « Cannot coerce the result to a
    //   single JSON object » dès que la ligne n'est pas renvoyée.
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: nom.trim(),
        bio: bio.trim() || null,
        home_place: ville.trim() || null,
      })
      .eq("id", user.id)
      .select("id");
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await onEnregistre();
    toast.success("Profil enregistré.");
  }

  async function choisirAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !user) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Choisissez une image.");
      return;
    }
    setEnvoi(true);
    try {
      const res = await uploadToO2Switch(await compressImage(f), "profiles");
      if (!res.success || !res.url) throw new Error(res.error || "Téléversement impossible");
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: res.url })
        .eq("id", user.id)
        .select("id");
      if (error) throw error;
      await onEnregistre();
      toast.success("Photo mise à jour.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec du téléversement.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={enregistrer} className="max-w-2xl space-y-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={envoi}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-input px-4 text-sm font-medium"
        >
          {envoi ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Camera className="h-4 w-4" aria-hidden="true" />
          )}
          Changer ma photo
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void choisirAvatar(e)}
        />
      </div>

      <div>
        <label htmlFor="nom" className="mb-1 block text-sm font-medium">
          Nom affiché
        </label>
        <input
          id="nom"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          maxLength={60}
          className="h-12 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div>
        <label htmlFor="ville" className="mb-1 block text-sm font-medium">
          Ma ville
        </label>
        <input
          id="ville"
          value={ville}
          onChange={(e) => setVille(e.target.value)}
          placeholder="Antananarivo"
          maxLength={80}
          className="h-12 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div>
        <label htmlFor="bio" className="mb-1 block text-sm font-medium">
          Bio
        </label>
        <textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          maxLength={300}
          className="w-full rounded-xl border border-input bg-background p-4 text-base outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* 🔴 LE RÉGLAGE LE PLUS SENSIBLE DE L'ÉCRAN, et il est FERMÉ par défaut.
          La liste des lieux n'est pas quelque chose que la personne a publié :
          c'est quelque chose qu'on a CALCULÉ sur elle à partir de ses récits.
          Un profil de déplacement ne peut pas être opt-out rétroactif — on ne
          l'ouvre que si elle le demande, et l'écran dit ce que ça montre. */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Montrer les lieux où je suis allé</p>
            <p className="dk-secondaire mt-1 leading-relaxed">
              La liste est déduite de vos publications publiques. Fermée par
              défaut&nbsp;: c'est votre carte de déplacements, pas une publication.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              const v = !lieuxOuverts;
              setLieuxOuverts(v);
              try {
                await ouvrirMesLieux(v);
                await onEnregistre();
              } catch {
                setLieuxOuverts(!v);
                toast.error("Le réglage n'a pas pu être enregistré.");
              }
            }}
            aria-pressed={lieuxOuverts}
            className={cn(
              "min-h-9 shrink-0 rounded-full border px-3.5 text-xs font-semibold",
              lieuxOuverts
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground"
            )}
          >
            {lieuxOuverts ? "Visibles" : "Masqués"}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="h-12 w-full rounded-xl bg-primary font-medium text-primary-foreground disabled:opacity-60"
      >
        {busy ? "Enregistrement…" : "Enregistrer"}
      </button>

      {/* ⚠ Le thème et les notifications restent sur /parametres : c'est la
          seule porte joignable DÉCONNECTÉ, et la déplacer ici la fermerait. */}
      <Link
        to="/parametres"
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-input text-sm font-medium"
      >
        <Settings className="h-4 w-4" aria-hidden="true" />
        Thème, notifications et confidentialité
      </Link>
    </form>
  );
}

/* ── Onglet 3 · les carnets ──────────────────────────────────────────────── */

function OngletCarnets() {
  const [a, setA] = useState<MonActivite | null>(null);
  useEffect(() => {
    monActivite().then(setA).catch(() => undefined);
  }, []);

  // ⚠ On NE RECOPIE PAS /favoris et /gouts ici : ce sont des écrans entiers,
  //   avec leur pagination et leurs gestes. Cet onglet les ANNONCE avec leur
  //   volume réel et y mène. Les dupliquer les aurait laissés diverger.
  const cartes = [
    { to: "/favoris", icon: Bookmark, titre: "Mes adresses gardées", n: a?.carnet, quoi: "adresse" },
    { to: "/gouts", icon: UtensilsCrossed, titre: "Mon carnet de goûts", n: a?.plats_goutes, quoi: "plat goûté" },
    { to: "/projet", icon: MapPin, titre: "Mon projet de voyage", n: undefined, quoi: "" },
  ];

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cartes.map(({ to, icon: Icone, titre, n, quoi }) => (
        <li key={to}>
          <Link
            to={to}
            className="flex h-full flex-col rounded-2xl border border-border bg-card p-4 transition hover:border-primary"
          >
            <Icone className="h-5 w-5 text-primary" aria-hidden="true" />
            <p className="mt-2 font-semibold">{titre}</p>
            <p className="dk-secondaire mt-1">
              {n === undefined
                ? "Décrivez-le une fois, les pros répondent"
                : `${n} ${quoi}${n > 1 ? "s" : ""}`}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ── Onglet 4 · les établissements, pour un pro ──────────────────────────── */

function OngletPages() {
  const [a, setA] = useState<MonActivite | null>(null);
  useEffect(() => {
    monActivite().then(setA).catch(() => undefined);
  }, []);

  return (
    <div className="max-w-2xl">
      <div className="rounded-2xl border border-border bg-card p-4">
        <Store className="h-5 w-5 text-primary" aria-hidden="true" />
        <p className="mt-2 font-semibold">
          {a ? `${a.mes_pages} établissement${a.mes_pages > 1 ? "s" : ""}` : "Mes établissements"}
        </p>
        <p className="dk-secondaire mt-1 leading-relaxed">
          {a && a.mes_pages === 0
            ? "Vous n'en gérez encore aucun. Trouvez le vôtre dans l'annuaire — il y est probablement déjà — et revendiquez-le."
            : "Tarifs, chambres, carte et demandes se gèrent depuis l'espace pro."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to="/pro"
            className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Espace pro
          </Link>
          <Link
            to="/recherche"
            className="inline-flex min-h-11 items-center rounded-full border border-input px-5 text-sm font-semibold"
          >
            Chercher mon établissement
          </Link>
        </div>
      </div>
    </div>
  );
}
