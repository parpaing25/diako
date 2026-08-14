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
          place_id: string | null;
          dish: string | null;
          dish_id: string | null;
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
          place_id?: string | null;
          dish?: string | null;
          dish_id?: string | null;
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
          place_id?: string | null;
          dish?: string | null;
          dish_id?: string | null;
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
        Row: {
          id: string;
          a_id: string;
          b_id: string;
          page_id: string | null;
          last_at: string;
        } & Horodate;
        Insert: {
          id?: string;
          a_id: string;
          b_id: string;
          page_id?: string | null;
          last_at?: string;
          created_at?: string;
        };
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

      /* ── RÉFÉRENTIELS (migrations 0004-0006) ────────────────────────────
         Lecture publique, écriture réservée à l'administration : le client
         ne fait que les lire, d'où des Update volontairement à `never`. */
      places: {
        Row: {
          id: string;
          slug: string;
          name_fr: string;
          name_mg: string | null;
          kind: string;
          parent_id: string | null;
          lat: number | null;
          lng: number | null;
          radius_km: number;
          region: string | null;
          axe: string | null;
          is_touristique: boolean;
          summary: string | null;
          why_go: string[] | null;
          nb_pages: number;
          nb_posts: number;
          norm: string;
        } & Horodate;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      place_seasons: {
        Row: { place_id: string; month: number; rating: string; reason: string | null };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      dishes: {
        Row: {
          id: string;
          slug: string;
          name_fr: string;
          name_mg: string | null;
          family: string | null;
          description: string | null;
          ingredients: string[] | null;
          has_pork: boolean;
          has_beef: boolean;
          has_seafood: boolean;
          has_peanut: boolean;
          is_vegetarian: boolean;
          price_min_ar: number | null;
          price_max_ar: number | null;
          photo_url: string | null;
          spice_level: number | null;
          nb_restaurants: number;
          norm: string;
        } & Horodate;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      amenities: {
        Row: {
          code: string;
          label_fr: string;
          label_mg: string | null;
          icon: string | null;
          category: string;
          applies_to: string[];
          rang: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };

      /* ── ÉTABLISSEMENTS (migrations 0007-0008) ──────────────────────────
         ⚠ verification_status, rating_avg, rating_count et views_count sont
         absents des Insert/Update : ce sont des colonnes à valeur
         commerciale, verrouillées côté base par déclencheur. Les omettre ici
         évite d'écrire du code qui semble marcher et n'a aucun effet. */
      pages: {
        Row: {
          id: string;
          slug: string;
          owner_id: string | null;
          name: string;
          categories: string[];
          subcategory: string | null;
          short_desc: string | null;
          long_desc: string | null;
          place_id: string | null;
          address: string | null;
          landmark: string | null;
          lat: number | null;
          lng: number | null;
          phone: string | null;
          whatsapp: string | null;
          email: string | null;
          website: string | null;
          facebook: string | null;
          logo_url: string | null;
          cover_url: string | null;
          cover_offset_y: number;
          gallery: Json;
          languages: string[];
          payment_methods: string[];
          price_level: number | null;
          verification_status: string;
          is_published: boolean;
          rating_avg: number;
          rating_count: number;
          views_count: number;
          price_min_ar: number | null;
          price_min_unit: string | null;
          rates_checked_at: string | null;
          completeness: number;
          source: string | null;
          norm: string;
          updated_at: string;
        } & Horodate;
        Insert: {
          id?: string;
          slug: string;
          owner_id: string;
          name: string;
          categories?: string[];
          subcategory?: string | null;
          short_desc?: string | null;
          long_desc?: string | null;
          place_id?: string | null;
          address?: string | null;
          landmark?: string | null;
          lat?: number | null;
          lng?: number | null;
          phone?: string | null;
          whatsapp?: string | null;
          email?: string | null;
          website?: string | null;
          facebook?: string | null;
          logo_url?: string | null;
          cover_url?: string | null;
          cover_offset_y?: number;
          gallery?: Json;
          languages?: string[];
          payment_methods?: string[];
          price_level?: number | null;
          is_published?: boolean;
        };
        Update: {
          slug?: string;
          name?: string;
          categories?: string[];
          subcategory?: string | null;
          short_desc?: string | null;
          long_desc?: string | null;
          place_id?: string | null;
          address?: string | null;
          landmark?: string | null;
          lat?: number | null;
          lng?: number | null;
          phone?: string | null;
          whatsapp?: string | null;
          email?: string | null;
          website?: string | null;
          facebook?: string | null;
          logo_url?: string | null;
          cover_url?: string | null;
          cover_offset_y?: number;
          gallery?: Json;
          languages?: string[];
          payment_methods?: string[];
          price_level?: number | null;
          is_published?: boolean;
        };
        Relationships: [];
      };
      page_amenities: {
        Row: { page_id: string; code: string };
        Insert: { page_id: string; code: string };
        Update: never;
        Relationships: [];
      };
      page_hours: {
        Row: {
          page_id: string;
          jour: number;
          ouvre: string | null;
          ferme: string | null;
          ferme_toute_la_journee: boolean;
        };
        Insert: {
          page_id: string;
          jour: number;
          ouvre?: string | null;
          ferme?: string | null;
          ferme_toute_la_journee?: boolean;
        };
        Update: {
          ouvre?: string | null;
          ferme?: string | null;
          ferme_toute_la_journee?: boolean;
        };
        Relationships: [];
      };
      room_types: {
        Row: {
          id: string;
          page_id: string;
          name: string;
          description: string | null;
          photos: string[];
          units_count: number;
          max_adults: number | null;
          max_children: number | null;
          surface_m2: number | null;
          private_bath: boolean;
          hot_water: boolean;
          view: string | null;
          base_price_ar: number;
          price_unit: string;
          extra_person_ar: number | null;
          status: string;
          sort_order: number;
        } & Horodate;
        Insert: {
          id?: string;
          page_id: string;
          name: string;
          description?: string | null;
          photos?: string[];
          units_count?: number;
          max_adults?: number | null;
          max_children?: number | null;
          surface_m2?: number | null;
          private_bath?: boolean;
          hot_water?: boolean;
          view?: string | null;
          base_price_ar: number;
          price_unit?: string;
          extra_person_ar?: number | null;
          status?: string;
          sort_order?: number;
        };
        Update: {
          name?: string;
          description?: string | null;
          photos?: string[];
          units_count?: number;
          max_adults?: number | null;
          max_children?: number | null;
          surface_m2?: number | null;
          private_bath?: boolean;
          hot_water?: boolean;
          view?: string | null;
          base_price_ar?: number;
          price_unit?: string;
          extra_person_ar?: number | null;
          status?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      season_rates: {
        Row: {
          id: string;
          room_type_id: string;
          season_label: string;
          from_date: string | null;
          to_date: string | null;
          price_ar: number;
          price_unit: string;
          board: string | null;
          min_nights: number;
          resident_price_ar: number | null;
          checked_at: string;
        };
        Insert: {
          id?: string;
          room_type_id: string;
          season_label?: string;
          from_date?: string | null;
          to_date?: string | null;
          price_ar: number;
          price_unit?: string;
          board?: string | null;
          min_nights?: number;
          resident_price_ar?: number | null;
          checked_at?: string;
        };
        Update: {
          season_label?: string;
          from_date?: string | null;
          to_date?: string | null;
          price_ar?: number;
          price_unit?: string;
          board?: string | null;
          min_nights?: number;
          resident_price_ar?: number | null;
          checked_at?: string;
        };
        Relationships: [];
      };
      menu_sections: {
        Row: { id: string; page_id: string; name: string; service: string | null; sort_order: number };
        Insert: {
          id?: string;
          page_id: string;
          name: string;
          service?: string | null;
          sort_order?: number;
        };
        Update: { name?: string; service?: string | null; sort_order?: number };
        Relationships: [];
      };
      menu_items: {
        Row: {
          id: string;
          page_id: string;
          section_id: string | null;
          name: string;
          dish_id: string | null;
          description: string | null;
          price_ar: number | null;
          price_unit: string;
          photo_url: string | null;
          availability: string;
          tags: string[];
          side_dish: string | null;
          is_signature: boolean;
          in_stock: boolean;
          sort_order: number;
          norm: string;
        };
        Insert: {
          id?: string;
          page_id: string;
          section_id?: string | null;
          name: string;
          dish_id?: string | null;
          description?: string | null;
          price_ar?: number | null;
          price_unit?: string;
          photo_url?: string | null;
          availability?: string;
          tags?: string[];
          side_dish?: string | null;
          is_signature?: boolean;
          in_stock?: boolean;
          sort_order?: number;
        };
        Update: {
          section_id?: string | null;
          name?: string;
          dish_id?: string | null;
          description?: string | null;
          price_ar?: number | null;
          price_unit?: string;
          photo_url?: string | null;
          availability?: string;
          tags?: string[];
          side_dish?: string | null;
          is_signature?: boolean;
          in_stock?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      menu_photos: {
        Row: { id: string; page_id: string; url: string; legende: string | null; sort_order: number };
        Insert: {
          id?: string;
          page_id: string;
          url: string;
          legende?: string | null;
          sort_order?: number;
        };
        Update: { legende?: string | null; sort_order?: number };
        Relationships: [];
      };
      activities: {
        Row: {
          id: string;
          page_id: string;
          name: string;
          description: string | null;
          photos: string[];
          duration_h: number | null;
          price_ar: number | null;
          price_unit: string;
          min_people: number | null;
          max_people: number | null;
          includes: string[];
          months_open: number[] | null;
          sort_order: number;
        };
        Insert: {
          id?: string;
          page_id: string;
          name: string;
          description?: string | null;
          photos?: string[];
          duration_h?: number | null;
          price_ar?: number | null;
          price_unit?: string;
          min_people?: number | null;
          max_people?: number | null;
          includes?: string[];
          months_open?: number[] | null;
          sort_order?: number;
        };
        Update: {
          name?: string;
          description?: string | null;
          photos?: string[];
          duration_h?: number | null;
          price_ar?: number | null;
          price_unit?: string;
          min_people?: number | null;
          max_people?: number | null;
          includes?: string[];
          months_open?: number[] | null;
          sort_order?: number;
        };
        Relationships: [];
      };
      tours: {
        Row: {
          id: string;
          page_id: string;
          slug: string;
          title: string;
          summary: string | null;
          description: string | null;
          duration_days: number;
          duration_nights: number | null;
          difficulty: string | null;
          format: string | null;
          group_min: number | null;
          group_max: number | null;
          start_place_id: string | null;
          end_place_id: string | null;
          axe: string | null;
          transports: string[];
          guide_langs: string[];
          parks_included: boolean;
          months_open: number[] | null;
          photos: string[];
          norm: string;
        } & Horodate;
        Insert: {
          id?: string;
          page_id: string;
          slug: string;
          title: string;
          summary?: string | null;
          description?: string | null;
          duration_days: number;
          duration_nights?: number | null;
          difficulty?: string | null;
          format?: string | null;
          group_min?: number | null;
          group_max?: number | null;
          start_place_id?: string | null;
          end_place_id?: string | null;
          axe?: string | null;
          transports?: string[];
          guide_langs?: string[];
          parks_included?: boolean;
          months_open?: number[] | null;
          photos?: string[];
        };
        Update: {
          slug?: string;
          title?: string;
          summary?: string | null;
          description?: string | null;
          duration_days?: number;
          duration_nights?: number | null;
          difficulty?: string | null;
          format?: string | null;
          group_min?: number | null;
          group_max?: number | null;
          start_place_id?: string | null;
          end_place_id?: string | null;
          axe?: string | null;
          transports?: string[];
          guide_langs?: string[];
          parks_included?: boolean;
          months_open?: number[] | null;
          photos?: string[];
        };
        Relationships: [];
      };
      tour_days: {
        Row: {
          tour_id: string;
          jour: number;
          titre: string;
          detail: string | null;
          place_id: string | null;
          nuitee: string | null;
        };
        Insert: {
          tour_id: string;
          jour: number;
          titre: string;
          detail?: string | null;
          place_id?: string | null;
          nuitee?: string | null;
        };
        Update: {
          titre?: string;
          detail?: string | null;
          place_id?: string | null;
          nuitee?: string | null;
        };
        Relationships: [];
      };
      tour_prices: {
        Row: { id: string; tour_id: string; base_pax: number; price_ar: number; price_unit: string };
        Insert: {
          id?: string;
          tour_id: string;
          base_pax: number;
          price_ar: number;
          price_unit?: string;
        };
        Update: { base_pax?: number; price_ar?: number; price_unit?: string };
        Relationships: [];
      };
      tour_inclusions: {
        Row: { id: string; tour_id: string; libelle: string; inclus: boolean; sort_order: number };
        Insert: {
          id?: string;
          tour_id: string;
          libelle: string;
          inclus?: boolean;
          sort_order?: number;
        };
        Update: { libelle?: string; inclus?: boolean; sort_order?: number };
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          page_id: string;
          author_id: string;
          note: number;
          note_proprete: number | null;
          note_accueil: number | null;
          note_rapport: number | null;
          body: string | null;
          visite_le: string | null;
          status: string;
        } & Horodate;
        Insert: {
          id?: string;
          page_id: string;
          author_id: string;
          note: number;
          note_proprete?: number | null;
          note_accueil?: number | null;
          note_rapport?: number | null;
          body?: string | null;
          visite_le?: string | null;
        };
        Update: {
          note?: number;
          note_proprete?: number | null;
          note_accueil?: number | null;
          note_rapport?: number | null;
          body?: string | null;
          visite_le?: string | null;
        };
        Relationships: [];
      };
      review_replies: {
        Row: { review_id: string; page_id: string; body: string } & Horodate;
        Insert: { review_id: string; page_id: string; body: string; created_at?: string };
        Update: { body?: string };
        Relationships: [];
      };
      post_mentions: {
        Row: { post_id: string; page_id: string };
        Insert: { post_id: string; page_id: string };
        Update: never;
        Relationships: [];
      };

      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          navigateur: string | null;
          vu_le: string;
        } & Horodate;
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          navigateur?: string | null;
          vu_le?: string;
        };
        Update: { vu_le?: string; navigateur?: string | null };
        Relationships: [];
      };
      journal_erreurs: {
        Row: {
          id: number;
          message: string;
          source: string | null;
          ligne: number | null;
          pile: string | null;
          chemin: string | null;
          navigateur: string | null;
          reseau: string | null;
        } & Horodate;
        Insert: {
          message: string;
          source?: string | null;
          ligne?: number | null;
          pile?: string | null;
          chemin?: string | null;
          navigateur?: string | null;
          reseau?: string | null;
        };
        Update: never;
        Relationships: [];
      };

      /* ── SOCLE DE L'AGENT (migration 0010) ────────────────────────────── */
      cuisines: {
        Row: { slug: string; label_fr: string; rang: number; norm: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      page_cuisines: {
        Row: { page_id: string; cuisine_slug: string };
        Insert: { page_id: string; cuisine_slug: string };
        Update: never;
        Relationships: [];
      };
      page_saves: {
        Row: { page_id: string; user_id: string; note: string | null } & Horodate;
        Insert: { page_id: string; user_id: string; note?: string | null };
        Update: { note?: string | null };
        Relationships: [];
      };
      page_claims: {
        Row: {
          id: string;
          page_id: string;
          user_id: string;
          message: string | null;
          telephone: string | null;
          statut: string;
          traite_le: string | null;
        } & Horodate;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      place_access: {
        Row: {
          id: string;
          place_id: string;
          from_place_id: string;
          mode: string;
          distance_km: number | null;
          duration_h: number | null;
          road_state: string | null;
          all_year: boolean;
          departure_point: string | null;
          operators: string[] | null;
          price_ar: number | null;
        };
        Insert: never;
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

      /* ── Référentiels et recherche (0004-0008) ─────────────────────────── */
      resoudre_lieu: {
        Args: { p_terme: string; p_limite?: number };
        Returns: {
          id: string;
          slug: string;
          name_fr: string;
          kind: string;
          region: string | null;
          score: number;
        }[];
      };
      resoudre_plat: {
        Args: { p_terme: string; p_limite?: number };
        Returns: { id: string; slug: string; name_fr: string; family: string | null; score: number }[];
      };
      suggerer: { Args: { p_terme: string; p_limite?: number }; Returns: Json };
      get_page_by_slug: { Args: { p_slug: string }; Returns: Json };
      ouvrir_conversation_page: { Args: { p_page: string }; Returns: string };
      chercher_pages: {
        Args: {
          p_lieu?: string | null;
          p_categorie?: string | null;
          p_prix_max?: number | null;
          p_plat?: string | null;
          p_curseur_score?: number | null;
          p_curseur_id?: string | null;
          p_limite?: number;
          p_equipements?: string[] | null;
        };
        Returns: {
          id: string;
          slug: string;
          name: string;
          categories: string[];
          short_desc: string | null;
          cover_url: string | null;
          place_slug: string | null;
          place_name: string | null;
          landmark: string | null;
          price_min_ar: number | null;
          price_min_unit: string | null;
          rating_avg: number;
          rating_count: number;
          verification_status: string;
          completeness: number;
          prix_du_plat: number | null;
        }[];
      };
      stats_diako: {
        Args: Record<string, never>;
        Returns: {
          recits: number;
          etablissements: number;
          destinations: number;
          plats: number;
          membres: number;
          vues_7j: number;
        };
      };
      recits_en_vogue: {
        Args: { p_limite?: number };
        Returns: {
          id: string;
          body: string | null;
          media: unknown;
          place: string | null;
          dish: string | null;
          created_at: string;
          reactions_count: number;
          comments_count: number;
          saves_count: number;
          auteur_nom: string | null;
          auteur_avatar: string | null;
          score: number;
        }[];
      };
      saison_du_mois: {
        Args: { p_mois?: number | null; p_limite?: number };
        Returns: {
          slug: string;
          nom: string;
          region: string | null;
          note: string;
          raison: string | null;
        }[];
      };
      pages_carte: {
        Args: { p_categorie?: string | null; p_limite?: number };
        Returns: {
          id: string;
          slug: string;
          name: string;
          categories: string[];
          cover_url: string | null;
          lat: number;
          lng: number;
          precision_geo: string;
          geo_source: string | null;
          place_name: string | null;
          price_min_ar: number | null;
          price_min_unit: string | null;
          rating_avg: number;
          rating_count: number;
        }[];
      };
      mes_etablissements_gardes: {
        Args: { p_limite?: number };
        Returns: {
          id: string;
          slug: string;
          name: string;
          categories: string[];
          short_desc: string | null;
          cover_url: string | null;
          place_name: string | null;
          landmark: string | null;
          phone: string | null;
          price_min_ar: number | null;
          price_min_unit: string | null;
          rating_avg: number;
          rating_count: number;
          garde_le: string;
          note: string | null;
        }[];
      };
      mes_publications_aimees: { Args: { p_limite?: number }; Returns: Json };
      marquer_conversation_lue: { Args: { p_conv: string }; Returns: number };
      messages_non_lus: { Args: Record<string, never>; Returns: number };
      revendiquer_page: {
        Args: { p_page: string; p_message: string | null; p_tel: string | null };
        Returns: string;
      };
      agent_chercher: {
        Args: {
          p_lieu?: string | null;
          p_categorie?: string | null;
          p_budget_max?: number | null;
          p_budget_min?: number | null;
          p_equipements?: string[] | null;
          p_cuisines?: string[] | null;
          p_plat?: string | null;
          p_personnes?: number | null;
          p_limite?: number;
        };
        Returns: Json;
      };
      distance_km: {
        Args: { lat1: number; lng1: number; lat2: number; lng2: number };
        Returns: number;
      };
      lieu_le_plus_proche: { Args: { p_lat: number; p_lng: number }; Returns: Json };
      autour_de_moi: {
        Args: {
          p_lat: number;
          p_lng: number;
          p_rayon_km?: number;
          p_categorie?: string | null;
          p_limite?: number;
        };
        Returns: {
          id: string;
          slug: string;
          name: string;
          categories: string[];
          short_desc: string | null;
          cover_url: string | null;
          place_name: string | null;
          landmark: string | null;
          phone: string | null;
          price_min_ar: number | null;
          price_min_unit: string | null;
          rating_avg: number;
          rating_count: number;
          completeness: number;
          distance_km: number | null;
        }[];
      };
      itineraire_axe: { Args: { p_axe: string | null; p_depuis?: string }; Returns: Json };
      trajets_depuis: { Args: { p_lieu: string }; Returns: Json };
      restaurants_par_plat: {
        Args: { p_plat: string; p_lieu?: string | null; p_limite?: number };
        Returns: {
          page_id: string;
          page_slug: string;
          page_name: string;
          place_name: string | null;
          landmark: string | null;
          cover_url: string | null;
          rating_avg: number;
          rating_count: number;
          nom_sur_la_carte: string;
          price_ar: number | null;
          price_unit: string;
          is_signature: boolean;
        }[];
      };
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
