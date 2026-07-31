import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/integrations/supabase/types";
import { useAuth } from "./AuthContext";

// ⚠ ANTI-EGRESS : jamais de select('*'). On énumère les colonnes.
// Et depuis la fermeture des données personnelles (migration 0001 §7), un
// select('*') anonyme renvoie de toute façon 401 — chaque colonne doit être
// explicitement accordée à `anon`.
export const PROFILE_COLUMNS =
  "id,display_name,avatar_url,cover_url,bio,home_place,language,account_type,verification,followers_count,following_count,posts_count,created_at";

type ProfileLite = Pick<
  Profile,
  | "id"
  | "display_name"
  | "avatar_url"
  | "cover_url"
  | "bio"
  | "home_place"
  | "language"
  | "account_type"
  | "verification"
  | "followers_count"
  | "following_count"
  | "posts_count"
  | "created_at"
>;

interface UserDataState {
  profile: ProfileLite | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Profil incomplet tant que le nom d'affichage n'est pas renseigné. */
  needsOnboarding: boolean;
}

const UserDataContext = createContext<UserDataState>({
  profile: null,
  loading: true,
  refresh: async () => {},
  needsOnboarding: false,
});

export function UserDataProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    // ⚠ profiles.id = auth.uid(). On filtre par `id`, JAMAIS par user_id :
    // il n'existe pas de colonne user_id.
    const { data } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", user.id)
      .maybeSingle();
    setProfile((data as ProfileLite | null) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  const value = useMemo<UserDataState>(
    () => ({
      profile,
      loading: authLoading || loading,
      refresh,
      needsOnboarding: !!user && !authLoading && !loading && !profile?.display_name,
    }),
    [profile, loading, authLoading, refresh, user]
  );

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUserData() {
  return useContext(UserDataContext);
}
