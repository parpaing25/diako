// ============================================================================
// Types de la base Diako (projet eifrwecaszzqrdwjjjbu).
//
// ⚠ RÈGLE DU PROJET : régénéré après CHAQUE migration, sans exception.
//   Sur Fonenako, des types périmés ont conduit à parsemer le code de
//   `(supabase as any)` — c'est-à-dire à perdre toute vérification là où le
//   risque était le plus grand. Chaque contournement est un bug futur.
// ============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Horodate = { created_at: string };

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
        Row: { created_at: string; id: number; path: string; ref: string | null; sid: string | null };
        Insert: { created_at?: string; id?: number; path: string; ref?: string | null; sid?: string | null };
        Update: { created_at?: string; id?: number; path?: string; ref?: string | null; sid?: string | null };
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
      posts: {
        Row: {
          id: string;
          author_id: string;
          kind: string;
          body: string | null;
          media: Json;
          place: string | null;
          dish: string | null;
          page_name: string | null;
          reactions_count: number;
          comments_count: number;
          saves_count: number;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          kind?: string;
          body?: string | null;
          media?: Json;
          place?: string | null;
          dish?: string | null;
          page_name?: string | null;
          reactions_count?: number;
          comments_count?: number;
          saves_count?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          kind?: string;
          body?: string | null;
          media?: Json;
          place?: string | null;
          dish?: string | null;
          page_name?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      reactions: {
        Row: { id: string; post_id: string; user_id: string; type: string } & Horodate;
        Insert: { id?: string; post_id: string; user_id: string; type?: string; created_at?: string };
        Update: { type?: string };
        Relationships: [];
      };
      comments: {
        Row: {
          id: string;
          post_id: string;
          author_id: string;
          parent_id: string | null;
          body: string;
          status: string;
        } & Horodate;
        Insert: {
          id?: string;
          post_id: string;
          author_id: string;
          parent_id?: string | null;
          body: string;
          status?: string;
          created_at?: string;
        };
        Update: { body?: string; status?: string };
        Relationships: [];
      };
      saves: {
        Row: { post_id: string; user_id: string } & Horodate;
        Insert: { post_id: string; user_id: string; created_at?: string };
        Update: never;
        Relationships: [];
      };
      follows: {
        Row: { follower_id: string; target_id: string } & Horodate;
        Insert: { follower_id: string; target_id: string; created_at?: string };
        Update: never;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          message: string | null;
          data: Json;
          read: boolean;
        } & Horodate;
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          title: string;
          message?: string | null;
          data?: Json;
          read?: boolean;
          created_at?: string;
        };
        Update: { read?: boolean };
        Relationships: [];
      };
      conversations: {
        Row: { id: string; a_id: string; b_id: string; last_at: string } & Horodate;
        Insert: { id?: string; a_id: string; b_id: string; last_at?: string; created_at?: string };
        Update: { last_at?: string };
        Relationships: [];
      };
      messages: {
        Row: { id: string; conv_id: string; sender_id: string; body: string; read: boolean } & Horodate;
        Insert: {
          id?: string;
          conv_id: string;
          sender_id: string;
          body: string;
          read?: boolean;
          created_at?: string;
        };
        Update: { read?: boolean };
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          target_type: string;
          target_id: string;
          reporter_id: string;
          reason: string;
          status: string;
        } & Horodate;
        Insert: {
          id?: string;
          target_type: string;
          target_id: string;
          reporter_id: string;
          reason: string;
          status?: string;
          created_at?: string;
        };
        Update: { status?: string };
        Relationships: [];
      };
      blocks: {
        Row: { blocker_id: string; blocked_id: string } & Horodate;
        Insert: { blocker_id: string; blocked_id: string; created_at?: string };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_staff: { Args: Record<string, never>; Returns: boolean };
      get_feed: { Args: { p_curseur?: string | null; p_limite?: number }; Returns: Json };
      ouvrir_conversation: { Args: { p_autre: string }; Returns: string };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];

export type Profile = Tables<"profiles">;
export type Notification = Tables<"notifications">;
export type Message = Tables<"messages">;
