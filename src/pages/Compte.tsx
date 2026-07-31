import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Camera, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserData } from "@/contexts/UserDataContext";
import { compressImage } from "@/lib/imageCompression";
import { uploadToO2Switch } from "@/lib/o2switchUpload";
import { getAvatarUrl } from "@/lib/supabaseImage";

export default function Compte() {
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, loading, refresh } = useUserData();

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [homePlace, setHomePlace] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    setBio(profile.bio ?? "");
    setHomePlace(profile.home_place ?? "");
  }, [profile]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user || saving) return;
    const nom = displayName.trim();
    if (nom.length < 2) {
      toast.error("Indiquez un nom d'au moins 2 caractères.");
      return;
    }
    setSaving(true);
    // ⚠ Jamais de .single() en écriture : c'est ce qui produit
    // « Cannot coerce the result to a single JSON object ». On cible la ligne
    // par son id (= auth.uid()) et on relit ensuite.
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: nom, bio: bio.trim() || null, home_place: homePlace.trim() || null })
      .eq("id", user.id)
      .select("id");

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
    toast.success("Profil enregistré.");
  }

  async function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permet de re-choisir le même fichier
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Choisissez une image.");
      return;
    }
    setUploading(true);
    try {
      // Compression DANS LE NAVIGATEUR avant l'envoi : sur un forfait data
      // malgache, envoyer un original de 4 Mo est inacceptable.
      const compressed = await compressImage(file);
      const res = await uploadToO2Switch(compressed, "profiles");
      if (!res.success || !res.url) throw new Error(res.error || "Téléversement impossible");

      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: res.url })
        .eq("id", user.id)
        .select("id");
      if (error) throw error;

      await refresh();
      toast.success("Photo mise à jour.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec du téléversement.");
    } finally {
      setUploading(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-xl space-y-3 px-4 py-6">
        <div className="dk-skeleton h-24 w-24 rounded-full" />
        <div className="dk-skeleton h-10 w-full" />
        <div className="dk-skeleton h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <h1 className="text-2xl font-semibold">Mon compte</h1>

      <div className="mt-6 flex items-center gap-4">
        <div className="relative">
          <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-muted">
            {profile?.avatar_url ? (
              <img
                src={getAvatarUrl(profile.avatar_url, 96)}
                alt="Ma photo de profil"
                width={96}
                height={96}
                className="h-24 w-24 object-cover"
              />
            ) : (
              <Camera className="h-7 w-7 text-muted-foreground" />
            )}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Changer ma photo"
            className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground ring-4 ring-background disabled:opacity-60"
          >
            <Camera className="h-4 w-4" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void pickAvatar(e)}
          />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{profile?.display_name || "Sans nom"}</p>
          <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
          {uploading && <p className="text-sm text-primary">Envoi en cours…</p>}
        </div>
      </div>

      <form onSubmit={save} className="mt-8 space-y-4">
        <div>
          <label htmlFor="nom" className="mb-1 block text-sm font-medium">
            Nom affiché
          </label>
          <input
            id="nom"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={60}
            className="h-12 w-full rounded-xl border border-input bg-background px-4 outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="ville" className="mb-1 block text-sm font-medium">
            Ma ville
          </label>
          <input
            id="ville"
            value={homePlace}
            onChange={(e) => setHomePlace(e.target.value)}
            placeholder="Antananarivo"
            maxLength={80}
            className="h-12 w-full rounded-xl border border-input bg-background px-4 outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Le choix dans le référentiel des destinations arrive au Lot 1.
          </p>
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
            className="w-full rounded-xl border border-input bg-background p-4 outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="h-12 w-full rounded-xl bg-primary font-medium text-primary-foreground disabled:opacity-60"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>

      <button
        onClick={() => void signOut().then(() => navigate("/"))}
        className="mt-8 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-input text-muted-foreground"
      >
        <LogOut className="h-4 w-4" /> Se déconnecter
      </button>

      <Link to="/" className="mt-6 block text-center text-sm text-muted-foreground">
        Retour à l'accueil
      </Link>
    </div>
  );
}
