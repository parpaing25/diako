/**
 * TYPES DE LA BASE — GÉNÉRÉS PAR LE CONNECTEUR, PLUS ÉCRITS À LA MAIN.
 *
 * 🔴 CE FICHIER ÉTAIT MAINTENU À LA MAIN, ET ÇA COÛTAIT DES DÉFAUTS SILENCIEUX.
 *    Une table oubliée, une colonne ajoutée en base et pas ici, une fonction
 *    nouvelle : rien ne le signalait, et le code contournait avec des
 *    échappatoires non typées. Deux exemples payés cette semaine :
 *
 *      - faute de RELATIONS déclarées, la jointure `places!posts_place_id_fkey`
 *        ne typait pas ; les puces de lieu du fil retombaient sur une recherche
 *        plein texte au lieu de mener à la fiche ;
 *      - `dish_aliases` n'a pas de colonne `id`, mais le client en demandait
 *        une : PostgREST refusait la requête entière et l'atlas annonçait
 *        « 0 orthographe » au lieu de 254, sans une erreur à l'écran.
 *
 * ⚠ RÉGÉNÉRÉ LE 18/08/2026, après les migrations 0096 → 0113. À REFAIRE APRÈS
 *   TOUTE MIGRATION qui touche une table, une vue ou une fonction — sinon les
 *   échappatoires reviennent, une par une :
 *
 *     connecteur Supabase → generate_typescript_types, puis `npm run build`.
 *
 * 🔴 CE QUE LA RÉGÉNÉRATION CHANGE, ET QU'IL FAUT SAVOIR. Le générateur écrit
 *    `| null` là où le fichier manuel écrivait `| undefined` sur une vingtaine
 *    de types du produit. C'est le générateur qui a raison — une colonne
 *    nullable rend `null`, jamais `undefined` — mais les interfaces du produit
 *    ont dû être alignées. C'est pour cette raison que ce chantier avait été
 *    reporté hors de la veille du lancement.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          description: string | null
          duration_h: number | null
          id: string
          includes: string[]
          max_people: number | null
          min_people: number | null
          months_open: number[] | null
          name: string
          page_id: string
          photos: string[]
          price_ar: number | null
          price_unit: string
          sort_order: number
        }
        Insert: {
          description?: string | null
          duration_h?: number | null
          id?: string
          includes?: string[]
          max_people?: number | null
          min_people?: number | null
          months_open?: number[] | null
          name: string
          page_id: string
          photos?: string[]
          price_ar?: number | null
          price_unit?: string
          sort_order?: number
        }
        Update: {
          description?: string | null
          duration_h?: number | null
          id?: string
          includes?: string[]
          max_people?: number | null
          min_people?: number | null
          months_open?: number[] | null
          name?: string
          page_id?: string
          photos?: string[]
          price_ar?: number | null
          price_unit?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "activities_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_memories: {
        Row: {
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      agent_rate: {
        Row: {
          cle: string
          minute: string
          n: number
        }
        Insert: {
          cle: string
          minute: string
          n?: number
        }
        Update: {
          cle?: string
          minute?: string
          n?: number
        }
        Relationships: []
      }
      amenities: {
        Row: {
          applies_to: string[]
          category: string
          code: string
          icon: string | null
          label_fr: string
          label_mg: string | null
          rang: number
        }
        Insert: {
          applies_to?: string[]
          category: string
          code: string
          icon?: string | null
          label_fr: string
          label_mg?: string | null
          rang?: number
        }
        Update: {
          applies_to?: string[]
          category?: string
          code?: string
          icon?: string | null
          label_fr?: string
          label_mg?: string | null
          rang?: number
        }
        Relationships: []
      }
      app_flags: {
        Row: {
          actif: boolean
          cle: string
          maj: string
        }
        Insert: {
          actif?: boolean
          cle: string
          maj?: string
        }
        Update: {
          actif?: boolean
          cle?: string
          maj?: string
        }
        Relationships: []
      }
      attractions: {
        Row: {
          best_months: number[]
          circuits: Json
          cover_credit: string | null
          cover_licence: string | null
          cover_source: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          fady: string[]
          fee_nonresident_ar: number | null
          fee_resident_ar: number | null
          gear_needed: string[]
          guide_fee_group_ar: number | null
          guide_required: boolean
          id: string
          is_published: boolean
          kind: string
          lat: number | null
          lng: number | null
          manager: string | null
          name: string
          opening_hours: string | null
          place_id: string | null
          rates_checked_at: string | null
          slug: string
          source: string | null
          species: string[]
          summary: string | null
          ticket_validity_days: number | null
          updated_at: string
        }
        Insert: {
          best_months?: number[]
          circuits?: Json
          cover_credit?: string | null
          cover_licence?: string | null
          cover_source?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          fady?: string[]
          fee_nonresident_ar?: number | null
          fee_resident_ar?: number | null
          gear_needed?: string[]
          guide_fee_group_ar?: number | null
          guide_required?: boolean
          id?: string
          is_published?: boolean
          kind?: string
          lat?: number | null
          lng?: number | null
          manager?: string | null
          name: string
          opening_hours?: string | null
          place_id?: string | null
          rates_checked_at?: string | null
          slug: string
          source?: string | null
          species?: string[]
          summary?: string | null
          ticket_validity_days?: number | null
          updated_at?: string
        }
        Update: {
          best_months?: number[]
          circuits?: Json
          cover_credit?: string | null
          cover_licence?: string | null
          cover_source?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          fady?: string[]
          fee_nonresident_ar?: number | null
          fee_resident_ar?: number | null
          gear_needed?: string[]
          guide_fee_group_ar?: number | null
          guide_required?: boolean
          id?: string
          is_published?: boolean
          kind?: string
          lat?: number | null
          lng?: number | null
          manager?: string | null
          name?: string
          opening_hours?: string | null
          place_id?: string | null
          rates_checked_at?: string | null
          slug?: string
          source?: string | null
          species?: string[]
          summary?: string | null
          ticket_validity_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attractions_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          adults: number
          children_ages: number[]
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          date_from: string | null
          date_to: string | null
          first_reply_at: string | null
          id: string
          kind: string
          message: string | null
          page_id: string
          status: string
          user_id: string | null
        }
        Insert: {
          adults?: number
          children_ages?: number[]
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          first_reply_at?: string | null
          id?: string
          kind?: string
          message?: string | null
          page_id: string
          status?: string
          user_id?: string | null
        }
        Update: {
          adults?: number
          children_ages?: number[]
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          first_reply_at?: string | null
          id?: string
          kind?: string
          message?: string | null
          page_id?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          parent_id: string | null
          post_id: string
          status: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          parent_id?: string | null
          post_id: string
          status?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          post_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          a_id: string
          b_id: string
          created_at: string
          id: string
          last_at: string
          page_id: string | null
        }
        Insert: {
          a_id: string
          b_id: string
          created_at?: string
          id?: string
          last_at?: string
          page_id?: string | null
        }
        Update: {
          a_id?: string
          b_id?: string
          created_at?: string
          id?: string
          last_at?: string
          page_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_a_id_fkey"
            columns: ["a_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_b_id_fkey"
            columns: ["b_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      cuisine_aliases: {
        Row: {
          alias: string
          cuisine_slug: string
          norm: string | null
        }
        Insert: {
          alias: string
          cuisine_slug: string
          norm?: string | null
        }
        Update: {
          alias?: string
          cuisine_slug?: string
          norm?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cuisine_aliases_cuisine_slug_fkey"
            columns: ["cuisine_slug"]
            isOneToOne: false
            referencedRelation: "cuisines"
            referencedColumns: ["slug"]
          },
        ]
      }
      cuisines: {
        Row: {
          label_fr: string
          norm: string | null
          rang: number
          slug: string
        }
        Insert: {
          label_fr: string
          norm?: string | null
          rang?: number
          slug: string
        }
        Update: {
          label_fr?: string
          norm?: string | null
          rang?: number
          slug?: string
        }
        Relationships: []
      }
      dish_aliases: {
        Row: {
          alias: string
          dish_id: string
          norm: string | null
        }
        Insert: {
          alias: string
          dish_id: string
          norm?: string | null
        }
        Update: {
          alias?: string
          dish_id?: string
          norm?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dish_aliases_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
        ]
      }
      dish_tastings: {
        Row: {
          created_at: string
          dish_id: string
          id: string
          note: string | null
          post_id: string | null
          tasted_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dish_id: string
          id?: string
          note?: string | null
          post_id?: string | null
          tasted_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dish_id?: string
          id?: string
          note?: string | null
          post_id?: string | null
          tasted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dish_tastings_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dish_tastings_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      dishes: {
        Row: {
          created_at: string
          description: string | null
          family: string | null
          has_beef: boolean
          has_peanut: boolean
          has_pork: boolean
          has_seafood: boolean
          id: string
          ingredients: string[] | null
          is_vegetarian: boolean
          name_fr: string
          name_mg: string | null
          nb_restaurants: number
          norm: string | null
          photo_credit: string | null
          photo_licence: string | null
          photo_source: string | null
          photo_url: string | null
          price_max_ar: number | null
          price_min_ar: number | null
          slug: string
          spice_level: number | null
          typical_place_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          family?: string | null
          has_beef?: boolean
          has_peanut?: boolean
          has_pork?: boolean
          has_seafood?: boolean
          id?: string
          ingredients?: string[] | null
          is_vegetarian?: boolean
          name_fr: string
          name_mg?: string | null
          nb_restaurants?: number
          norm?: string | null
          photo_credit?: string | null
          photo_licence?: string | null
          photo_source?: string | null
          photo_url?: string | null
          price_max_ar?: number | null
          price_min_ar?: number | null
          slug: string
          spice_level?: number | null
          typical_place_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          family?: string | null
          has_beef?: boolean
          has_peanut?: boolean
          has_pork?: boolean
          has_seafood?: boolean
          id?: string
          ingredients?: string[] | null
          is_vegetarian?: boolean
          name_fr?: string
          name_mg?: string | null
          nb_restaurants?: number
          norm?: string | null
          photo_credit?: string | null
          photo_licence?: string | null
          photo_source?: string | null
          photo_url?: string | null
          price_max_ar?: number | null
          price_min_ar?: number | null
          slug?: string
          spice_level?: number | null
          typical_place_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dishes_typical_place_id_fkey"
            columns: ["typical_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          confiance: string | null
          created_at: string
          description: string | null
          ends_on: string | null
          id: string
          is_published: boolean
          kind: string
          lieu_libre: string | null
          mois: number[]
          organizer: string | null
          page_id: string | null
          periode: string | null
          place_id: string | null
          poster_credit: string | null
          poster_licence: string | null
          poster_source: string | null
          poster_url: string | null
          price_ar: number | null
          price_unit: string | null
          recurrent: boolean
          slug: string
          source: string | null
          starts_on: string | null
          summary: string | null
          title: string
          yearly: boolean
        }
        Insert: {
          confiance?: string | null
          created_at?: string
          description?: string | null
          ends_on?: string | null
          id?: string
          is_published?: boolean
          kind?: string
          lieu_libre?: string | null
          mois?: number[]
          organizer?: string | null
          page_id?: string | null
          periode?: string | null
          place_id?: string | null
          poster_credit?: string | null
          poster_licence?: string | null
          poster_source?: string | null
          poster_url?: string | null
          price_ar?: number | null
          price_unit?: string | null
          recurrent?: boolean
          slug: string
          source?: string | null
          starts_on?: string | null
          summary?: string | null
          title: string
          yearly?: boolean
        }
        Update: {
          confiance?: string | null
          created_at?: string
          description?: string | null
          ends_on?: string | null
          id?: string
          is_published?: boolean
          kind?: string
          lieu_libre?: string | null
          mois?: number[]
          organizer?: string | null
          page_id?: string | null
          periode?: string | null
          place_id?: string | null
          poster_credit?: string | null
          poster_licence?: string | null
          poster_source?: string | null
          poster_url?: string | null
          price_ar?: number | null
          price_unit?: string | null
          recurrent?: boolean
          slug?: string
          source?: string | null
          starts_on?: string | null
          summary?: string | null
          title?: string
          yearly?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "events_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          target_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          target_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guides: {
        Row: {
          body: string | null
          cover_url: string | null
          created_at: string
          id: string
          is_published: boolean
          kind: string
          place_id: string | null
          published_at: string | null
          slug: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          cover_url?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          kind?: string
          place_id?: string | null
          published_at?: string | null
          slug: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          cover_url?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          kind?: string
          place_id?: string | null
          published_at?: string | null
          slug?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guides_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_erreurs: {
        Row: {
          chemin: string | null
          created_at: string
          id: number
          ligne: number | null
          message: string
          navigateur: string | null
          pile: string | null
          reseau: string | null
          source: string | null
        }
        Insert: {
          chemin?: string | null
          created_at?: string
          id?: number
          ligne?: number | null
          message: string
          navigateur?: string | null
          pile?: string | null
          reseau?: string | null
          source?: string | null
        }
        Update: {
          chemin?: string | null
          created_at?: string
          id?: number
          ligne?: number | null
          message?: string
          navigateur?: string | null
          pile?: string | null
          reseau?: string | null
          source?: string | null
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          availability: string
          description: string | null
          dish_id: string | null
          id: string
          in_stock: boolean
          is_signature: boolean
          name: string
          norm: string | null
          page_id: string
          photo_url: string | null
          price_ar: number | null
          price_unit: string
          releve_le: string | null
          section_id: string | null
          side_dish: string | null
          sort_order: number
          tags: string[]
        }
        Insert: {
          availability?: string
          description?: string | null
          dish_id?: string | null
          id?: string
          in_stock?: boolean
          is_signature?: boolean
          name: string
          norm?: string | null
          page_id: string
          photo_url?: string | null
          price_ar?: number | null
          price_unit?: string
          releve_le?: string | null
          section_id?: string | null
          side_dish?: string | null
          sort_order?: number
          tags?: string[]
        }
        Update: {
          availability?: string
          description?: string | null
          dish_id?: string | null
          id?: string
          in_stock?: boolean
          is_signature?: boolean
          name?: string
          norm?: string | null
          page_id?: string
          photo_url?: string | null
          price_ar?: number | null
          price_unit?: string
          releve_le?: string | null
          section_id?: string | null
          side_dish?: string | null
          sort_order?: number
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "menu_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_photos: {
        Row: {
          id: string
          legende: string | null
          page_id: string
          sort_order: number
          url: string
        }
        Insert: {
          id?: string
          legende?: string | null
          page_id: string
          sort_order?: number
          url: string
        }
        Update: {
          id?: string
          legende?: string | null
          page_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_photos_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_sections: {
        Row: {
          id: string
          name: string
          page_id: string
          service: string | null
          sort_order: number
        }
        Insert: {
          id?: string
          name: string
          page_id: string
          service?: string | null
          sort_order?: number
        }
        Update: {
          id?: string
          name?: string
          page_id?: string
          service?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_sections_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conv_id: string
          created_at: string
          id: string
          read: boolean
          sender_id: string
        }
        Insert: {
          body: string
          conv_id: string
          created_at?: string
          id?: string
          read?: boolean
          sender_id: string
        }
        Update: {
          body?: string
          conv_id?: string
          created_at?: string
          id?: string
          read?: boolean
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conv_id_fkey"
            columns: ["conv_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          data: Json
          id: string
          message: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          message?: string | null
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          message?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      page_amenities: {
        Row: {
          code: string
          page_id: string
        }
        Insert: {
          code: string
          page_id: string
        }
        Update: {
          code?: string
          page_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_amenities_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "amenities"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "page_amenities_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      page_claims: {
        Row: {
          created_at: string
          id: string
          message: string | null
          nif: string | null
          page_id: string
          photo_lieu_chemin: string | null
          piece_chemin: string | null
          pieces_purgees_le: string | null
          role_declare: string | null
          stat: string | null
          statut: string
          telephone: string | null
          traite_le: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          nif?: string | null
          page_id: string
          photo_lieu_chemin?: string | null
          piece_chemin?: string | null
          pieces_purgees_le?: string | null
          role_declare?: string | null
          stat?: string | null
          statut?: string
          telephone?: string | null
          traite_le?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          nif?: string | null
          page_id?: string
          photo_lieu_chemin?: string | null
          piece_chemin?: string | null
          pieces_purgees_le?: string | null
          role_declare?: string | null
          stat?: string | null
          statut?: string
          telephone?: string | null
          traite_le?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_claims_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      page_cuisines: {
        Row: {
          cuisine_slug: string
          page_id: string
        }
        Insert: {
          cuisine_slug: string
          page_id: string
        }
        Update: {
          cuisine_slug?: string
          page_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_cuisines_cuisine_slug_fkey"
            columns: ["cuisine_slug"]
            isOneToOne: false
            referencedRelation: "cuisines"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "page_cuisines_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      page_gestionnaires: {
        Row: {
          ajoute_le: string
          ajoute_par: string | null
          page_id: string
          user_id: string
        }
        Insert: {
          ajoute_le?: string
          ajoute_par?: string | null
          page_id: string
          user_id: string
        }
        Update: {
          ajoute_le?: string
          ajoute_par?: string | null
          page_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_gestionnaires_ajoute_par_fkey"
            columns: ["ajoute_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_gestionnaires_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_gestionnaires_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      page_hours: {
        Row: {
          ferme: string | null
          ferme_toute_la_journee: boolean
          jour: number
          ouvre: string | null
          page_id: string
        }
        Insert: {
          ferme?: string | null
          ferme_toute_la_journee?: boolean
          jour: number
          ouvre?: string | null
          page_id: string
        }
        Update: {
          ferme?: string | null
          ferme_toute_la_journee?: boolean
          jour?: number
          ouvre?: string | null
          page_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_hours_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      page_saves: {
        Row: {
          created_at: string
          note: string | null
          page_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          page_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          page_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_saves_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_saves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      page_views: {
        Row: {
          created_at: string
          id: number
          path: string
          ref: string | null
          sid: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          path: string
          ref?: string | null
          sid?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          path?: string
          ref?: string | null
          sid?: string | null
        }
        Relationships: []
      }
      pages: {
        Row: {
          address: string | null
          categories: string[]
          completeness: number
          cover_credit: string | null
          cover_licence: string | null
          cover_offset_y: number
          cover_source: string | null
          cover_url: string | null
          created_at: string
          email: string | null
          facebook: string | null
          gallery: Json
          geo_source: string | null
          id: string
          is_published: boolean
          landmark: string | null
          languages: string[]
          lat: number | null
          lng: number | null
          logo_url: string | null
          long_desc: string | null
          name: string
          norm: string | null
          owner_id: string | null
          payment_methods: string[]
          phone: string | null
          place_id: string | null
          price_level: number | null
          price_min_ar: number | null
          price_min_unit: string | null
          rates_checked_at: string | null
          rating_avg: number
          rating_count: number
          short_desc: string | null
          slug: string
          source: string | null
          subcategory: string | null
          updated_at: string
          verification_status: string
          views_count: number
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          categories?: string[]
          completeness?: number
          cover_credit?: string | null
          cover_licence?: string | null
          cover_offset_y?: number
          cover_source?: string | null
          cover_url?: string | null
          created_at?: string
          email?: string | null
          facebook?: string | null
          gallery?: Json
          geo_source?: string | null
          id?: string
          is_published?: boolean
          landmark?: string | null
          languages?: string[]
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          long_desc?: string | null
          name: string
          norm?: string | null
          owner_id?: string | null
          payment_methods?: string[]
          phone?: string | null
          place_id?: string | null
          price_level?: number | null
          price_min_ar?: number | null
          price_min_unit?: string | null
          rates_checked_at?: string | null
          rating_avg?: number
          rating_count?: number
          short_desc?: string | null
          slug: string
          source?: string | null
          subcategory?: string | null
          updated_at?: string
          verification_status?: string
          views_count?: number
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          categories?: string[]
          completeness?: number
          cover_credit?: string | null
          cover_licence?: string | null
          cover_offset_y?: number
          cover_source?: string | null
          cover_url?: string | null
          created_at?: string
          email?: string | null
          facebook?: string | null
          gallery?: Json
          geo_source?: string | null
          id?: string
          is_published?: boolean
          landmark?: string | null
          languages?: string[]
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          long_desc?: string | null
          name?: string
          norm?: string | null
          owner_id?: string | null
          payment_methods?: string[]
          phone?: string | null
          place_id?: string | null
          price_level?: number | null
          price_min_ar?: number | null
          price_min_unit?: string | null
          rates_checked_at?: string | null
          rating_avg?: number
          rating_count?: number
          short_desc?: string | null
          slug?: string
          source?: string | null
          subcategory?: string | null
          updated_at?: string
          verification_status?: string
          views_count?: number
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pages_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_propositions: {
        Row: {
          cible_id: string
          cible_type: string
          created_at: string
          credit: string | null
          hauteur: number | null
          id: string
          largeur: number | null
          legende: string | null
          motif_refus: string | null
          proposeur_id: string
          statut: string
          traite_le: string | null
          traite_par: string | null
          url: string
        }
        Insert: {
          cible_id: string
          cible_type: string
          created_at?: string
          credit?: string | null
          hauteur?: number | null
          id?: string
          largeur?: number | null
          legende?: string | null
          motif_refus?: string | null
          proposeur_id: string
          statut?: string
          traite_le?: string | null
          traite_par?: string | null
          url: string
        }
        Update: {
          cible_id?: string
          cible_type?: string
          created_at?: string
          credit?: string | null
          hauteur?: number | null
          id?: string
          largeur?: number | null
          legende?: string | null
          motif_refus?: string | null
          proposeur_id?: string
          statut?: string
          traite_le?: string | null
          traite_par?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_propositions_proposeur_id_fkey"
            columns: ["proposeur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_propositions_traite_par_fkey"
            columns: ["traite_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      place_access: {
        Row: {
          all_year: boolean
          departure_point: string | null
          distance_km: number | null
          duration_h: number | null
          from_place_id: string
          id: string
          mode: string
          operators: string[] | null
          place_id: string
          price_ar: number | null
          road_state: string | null
        }
        Insert: {
          all_year?: boolean
          departure_point?: string | null
          distance_km?: number | null
          duration_h?: number | null
          from_place_id: string
          id?: string
          mode: string
          operators?: string[] | null
          place_id: string
          price_ar?: number | null
          road_state?: string | null
        }
        Update: {
          all_year?: boolean
          departure_point?: string | null
          distance_km?: number | null
          duration_h?: number | null
          from_place_id?: string
          id?: string
          mode?: string
          operators?: string[] | null
          place_id?: string
          price_ar?: number | null
          road_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "place_access_from_place_id_fkey"
            columns: ["from_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_access_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_aliases: {
        Row: {
          alias: string
          norm: string | null
          place_id: string
        }
        Insert: {
          alias: string
          norm?: string | null
          place_id: string
        }
        Update: {
          alias?: string
          norm?: string | null
          place_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_aliases_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_seasons: {
        Row: {
          month: number
          place_id: string
          rating: string
          reason: string | null
        }
        Insert: {
          month: number
          place_id: string
          rating: string
          reason?: string | null
        }
        Update: {
          month?: number
          place_id?: string
          rating?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "place_seasons_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          axe: string | null
          cover_credit: string | null
          cover_licence: string | null
          cover_source: string | null
          cover_url: string | null
          created_at: string
          id: string
          is_touristique: boolean
          kind: string
          lat: number | null
          lng: number | null
          merged_into: string | null
          name_fr: string
          name_mg: string | null
          nb_pages: number
          nb_posts: number
          norm: string | null
          parent_id: string | null
          radius_km: number
          region: string | null
          slug: string
          summary: string | null
          ville_proche_id: string | null
          why_go: string[] | null
        }
        Insert: {
          axe?: string | null
          cover_credit?: string | null
          cover_licence?: string | null
          cover_source?: string | null
          cover_url?: string | null
          created_at?: string
          id?: string
          is_touristique?: boolean
          kind: string
          lat?: number | null
          lng?: number | null
          merged_into?: string | null
          name_fr: string
          name_mg?: string | null
          nb_pages?: number
          nb_posts?: number
          norm?: string | null
          parent_id?: string | null
          radius_km?: number
          region?: string | null
          slug: string
          summary?: string | null
          ville_proche_id?: string | null
          why_go?: string[] | null
        }
        Update: {
          axe?: string | null
          cover_credit?: string | null
          cover_licence?: string | null
          cover_source?: string | null
          cover_url?: string | null
          created_at?: string
          id?: string
          is_touristique?: boolean
          kind?: string
          lat?: number | null
          lng?: number | null
          merged_into?: string | null
          name_fr?: string
          name_mg?: string | null
          nb_pages?: number
          nb_posts?: number
          norm?: string | null
          parent_id?: string | null
          radius_km?: number
          region?: string | null
          slug?: string
          summary?: string | null
          ville_proche_id?: string | null
          why_go?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "places_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "places_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "places_ville_proche_id_fkey"
            columns: ["ville_proche_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      post_mentions: {
        Row: {
          page_id: string
          post_id: string
        }
        Insert: {
          page_id: string
          post_id: string
        }
        Update: {
          page_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_mentions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          body: string | null
          comments_count: number
          created_at: string
          dish: string | null
          dish_id: string | null
          id: string
          kind: string
          media: Json
          page_name: string | null
          place: string | null
          place_id: string | null
          price_ar: number | null
          price_on: string | null
          price_unit: string | null
          reactions_count: number
          saves_count: number
          status: string
          updated_at: string
          visibilite: string
        }
        Insert: {
          author_id: string
          body?: string | null
          comments_count?: number
          created_at?: string
          dish?: string | null
          dish_id?: string | null
          id?: string
          kind?: string
          media?: Json
          page_name?: string | null
          place?: string | null
          place_id?: string | null
          price_ar?: number | null
          price_on?: string | null
          price_unit?: string | null
          reactions_count?: number
          saves_count?: number
          status?: string
          updated_at?: string
          visibilite?: string
        }
        Update: {
          author_id?: string
          body?: string | null
          comments_count?: number
          created_at?: string
          dish?: string | null
          dish_id?: string | null
          id?: string
          kind?: string
          media?: Json
          page_name?: string | null
          place?: string | null
          place_id?: string | null
          price_ar?: number | null
          price_on?: string | null
          price_unit?: string | null
          reactions_count?: number
          saves_count?: number
          status?: string
          updated_at?: string
          visibilite?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: string
          avatar_url: string | null
          bio: string | null
          cover_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          followers_count: number
          following_count: number
          home_place: string | null
          id: string
          language: string
          lieux_publics: boolean
          metier_pro: string | null
          phone: string | null
          posts_count: number
          updated_at: string
          verification: string
        }
        Insert: {
          account_type?: string
          avatar_url?: string | null
          bio?: string | null
          cover_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          followers_count?: number
          following_count?: number
          home_place?: string | null
          id: string
          language?: string
          lieux_publics?: boolean
          metier_pro?: string | null
          phone?: string | null
          posts_count?: number
          updated_at?: string
          verification?: string
        }
        Update: {
          account_type?: string
          avatar_url?: string | null
          bio?: string | null
          cover_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          followers_count?: number
          following_count?: number
          home_place?: string | null
          id?: string
          language?: string
          lieux_publics?: boolean
          metier_pro?: string | null
          phone?: string | null
          posts_count?: number
          updated_at?: string
          verification?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          actif: boolean
          avantage: string | null
          code: string
          created_at: string
          cree_par: string | null
          debut: string | null
          detail: string | null
          fin: string | null
          id: string
          libelle: string
          page_id: string | null
        }
        Insert: {
          actif?: boolean
          avantage?: string | null
          code: string
          created_at?: string
          cree_par?: string | null
          debut?: string | null
          detail?: string | null
          fin?: string | null
          id?: string
          libelle: string
          page_id?: string | null
        }
        Update: {
          actif?: boolean
          avantage?: string | null
          code?: string
          created_at?: string
          cree_par?: string | null
          debut?: string | null
          detail?: string | null
          fin?: string | null
          id?: string
          libelle?: string
          page_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_cree_par_fkey"
            columns: ["cree_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          navigateur: string | null
          p256dh: string
          user_id: string
          vu_le: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          navigateur?: string | null
          p256dh: string
          user_id: string
          vu_le?: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          navigateur?: string | null
          p256dh?: string
          user_id?: string
          vu_le?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reactions: {
        Row: {
          created_at: string
          id: string
          post_id: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reporter_id: string
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reporter_id: string
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_replies: {
        Row: {
          body: string
          created_at: string
          page_id: string
          review_id: string
        }
        Insert: {
          body: string
          created_at?: string
          page_id: string
          review_id: string
        }
        Update: {
          body?: string
          created_at?: string
          page_id?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_replies_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_replies_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_id: string
          body: string | null
          created_at: string
          id: string
          note: number
          note_accueil: number | null
          note_proprete: number | null
          note_rapport: number | null
          page_id: string
          status: string
          visite_le: string | null
        }
        Insert: {
          author_id: string
          body?: string | null
          created_at?: string
          id?: string
          note: number
          note_accueil?: number | null
          note_proprete?: number | null
          note_rapport?: number | null
          page_id: string
          status?: string
          visite_le?: string | null
        }
        Update: {
          author_id?: string
          body?: string | null
          created_at?: string
          id?: string
          note?: number
          note_accueil?: number | null
          note_proprete?: number | null
          note_rapport?: number | null
          page_id?: string
          status?: string
          visite_le?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      room_types: {
        Row: {
          base_price_ar: number
          created_at: string
          description: string | null
          extra_person_ar: number | null
          hot_water: boolean
          id: string
          max_adults: number | null
          max_children: number | null
          name: string
          page_id: string
          photos: string[]
          price_unit: string
          private_bath: boolean
          releve_le: string | null
          sort_order: number
          status: string
          surface_m2: number | null
          units_count: number
          view: string | null
        }
        Insert: {
          base_price_ar: number
          created_at?: string
          description?: string | null
          extra_person_ar?: number | null
          hot_water?: boolean
          id?: string
          max_adults?: number | null
          max_children?: number | null
          name: string
          page_id: string
          photos?: string[]
          price_unit?: string
          private_bath?: boolean
          releve_le?: string | null
          sort_order?: number
          status?: string
          surface_m2?: number | null
          units_count?: number
          view?: string | null
        }
        Update: {
          base_price_ar?: number
          created_at?: string
          description?: string | null
          extra_person_ar?: number | null
          hot_water?: boolean
          id?: string
          max_adults?: number | null
          max_children?: number | null
          name?: string
          page_id?: string
          photos?: string[]
          price_unit?: string
          private_bath?: boolean
          releve_le?: string | null
          sort_order?: number
          status?: string
          surface_m2?: number | null
          units_count?: number
          view?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_types_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      saves: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saves_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      season_rates: {
        Row: {
          board: string | null
          checked_at: string
          from_date: string | null
          id: string
          min_nights: number
          price_ar: number
          price_unit: string
          resident_price_ar: number | null
          room_type_id: string
          season_label: string
          to_date: string | null
        }
        Insert: {
          board?: string | null
          checked_at?: string
          from_date?: string | null
          id?: string
          min_nights?: number
          price_ar: number
          price_unit?: string
          resident_price_ar?: number | null
          room_type_id: string
          season_label?: string
          to_date?: string | null
        }
        Update: {
          board?: string | null
          checked_at?: string
          from_date?: string | null
          id?: string
          min_nights?: number
          price_ar?: number
          price_unit?: string
          resident_price_ar?: number | null
          room_type_id?: string
          season_label?: string
          to_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "season_rates_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_days: {
        Row: {
          detail: string | null
          jour: number
          nuitee: string | null
          place_id: string | null
          titre: string
          tour_id: string
        }
        Insert: {
          detail?: string | null
          jour: number
          nuitee?: string | null
          place_id?: string | null
          titre: string
          tour_id: string
        }
        Update: {
          detail?: string | null
          jour?: number
          nuitee?: string | null
          place_id?: string | null
          titre?: string
          tour_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_days_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_days_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_departures: {
        Row: {
          created_at: string
          guaranteed: boolean
          id: string
          seats_left: number | null
          seats_total: number | null
          starts_on: string
          tour_id: string
        }
        Insert: {
          created_at?: string
          guaranteed?: boolean
          id?: string
          seats_left?: number | null
          seats_total?: number | null
          starts_on: string
          tour_id: string
        }
        Update: {
          created_at?: string
          guaranteed?: boolean
          id?: string
          seats_left?: number | null
          seats_total?: number | null
          starts_on?: string
          tour_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_departures_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_inclusions: {
        Row: {
          id: string
          inclus: boolean
          libelle: string
          sort_order: number
          tour_id: string
        }
        Insert: {
          id?: string
          inclus?: boolean
          libelle: string
          sort_order?: number
          tour_id: string
        }
        Update: {
          id?: string
          inclus?: boolean
          libelle?: string
          sort_order?: number
          tour_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_inclusions_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_prices: {
        Row: {
          base_pax: number
          id: string
          price_ar: number
          price_unit: string
          tour_id: string
        }
        Insert: {
          base_pax: number
          id?: string
          price_ar: number
          price_unit?: string
          tour_id: string
        }
        Update: {
          base_pax?: number
          id?: string
          price_ar?: number
          price_unit?: string
          tour_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_prices_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tours: {
        Row: {
          axe: string | null
          created_at: string
          description: string | null
          difficulty: string | null
          duration_days: number
          duration_nights: number | null
          end_place_id: string | null
          format: string | null
          group_max: number | null
          group_min: number | null
          guide_langs: string[]
          id: string
          months_open: number[] | null
          norm: string | null
          page_id: string
          parks_included: boolean
          photos: string[]
          slug: string
          start_place_id: string | null
          summary: string | null
          title: string
          transports: string[]
        }
        Insert: {
          axe?: string | null
          created_at?: string
          description?: string | null
          difficulty?: string | null
          duration_days: number
          duration_nights?: number | null
          end_place_id?: string | null
          format?: string | null
          group_max?: number | null
          group_min?: number | null
          guide_langs?: string[]
          id?: string
          months_open?: number[] | null
          norm?: string | null
          page_id: string
          parks_included?: boolean
          photos?: string[]
          slug: string
          start_place_id?: string | null
          summary?: string | null
          title: string
          transports?: string[]
        }
        Update: {
          axe?: string | null
          created_at?: string
          description?: string | null
          difficulty?: string | null
          duration_days?: number
          duration_nights?: number | null
          end_place_id?: string | null
          format?: string | null
          group_max?: number | null
          group_min?: number | null
          guide_langs?: string[]
          id?: string
          months_open?: number[] | null
          norm?: string | null
          page_id?: string
          parks_included?: boolean
          photos?: string[]
          slug?: string
          start_place_id?: string | null
          summary?: string | null
          title?: string
          transports?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "tours_end_place_id_fkey"
            columns: ["end_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_start_place_id_fkey"
            columns: ["start_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_offers: {
        Row: {
          author_id: string
          body: string | null
          created_at: string
          excludes: string[]
          id: string
          includes: string[]
          page_id: string
          pax: number | null
          price_ar: number | null
          price_unit: string
          request_id: string
          status: string
          title: string
          valid_until: string | null
        }
        Insert: {
          author_id: string
          body?: string | null
          created_at?: string
          excludes?: string[]
          id?: string
          includes?: string[]
          page_id: string
          pax?: number | null
          price_ar?: number | null
          price_unit?: string
          request_id: string
          status?: string
          title: string
          valid_until?: string | null
        }
        Update: {
          author_id?: string
          body?: string | null
          created_at?: string
          excludes?: string[]
          id?: string
          includes?: string[]
          page_id?: string
          pax?: number | null
          price_ar?: number | null
          price_unit?: string
          request_id?: string
          status?: string
          title?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_offers_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_offers_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "trip_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_requests: {
        Row: {
          adults: number
          attraction_ids: string[]
          budget_ar: number | null
          budget_eur: number | null
          children_ages: number[]
          closed_at: string | null
          created_at: string
          date_flex_days: number | null
          date_from: string | null
          date_to: string | null
          dish_ids: string[]
          envies: string[]
          expire_le: string | null
          id: string
          motif_cloture: string | null
          notes: string | null
          place_ids: string[]
          status: string
          user_id: string
        }
        Insert: {
          adults?: number
          attraction_ids?: string[]
          budget_ar?: number | null
          budget_eur?: number | null
          children_ages?: number[]
          closed_at?: string | null
          created_at?: string
          date_flex_days?: number | null
          date_from?: string | null
          date_to?: string | null
          dish_ids?: string[]
          envies?: string[]
          expire_le?: string | null
          id?: string
          motif_cloture?: string | null
          notes?: string | null
          place_ids?: string[]
          status?: string
          user_id: string
        }
        Update: {
          adults?: number
          attraction_ids?: string[]
          budget_ar?: number | null
          budget_eur?: number | null
          children_ages?: number[]
          closed_at?: string | null
          created_at?: string
          date_flex_days?: number | null
          date_from?: string | null
          date_to?: string | null
          dish_ids?: string[]
          envies?: string[]
          expire_le?: string | null
          id?: string
          motif_cloture?: string | null
          notes?: string | null
          place_ids?: string[]
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          granted_at: string
          role: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          role: string
          user_id: string
        }
        Update: {
          granted_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      sites_localises: {
        Row: {
          a_une_description: boolean | null
          a_une_photo: boolean | null
          best_months: number[] | null
          complet: boolean | null
          cover_credit: string | null
          cover_url: string | null
          etat_route: string | null
          fady_n: number | null
          grande_region: string | null
          guide_obligatoire: boolean | null
          id: string | null
          kind: string | null
          km_ville: number | null
          nom: string | null
          ordre: string | null
          region_nom: string | null
          region_slug: string | null
          resume: string | null
          slug: string | null
          tarif_non_resident_ar: number | null
          tarif_resident_ar: number | null
          ville_nom: string | null
          ville_slug: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accepter_revendication: { Args: { p_claim: string }; Returns: undefined }
      agent_chercher: {
        Args: {
          p_budget_max?: number
          p_budget_min?: number
          p_categorie?: string
          p_cuisines?: string[]
          p_equipements?: string[]
          p_lieu?: string
          p_limite?: number
          p_personnes?: number
          p_plat?: string
        }
        Returns: Json
      }
      agent_rate_hit: {
        Args: { p_cle: string; p_max?: number }
        Returns: boolean
      }
      autour_de_moi: {
        Args: {
          p_categorie?: string
          p_lat: number
          p_limite?: number
          p_lng: number
          p_rayon_km?: number
        }
        Returns: {
          categories: string[]
          completeness: number
          cover_url: string
          distance_km: number
          id: string
          landmark: string
          name: string
          phone: string
          place_name: string
          price_min_ar: number
          price_min_unit: string
          rating_avg: number
          rating_count: number
          short_desc: string
          slug: string
        }[]
      }
      booking_avancer: {
        Args: { p_id: string; p_statut: string }
        Returns: string
      }
      carte_grappes: {
        Args: {
          p_categorie?: string
          p_est: number
          p_nord: number
          p_ouest: number
          p_pas: number
          p_sud: number
        }
        Returns: {
          exemple: string
          lat: number
          lng: number
          n: number
          n_sites: number
          total_zone: number
        }[]
      }
      carte_zone: {
        Args: {
          p_categorie?: string
          p_est: number
          p_limite?: number
          p_nord: number
          p_ouest: number
          p_sud: number
          p_types?: string[]
        }
        Returns: {
          categories: string[]
          cover_url: string
          genre: string
          id: string
          lat: number
          lng: number
          name: string
          place_name: string
          precision_geo: string
          price_min_ar: number
          price_min_unit: string
          rating_avg: number
          rating_count: number
          slug: string
          total_zone: number
        }[]
      }
      chercher_etablissements_par_nom: {
        Args: { p_limite?: number; p_terme: string }
        Returns: {
          categories: string[]
          deja_revendique: boolean
          lieu_nom: string
          nom: string
          place_id: string
          repere: string
          slug: string
          sous_categorie: string
        }[]
      }
      chercher_lieux: {
        Args: { p_limite?: number; p_q: string }
        Returns: {
          district: string
          id: string
          kind: string
          nb_pages: number
          nom: string
          region: string
          slug: string
          touristique: boolean
          via_alias: string
        }[]
      }
      chercher_pages: {
        Args: {
          p_categorie?: string
          p_curseur_id?: string
          p_curseur_score?: number
          p_equipements?: string[]
          p_lieu?: string
          p_limite?: number
          p_plat?: string
          p_prix_max?: number
        }
        Returns: {
          categories: string[]
          completeness: number
          cover_url: string
          id: string
          landmark: string
          lat: number
          lng: number
          name: string
          place_name: string
          place_slug: string
          precision_geo: string
          price_min_ar: number
          price_min_unit: string
          prix_du_plat: number
          rating_avg: number
          rating_count: number
          short_desc: string
          slug: string
          verification_status: string
        }[]
      }
      compter_sites: {
        Args: never
        Returns: {
          kind: string
          n: number
        }[]
      }
      devenir_pro: { Args: { p_metier: string }; Returns: undefined }
      distance_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      dk_admin_membres: {
        Args: {
          p_curseur_date?: string
          p_curseur_id?: string
          p_limite?: number
          p_recherche?: string
        }
        Returns: {
          account_type: string
          avatar_url: string
          created_at: string
          display_name: string
          email: string
          followers_count: number
          id: string
          posts_count: number
          roles: string[]
          verification: string
        }[]
      }
      dk_admin_moderer_publication: {
        Args: { p_action: string; p_motif?: string; p_post: string }
        Returns: string
      }
      dk_admin_photos: {
        Args: {
          p_curseur_date?: string
          p_curseur_id?: string
          p_limite?: number
          p_statut?: string
        }
        Returns: {
          cible_id: string
          cible_lien: string
          cible_nom: string
          cible_type: string
          created_at: string
          credit: string
          hauteur: number
          id: string
          largeur: number
          legende: string
          motif_refus: string
          proposeur_avatar: string
          proposeur_id: string
          proposeur_nom: string
          statut: string
          url: string
        }[]
      }
      dk_admin_poser_photo: {
        Args: {
          p_cible: string
          p_cible_type: string
          p_credit?: string
          p_hauteur?: number
          p_largeur?: number
          p_legende?: string
          p_url: string
        }
        Returns: string
      }
      dk_admin_promo_enregistrer: {
        Args: {
          p_actif?: boolean
          p_avantage?: string
          p_code?: string
          p_debut?: string
          p_detail?: string
          p_fin?: string
          p_id?: string
          p_libelle?: string
          p_page?: string
        }
        Returns: string
      }
      dk_admin_promo_supprimer: { Args: { p_id: string }; Returns: boolean }
      dk_admin_promos: {
        Args: never
        Returns: {
          actif: boolean
          avantage: string
          code: string
          created_at: string
          debut: string
          detail: string
          fin: string
          id: string
          libelle: string
          page_id: string
          page_nom: string
        }[]
      }
      dk_admin_publications: {
        Args: {
          p_curseur_date?: string
          p_curseur_id?: string
          p_limite?: number
          p_statut?: string
        }
        Returns: {
          auteur_avatar: string
          auteur_id: string
          auteur_nom: string
          body: string
          created_at: string
          id: string
          kind: string
          media: Json
          motifs: string[]
          nb_signalements: number
          status: string
        }[]
      }
      dk_admin_role: {
        Args: { p_accorder: boolean; p_membre: string }
        Returns: boolean
      }
      dk_admin_statistiques: { Args: never; Returns: Json }
      dk_admin_traiter_photo: {
        Args: { p_action: string; p_motif?: string; p_proposition: string }
        Returns: string
      }
      dk_compte_proprietaire: { Args: never; Returns: boolean }
      dk_grande_region: { Args: { p_region: string }; Returns: string }
      dk_kinds_envie: { Args: { p_envie: string }; Returns: string[] }
      dk_libelle_type: { Args: { p_kind: string }; Returns: string }
      dk_norm: { Args: { t: string }; Returns: string }
      dk_photo_cible_lien: {
        Args: { p_cible: string; p_cible_type: string }
        Returns: string
      }
      dk_photo_cible_nom: {
        Args: { p_cible: string; p_cible_type: string }
        Returns: string
      }
      dk_poser_photo: {
        Args: {
          p_cible: string
          p_cible_type: string
          p_credit: string
          p_url: string
        }
        Returns: boolean
      }
      dk_proposer_photo: {
        Args: {
          p_cible: string
          p_cible_type: string
          p_hauteur?: number
          p_largeur?: number
          p_legende?: string
          p_url: string
        }
        Returns: string
      }
      dk_rattacher_villes: { Args: never; Returns: number }
      dk_trajet_adresses: {
        Args: { p_categorie: string; p_n: number; p_place: string }
        Returns: Json
      }
      explorer_region: { Args: { p_slug: string }; Returns: Json }
      explorer_regions: { Args: never; Returns: Json }
      explorer_ville: { Args: { p_slug: string }; Returns: Json }
      feed_filtre: {
        Args: {
          p_apres_km?: number
          p_curseur?: string
          p_lat?: number
          p_limite?: number
          p_lng?: number
          p_mode?: string
        }
        Returns: Json
      }
      fiche_destination: { Args: { p_slug: string }; Returns: Json }
      fiche_plat: { Args: { p_slug: string }; Returns: Json }
      fil_modes_disponibles: { Args: never; Returns: Json }
      get_feed: {
        Args: { p_curseur?: string; p_limite?: number }
        Returns: Json
      }
      get_page_by_slug: { Args: { p_slug: string }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      itineraire_axe: {
        Args: { p_axe: string; p_depuis?: string }
        Returns: Json
      }
      lieu_et_descendants: {
        Args: { p_place: string }
        Returns: {
          id: string
        }[]
      }
      lieu_le_plus_proche: {
        Args: { p_lat: number; p_lng: number }
        Returns: Json
      }
      maj_prix_page: { Args: { p: string }; Returns: undefined }
      marquer_conversation_lue: { Args: { p_conv: string }; Returns: number }
      mes_etablissements: {
        Args: { p_limite?: number }
        Returns: {
          categories: string[]
          completeness: number
          cover_url: string
          id: string
          is_published: boolean
          mon_role: string
          name: string
          price_min_ar: number
          price_min_unit: string
          rating_avg: number
          rating_count: number
          slug: string
          views_count: number
        }[]
      }
      mes_etablissements_gardes: {
        Args: { p_limite?: number }
        Returns: {
          categories: string[]
          cover_url: string
          garde_le: string
          id: string
          landmark: string
          name: string
          note: string
          phone: string
          place_name: string
          price_min_ar: number
          price_min_unit: string
          rating_avg: number
          rating_count: number
          short_desc: string
          slug: string
        }[]
      }
      mes_publications: {
        Args: { p_curseur?: string; p_kind?: string; p_limite?: number }
        Returns: Json
      }
      mes_publications_aimees: { Args: { p_limite?: number }; Returns: Json }
      messages_non_lus: { Args: never; Returns: number }
      mon_activite: { Args: never; Returns: Json }
      mon_profil: {
        Args: never
        Returns: {
          account_type: string
          avatar_url: string
          display_name: string
          email: string
          id: string
          phone: string
          verification: string
        }[]
      }
      notifier: {
        Args: {
          p_data?: Json
          p_message: string
          p_titre: string
          p_type: string
          p_user: string
        }
        Returns: undefined
      }
      ouvrir_conversation: { Args: { p_autre: string }; Returns: string }
      ouvrir_conversation_page: { Args: { p_page: string }; Returns: string }
      page_a_moi: { Args: { p: string }; Returns: boolean }
      page_de_la_chambre: { Args: { r: string }; Returns: string }
      page_du_circuit: { Args: { t: string }; Returns: string }
      page_publiee: { Args: { p: string }; Returns: boolean }
      pages_carte: {
        Args: { p_categorie?: string; p_limite?: number }
        Returns: {
          categories: string[]
          cover_url: string
          geo_source: string
          id: string
          lat: number
          lng: number
          name: string
          place_name: string
          precision_geo: string
          price_min_ar: number
          price_min_unit: string
          rating_avg: number
          rating_count: number
          slug: string
        }[]
      }
      profil_expose: { Args: { p: string }; Returns: boolean }
      profil_public: { Args: { p_id: string }; Returns: Json }
      projet_choix: { Args: { p_id: string; p_refs: Json }; Returns: undefined }
      projet_choix_lus: { Args: { p_id: string }; Returns: Json }
      projet_prolonger: {
        Args: { p_id: string; p_jours?: number }
        Returns: string
      }
      projet_statut: {
        Args: { p_id: string; p_motif?: string; p_statut: string }
        Returns: undefined
      }
      projet_statut_effectif: {
        Args: { p_expire: string; p_status: string }
        Returns: string
      }
      publications_publiques: {
        Args: { p_curseur?: string; p_id: string; p_limite?: number }
        Returns: Json
      }
      purger_journal_erreurs: { Args: never; Returns: number }
      quand_partir: { Args: never; Returns: Json }
      recits_en_vogue: {
        Args: { p_lat?: number; p_limite?: number; p_lng?: number }
        Returns: {
          avatar_url: string
          body: string
          comments_count: number
          created_at: string
          dish: string
          display_name: string
          id: string
          media: Json
          place: string
          reactions_count: number
          saves_count: number
          score: number
          vues: number
        }[]
      }
      resoudre_lieu: {
        Args: { p_limite?: number; p_terme: string }
        Returns: {
          id: string
          kind: string
          name_fr: string
          region: string
          score: number
          slug: string
        }[]
      }
      resoudre_plat: {
        Args: { p_limite?: number; p_terme: string }
        Returns: {
          family: string
          id: string
          name_fr: string
          score: number
          slug: string
        }[]
      }
      restaurants_par_plat: {
        Args: { p_lieu?: string; p_limite?: number; p_plat: string }
        Returns: {
          cover_url: string
          is_signature: boolean
          landmark: string
          nom_sur_la_carte: string
          page_id: string
          page_name: string
          page_slug: string
          place_name: string
          price_ar: number
          price_unit: string
          rating_avg: number
          rating_count: number
        }[]
      }
      revendiquer_page: {
        Args: {
          p_message: string
          p_nif?: string
          p_page: string
          p_photo_lieu?: string
          p_piece?: string
          p_role?: string
          p_stat?: string
          p_tel: string
        }
        Returns: string
      }
      saison_du_mois: {
        Args: { p_limite?: number; p_mois?: number }
        Returns: {
          nom: string
          note: string
          raison: string
          region: string
          slug: string
        }[]
      }
      saison_en_cours: {
        Args: { p_mois?: number }
        Returns: {
          confiance: string
          description: string
          genre: string
          lieu: string
          periode: string
          recurrent: boolean
          region: string
          slug: string
          source: string
          titre: string
        }[]
      }
      sites_de_la_region: {
        Args: {
          p_curseur?: string
          p_limite?: number
          p_region: string
          p_sans_guide?: boolean
          p_types?: string[]
          p_ville?: string
        }
        Returns: Json
      }
      sites_par_region: { Args: never; Returns: Json }
      stats_diako: { Args: never; Returns: Json }
      suggerer: { Args: { p_limite?: number; p_terme: string }; Returns: Json }
      suggestions_envie: {
        Args: {
          p_curseur?: string
          p_envie: string
          p_limite?: number
          p_q?: string
          p_region?: string
        }
        Returns: Json
      }
      trajet_etapes: {
        Args: { p_par_lieu?: number; p_slugs: string[] }
        Returns: Json
      }
      trajet_referentiel: { Args: never; Returns: Json }
      trajets_depuis: { Args: { p_lieu: string }; Returns: Json }
      y_aller: { Args: never; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
