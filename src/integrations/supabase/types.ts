// ============================================================================
// GÉNÉRÉ depuis la base Diako (projet eifrwecaszzqrdwjjjbu).
//
// ⚠ RÈGLE DU PROJET : ce fichier est RÉGÉNÉRÉ après CHAQUE migration, sans
//   exception. Sur Fonenako, des types périmés ont conduit à contourner
//   TypeScript avec `(supabase as any)` sur les tables les plus récentes —
//   c'est-à-dire à perdre toute vérification là où le risque était le plus
//   grand. Chaque contournement de ce genre est un bug futur.
//
//   Régénération : Supabase Studio > API Docs > TypeScript, ou
//   `supabase gen types typescript --project-id eifrwecaszzqrdwjjjbu`
// ============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      app_flags: {
        Row: { actif: boolean; cle: string; maj: string };
        Insert: { actif?: boolean; cle: string; maj?: string };
        Update: { actif?: boolean; cle?: string; maj?: string };
        Relationships: [];
      };
      page_views: {
        Row: {
          created_at: string;
          id: number;
          path: string;
          ref: string | null;
          sid: string | null;
        };
        Insert: {
          created_at?: string;
          id?: number;
          path: string;
          ref?: string | null;
          sid?: string | null;
        };
        Update: {
          created_at?: string;
          id?: number;
          path?: string;
          ref?: string | null;
          sid?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          account_type: string;
          avatar_url: string | null;
          bio: string | null;
          cover_url: string | null;
          created_at: string;
          display_name: string | null;
          email: string | null;
          followers_count: number;
          following_count: number;
          home_place: string | null;
          id: string;
          language: string;
          phone: string | null;
          posts_count: number;
          updated_at: string;
          verification: string;
        };
        Insert: {
          account_type?: string;
          avatar_url?: string | null;
          bio?: string | null;
          cover_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          followers_count?: number;
          following_count?: number;
          home_place?: string | null;
          id: string;
          language?: string;
          phone?: string | null;
          posts_count?: number;
          updated_at?: string;
          verification?: string;
        };
        Update: {
          account_type?: string;
          avatar_url?: string | null;
          bio?: string | null;
          cover_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          followers_count?: number;
          following_count?: number;
          home_place?: string | null;
          id?: string;
          language?: string;
          phone?: string | null;
          posts_count?: number;
          updated_at?: string;
          verification?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: { granted_at: string; role: string; user_id: string };
        Insert: { granted_at?: string; role: string; user_id: string };
        Update: { granted_at?: string; role?: string; user_id?: string };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_staff: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

export type Profile = Tables<"profiles">;
