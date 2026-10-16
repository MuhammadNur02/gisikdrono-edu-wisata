export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      booking_addons: {
        Row: {
          booking_id: string
          created_at: string
          fulfillment_status: Database["public"]["Enums"]["addon_fulfillment_status"]
          id: string
          line_total: number
          notes: string | null
          product_id: string
          product_name_snapshot: string
          qty: number
          rw_id: number
          unit_price: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          fulfillment_status?: Database["public"]["Enums"]["addon_fulfillment_status"]
          id?: string
          line_total: number
          notes?: string | null
          product_id: string
          product_name_snapshot: string
          qty: number
          rw_id: number
          unit_price: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          fulfillment_status?: Database["public"]["Enums"]["addon_fulfillment_status"]
          id?: string
          line_total?: number
          notes?: string | null
          product_id?: string
          product_name_snapshot?: string
          qty?: number
          rw_id?: number
          unit_price?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_addons_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_umkm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_addons_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_addons_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "umkm_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          booking_id: string
          from_status: Database["public"]["Enums"]["booking_status"] | null
          id: number
          occurred_at: string
          payload: Json
          reason: string | null
          to_status: Database["public"]["Enums"]["booking_status"]
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          booking_id: string
          from_status?: Database["public"]["Enums"]["booking_status"] | null
          id?: never
          occurred_at?: string
          payload?: Json
          reason?: string | null
          to_status: Database["public"]["Enums"]["booking_status"]
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          booking_id?: string
          from_status?: Database["public"]["Enums"]["booking_status"] | null
          id?: never
          occurred_at?: string
          payload?: Json
          reason?: string | null
          to_status?: Database["public"]["Enums"]["booking_status"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_legs: {
        Row: {
          booking_id: string
          checked_in_at: string | null
          id: string
          leg_order: number
          pax_count: number
          quota_released_at: string | null
          quota_reserved_at: string | null
          rw_id: number
          status: Database["public"]["Enums"]["booking_leg_status"]
          visit_session_id: string
        }
        Insert: {
          booking_id: string
          checked_in_at?: string | null
          id?: string
          leg_order: number
          pax_count: number
          quota_released_at?: string | null
          quota_reserved_at?: string | null
          rw_id: number
          status?: Database["public"]["Enums"]["booking_leg_status"]
          visit_session_id: string
        }
        Update: {
          booking_id?: string
          checked_in_at?: string | null
          id?: string
          leg_order?: number
          pax_count?: number
          quota_released_at?: string | null
          quota_reserved_at?: string | null
          rw_id?: number
          status?: Database["public"]["Enums"]["booking_leg_status"]
          visit_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_legs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_legs_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_legs_visit_session_id_fkey"
            columns: ["visit_session_id"]
            isOneToOne: false
            referencedRelation: "visit_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_participants: {
        Row: {
          booking_id: string
          created_at: string
          full_name: string
          group_label: string | null
          id: string
          role_label: string | null
          seq_no: number
          updated_at: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          full_name: string
          group_label?: string | null
          id?: string
          role_label?: string | null
          seq_no: number
          updated_at?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          full_name?: string
          group_label?: string | null
          id?: string
          role_label?: string | null
          seq_no?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_participants_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          admin_notes: string | null
          amount_paid: number
          booker_type: Database["public"]["Enums"]["booker_type"]
          booking_code: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          channel: Database["public"]["Enums"]["booking_channel"]
          checked_in_at: string | null
          completed_at: string | null
          consent_version: string
          consented_at: string
          created_at: string
          created_by: string | null
          currency: string
          discount_amount: number
          discount_note: string | null
          email_verified_at: string | null
          expired_at: string | null
          expires_at: string | null
          id: string
          idempotency_key: string | null
          institution_name: string | null
          needs_review: boolean
          notes: string | null
          package_id: string
          package_snapshot: Json
          paid_at: string | null
          pax_count: number
          phone_verified_at: string | null
          pic_email: string
          pic_name: string
          pic_phone: string
          quoted_at: string | null
          refunded_at: string | null
          review_reason: string | null
          rw_ids: number[]
          source_ip: unknown
          status: Database["public"]["Enums"]["booking_status"]
          subtotal_addons: number
          subtotal_package: number
          ticket_pdf_path: string | null
          token_version: number
          total_amount: number
          updated_at: string
          user_agent: string | null
          visit_date: string
          visit_date_end: string
        }
        Insert: {
          admin_notes?: string | null
          amount_paid?: number
          booker_type: Database["public"]["Enums"]["booker_type"]
          booking_code: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          channel?: Database["public"]["Enums"]["booking_channel"]
          checked_in_at?: string | null
          completed_at?: string | null
          consent_version: string
          consented_at: string
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_amount?: number
          discount_note?: string | null
          email_verified_at?: string | null
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          institution_name?: string | null
          needs_review?: boolean
          notes?: string | null
          package_id: string
          package_snapshot: Json
          paid_at?: string | null
          pax_count: number
          phone_verified_at?: string | null
          pic_email: string
          pic_name: string
          pic_phone: string
          quoted_at?: string | null
          refunded_at?: string | null
          review_reason?: string | null
          rw_ids: number[]
          source_ip?: unknown
          status: Database["public"]["Enums"]["booking_status"]
          subtotal_addons?: number
          subtotal_package: number
          ticket_pdf_path?: string | null
          token_version?: number
          total_amount: number
          updated_at?: string
          user_agent?: string | null
          visit_date: string
          visit_date_end: string
        }
        Update: {
          admin_notes?: string | null
          amount_paid?: number
          booker_type?: Database["public"]["Enums"]["booker_type"]
          booking_code?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          channel?: Database["public"]["Enums"]["booking_channel"]
          checked_in_at?: string | null
          completed_at?: string | null
          consent_version?: string
          consented_at?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_amount?: number
          discount_note?: string | null
          email_verified_at?: string | null
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          institution_name?: string | null
          needs_review?: boolean
          notes?: string | null
          package_id?: string
          package_snapshot?: Json
          paid_at?: string | null
          pax_count?: number
          phone_verified_at?: string | null
          pic_email?: string
          pic_name?: string
          pic_phone?: string
          quoted_at?: string | null
          refunded_at?: string | null
          review_reason?: string | null
          rw_ids?: number[]
          source_ip?: unknown
          status?: Database["public"]["Enums"]["booking_status"]
          subtotal_addons?: number
          subtotal_package?: number
          ticket_pdf_path?: string | null
          token_version?: number
          total_amount?: number
          updated_at?: string
          user_agent?: string | null
          visit_date?: string
          visit_date_end?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "tour_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_otps: {
        Row: {
          attempts: number
          booking_id: string | null
          code_hash: string
          consumed_at: string | null
          created_at: string
          email: string | null
          expires_at: string
          id: string
          ip: unknown
          max_attempts: number
          phone: string | null
          purpose: Database["public"]["Enums"]["otp_purpose"]
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          booking_id?: string | null
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          email?: string | null
          expires_at: string
          id?: string
          ip?: unknown
          max_attempts?: number
          phone?: string | null
          purpose: Database["public"]["Enums"]["otp_purpose"]
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          booking_id?: string | null
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          ip?: unknown
          max_attempts?: number
          phone?: string | null
          purpose?: Database["public"]["Enums"]["otp_purpose"]
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_otps_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      package_price_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: number
          new_flat_price: number | null
          new_price_per_pax: number | null
          old_flat_price: number | null
          old_price_per_pax: number | null
          package_id: string
          reason: string | null
          tier_id: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_flat_price?: number | null
          new_price_per_pax?: number | null
          old_flat_price?: number | null
          old_price_per_pax?: number | null
          package_id: string
          reason?: string | null
          tier_id?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_flat_price?: number | null
          new_price_per_pax?: number | null
          old_flat_price?: number | null
          old_price_per_pax?: number | null
          package_id?: string
          reason?: string | null
          tier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "package_price_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_price_history_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "tour_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_price_history_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "tour_package_price_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      products_umkm: {
        Row: {
          category: Database["public"]["Enums"]["product_category"]
          created_at: string
          created_by: string | null
          description_md: string | null
          id: string
          image_paths: string[]
          is_addon_eligible: boolean
          is_available: boolean
          is_featured: boolean
          lead_time_days: number
          max_order_qty: number | null
          min_order_qty: number
          name: string
          price: number
          rw_id: number
          slug: string
          sort_order: number
          status: Database["public"]["Enums"]["content_status"]
          unit_label: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["product_category"]
          created_at?: string
          created_by?: string | null
          description_md?: string | null
          id?: string
          image_paths?: string[]
          is_addon_eligible?: boolean
          is_available?: boolean
          is_featured?: boolean
          lead_time_days?: number
          max_order_qty?: number | null
          min_order_qty?: number
          name: string
          price: number
          rw_id: number
          slug: string
          sort_order?: number
          status?: Database["public"]["Enums"]["content_status"]
          unit_label?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["product_category"]
          created_at?: string
          created_by?: string | null
          description_md?: string | null
          id?: string
          image_paths?: string[]
          is_addon_eligible?: boolean
          is_available?: boolean
          is_featured?: boolean
          lead_time_days?: number
          max_order_qty?: number | null
          min_order_qty?: number
          name?: string
          price?: number
          rw_id?: number
          slug?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["content_status"]
          unit_label?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_umkm_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_umkm_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_umkm_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "umkm_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          claims_version: number
          created_at: string
          created_by: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          mfa_required: boolean
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          rw_id: number | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          claims_version?: number
          created_at?: string
          created_by?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean
          last_login_at?: string | null
          mfa_required?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          rw_id?: number | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          claims_version?: number
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          mfa_required?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          rw_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
        ]
      }
      rw_units: {
        Row: {
          code: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          description_md: string | null
          hero_image_path: string | null
          id: number
          is_active: boolean
          map_lat: number | null
          map_lng: number | null
          name: string
          slug: string
          sort_order: number
          tagline: string | null
          theme_label: string
          treasury_account_holder: string | null
          treasury_account_number: string | null
          treasury_bank_name: string | null
          updated_at: string
          vision_md: string | null
        }
        Insert: {
          code: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          description_md?: string | null
          hero_image_path?: string | null
          id: number
          is_active?: boolean
          map_lat?: number | null
          map_lng?: number | null
          name: string
          slug: string
          sort_order?: number
          tagline?: string | null
          theme_label: string
          treasury_account_holder?: string | null
          treasury_account_number?: string | null
          treasury_bank_name?: string | null
          updated_at?: string
          vision_md?: string | null
        }
        Update: {
          code?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          description_md?: string | null
          hero_image_path?: string | null
          id?: number
          is_active?: boolean
          map_lat?: number | null
          map_lng?: number | null
          name?: string
          slug?: string
          sort_order?: number
          tagline?: string | null
          theme_label?: string
          treasury_account_holder?: string | null
          treasury_account_number?: string | null
          treasury_bank_name?: string | null
          updated_at?: string
          vision_md?: string | null
        }
        Relationships: []
      }
      session_templates: {
        Row: {
          capacity: number
          created_at: string
          end_time: string
          id: string
          is_active: boolean
          label: string
          rw_id: number
          start_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          capacity: number
          created_at?: string
          end_time: string
          id?: string
          is_active?: boolean
          label: string
          rw_id: number
          start_time: string
          updated_at?: string
          weekday: number
        }
        Update: {
          capacity?: number
          created_at?: string
          end_time?: string
          id?: string
          is_active?: boolean
          label?: string
          rw_id?: number
          start_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "session_templates_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          description: string | null
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "site_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invites: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          created_by: string
          email: string
          expires_at: string
          id: string
          invite_code_hash: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          rw_id: number | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          created_by: string
          email: string
          expires_at: string
          id?: string
          invite_code_hash: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["app_role"]
          rw_id?: number | null
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          created_by?: string
          email?: string
          expires_at?: string
          id?: string
          invite_code_hash?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          rw_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_invites_accepted_user_id_fkey"
            columns: ["accepted_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invites_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_package_legs: {
        Row: {
          duration_minutes: number | null
          id: string
          leg_order: number
          notes: string | null
          package_id: string
          rw_id: number
        }
        Insert: {
          duration_minutes?: number | null
          id?: string
          leg_order: number
          notes?: string | null
          package_id: string
          rw_id: number
        }
        Update: {
          duration_minutes?: number | null
          id?: string
          leg_order?: number
          notes?: string | null
          package_id?: string
          rw_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tour_package_legs_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "tour_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_package_legs_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_package_price_tiers: {
        Row: {
          id: string
          max_pax: number | null
          min_pax: number
          package_id: string
          price_per_pax: number
        }
        Insert: {
          id?: string
          max_pax?: number | null
          min_pax: number
          package_id: string
          price_per_pax: number
        }
        Update: {
          id?: string
          max_pax?: number | null
          min_pax?: number
          package_id?: string
          price_per_pax?: number
        }
        Relationships: [
          {
            foreignKeyName: "tour_package_price_tiers_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "tour_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_packages: {
        Row: {
          category: Database["public"]["Enums"]["package_category"]
          created_at: string
          created_by: string | null
          description_md: string | null
          duration_minutes: number | null
          flat_price: number | null
          highlights: string[]
          id: string
          image_paths: string[]
          inclusions: string[]
          is_featured: boolean
          itinerary: Json
          max_pax: number
          min_pax: number
          name: string
          price_per_pax: number | null
          pricing_basis: Database["public"]["Enums"]["pricing_basis"]
          rw_id: number | null
          slug: string
          sort_order: number
          status: Database["public"]["Enums"]["content_status"]
          tagline: string | null
          updated_at: string
          updated_by: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["package_category"]
          created_at?: string
          created_by?: string | null
          description_md?: string | null
          duration_minutes?: number | null
          flat_price?: number | null
          highlights?: string[]
          id?: string
          image_paths?: string[]
          inclusions?: string[]
          is_featured?: boolean
          itinerary?: Json
          max_pax?: number
          min_pax?: number
          name: string
          price_per_pax?: number | null
          pricing_basis?: Database["public"]["Enums"]["pricing_basis"]
          rw_id?: number | null
          slug: string
          sort_order?: number
          status?: Database["public"]["Enums"]["content_status"]
          tagline?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["package_category"]
          created_at?: string
          created_by?: string | null
          description_md?: string | null
          duration_minutes?: number | null
          flat_price?: number | null
          highlights?: string[]
          id?: string
          image_paths?: string[]
          inclusions?: string[]
          is_featured?: boolean
          itinerary?: Json
          max_pax?: number
          min_pax?: number
          name?: string
          price_per_pax?: number | null
          pricing_basis?: Database["public"]["Enums"]["pricing_basis"]
          rw_id?: number | null
          slug?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["content_status"]
          tagline?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_packages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_packages_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_packages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      umkm_vendors: {
        Row: {
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_name: string | null
          created_at: string
          created_by: string | null
          description_md: string | null
          id: string
          is_active: boolean
          logo_path: string | null
          name: string
          owner_name: string | null
          phone: string | null
          rw_id: number
          slug: string
          updated_at: string
        }
        Insert: {
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          description_md?: string | null
          id?: string
          is_active?: boolean
          logo_path?: string | null
          name: string
          owner_name?: string | null
          phone?: string | null
          rw_id: number
          slug: string
          updated_at?: string
        }
        Update: {
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          description_md?: string | null
          id?: string
          is_active?: boolean
          logo_path?: string | null
          name?: string
          owner_name?: string | null
          phone?: string | null
          rw_id?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "umkm_vendors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "umkm_vendors_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_sessions: {
        Row: {
          capacity: number
          checked_in_pax: number
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          label: string
          notes: string | null
          reserved_pax: number
          rw_id: number
          session_date: string
          start_time: string
          status: Database["public"]["Enums"]["session_status"]
          template_id: string | null
          updated_at: string
        }
        Insert: {
          capacity: number
          checked_in_pax?: number
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          label: string
          notes?: string | null
          reserved_pax?: number
          rw_id: number
          session_date: string
          start_time: string
          status?: Database["public"]["Enums"]["session_status"]
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          capacity?: number
          checked_in_pax?: number
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          label?: string
          notes?: string | null
          reserved_pax?: number
          rw_id?: number
          session_date?: string
          start_time?: string
          status?: Database["public"]["Enums"]["session_status"]
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_sessions_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "session_templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      activity_point_type:
        | "bank_sampah"
        | "composter"
        | "maggot"
        | "urban_farming"
        | "pkk_craft"
        | "sanggar"
        | "culture_house"
        | "stage"
        | "dolanan_area"
        | "umkm_stall"
        | "meeting_point"
        | "other"
      addon_fulfillment_status:
        | "pending"
        | "prepared"
        | "handed_over"
        | "cancelled"
      adjustment_status: "proposed" | "approved" | "rejected" | "applied"
      adjustment_type:
        | "manual_mark_paid"
        | "manual_refund"
        | "write_off"
        | "reclassify_share"
        | "pax_correction"
      alert_severity: "info" | "medium" | "high" | "critical"
      app_role: "superadmin" | "admin_rw" | "none"
      article_category: "news" | "education" | "announcement"
      booker_type:
        | "individual"
        | "school"
        | "university"
        | "government"
        | "company"
        | "community"
        | "other"
      booking_channel: "web" | "admin"
      booking_leg_status: "unreserved" | "reserved" | "checked_in" | "released"
      booking_status:
        | "quoted"
        | "pending_payment"
        | "paid"
        | "checked_in"
        | "completed"
        | "no_show"
        | "expired"
        | "cancelled"
        | "refunded"
      booklet_kind: "ebooklet" | "visit_proposal" | "price_list"
      certificate_kind: "group" | "participant"
      certificate_status: "issued" | "revoked"
      content_status: "draft" | "pending_review" | "published" | "archived"
      document_kind:
        | "quotation"
        | "invoice"
        | "receipt"
        | "credit_note"
        | "certificate"
      export_kind: "visits" | "attendance" | "finance" | "audit"
      gallery_category: "activity" | "umkm" | "visit" | "event"
      invoice_status: "issued" | "paid" | "void"
      media_type: "image" | "video"
      notification_channel: "whatsapp" | "email"
      notification_status:
        | "queued"
        | "sending"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "cancelled"
      notification_template:
        | "phone_otp"
        | "booking_created"
        | "quotation_ready"
        | "payment_reminder"
        | "payment_received_ticket"
        | "booking_expired"
        | "booking_cancelled"
        | "visit_reminder_d1"
        | "checked_in_thanks"
        | "certificate_ready"
        | "review_invite"
        | "refund_processed"
        | "admin_new_paid_booking"
        | "admin_booking_needs_review"
        | "security_alert"
      otp_purpose: "booking_phone" | "dsr_identity"
      package_category: "regular" | "student" | "institutional" | "combo"
      payment_method: "qris" | "virtual_account" | "manual_transfer" | "cash"
      payment_provider: "midtrans" | "manual"
      payment_status:
        | "initiated"
        | "pending"
        | "needs_review"
        | "settled"
        | "denied"
        | "failed"
        | "cancelled"
        | "expired"
        | "refunded"
        | "partially_refunded"
        | "disputed"
        | "duplicate"
      pricing_basis: "per_pax" | "flat_group"
      product_category:
        | "compost"
        | "seedling"
        | "recycled_craft"
        | "snack"
        | "souvenir"
        | "other"
      quotation_status:
        | "issued"
        | "accepted"
        | "expired"
        | "superseded"
        | "void"
      revenue_beneficiary: "kelurahan" | "rw_treasury" | "umkm_vendor"
      revenue_entry_type: "settlement" | "reversal" | "adjustment"
      revenue_rule_scope:
        | "package_default"
        | "addon_default"
        | "package"
        | "product"
      review_status: "pending" | "published" | "rejected"
      scan_phase: "validate" | "check_in"
      scan_result:
        | "ok"
        | "invalid_signature"
        | "not_found"
        | "already_used"
        | "suspended"
        | "revoked"
        | "wrong_rw"
        | "wrong_date"
        | "outside_window"
        | "booking_not_paid"
        | "ticket_expired"
        | "forbidden"
      schedule_type:
        | "dance_performance"
        | "dolanan_session"
        | "workshop"
        | "art_class"
        | "other"
      session_status: "open" | "closed" | "cancelled"
      ticket_status: "issued" | "used" | "suspended" | "revoked" | "expired"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_point_type: [
        "bank_sampah",
        "composter",
        "maggot",
        "urban_farming",
        "pkk_craft",
        "sanggar",
        "culture_house",
        "stage",
        "dolanan_area",
        "umkm_stall",
        "meeting_point",
        "other",
      ],
      addon_fulfillment_status: [
        "pending",
        "prepared",
        "handed_over",
        "cancelled",
      ],
      adjustment_status: ["proposed", "approved", "rejected", "applied"],
      adjustment_type: [
        "manual_mark_paid",
        "manual_refund",
        "write_off",
        "reclassify_share",
        "pax_correction",
      ],
      alert_severity: ["info", "medium", "high", "critical"],
      app_role: ["superadmin", "admin_rw", "none"],
      article_category: ["news", "education", "announcement"],
      booker_type: [
        "individual",
        "school",
        "university",
        "government",
        "company",
        "community",
        "other",
      ],
      booking_channel: ["web", "admin"],
      booking_leg_status: ["unreserved", "reserved", "checked_in", "released"],
      booking_status: [
        "quoted",
        "pending_payment",
        "paid",
        "checked_in",
        "completed",
        "no_show",
        "expired",
        "cancelled",
        "refunded",
      ],
      booklet_kind: ["ebooklet", "visit_proposal", "price_list"],
      certificate_kind: ["group", "participant"],
      certificate_status: ["issued", "revoked"],
      content_status: ["draft", "pending_review", "published", "archived"],
      document_kind: [
        "quotation",
        "invoice",
        "receipt",
        "credit_note",
        "certificate",
      ],
      export_kind: ["visits", "attendance", "finance", "audit"],
      gallery_category: ["activity", "umkm", "visit", "event"],
      invoice_status: ["issued", "paid", "void"],
      media_type: ["image", "video"],
      notification_channel: ["whatsapp", "email"],
      notification_status: [
        "queued",
        "sending",
        "sent",
        "delivered",
        "read",
        "failed",
        "cancelled",
      ],
      notification_template: [
        "phone_otp",
        "booking_created",
        "quotation_ready",
        "payment_reminder",
        "payment_received_ticket",
        "booking_expired",
        "booking_cancelled",
        "visit_reminder_d1",
        "checked_in_thanks",
        "certificate_ready",
        "review_invite",
        "refund_processed",
        "admin_new_paid_booking",
        "admin_booking_needs_review",
        "security_alert",
      ],
      otp_purpose: ["booking_phone", "dsr_identity"],
      package_category: ["regular", "student", "institutional", "combo"],
      payment_method: ["qris", "virtual_account", "manual_transfer", "cash"],
      payment_provider: ["midtrans", "manual"],
      payment_status: [
        "initiated",
        "pending",
        "needs_review",
        "settled",
        "denied",
        "failed",
        "cancelled",
        "expired",
        "refunded",
        "partially_refunded",
        "disputed",
        "duplicate",
      ],
      pricing_basis: ["per_pax", "flat_group"],
      product_category: [
        "compost",
        "seedling",
        "recycled_craft",
        "snack",
        "souvenir",
        "other",
      ],
      quotation_status: ["issued", "accepted", "expired", "superseded", "void"],
      revenue_beneficiary: ["kelurahan", "rw_treasury", "umkm_vendor"],
      revenue_entry_type: ["settlement", "reversal", "adjustment"],
      revenue_rule_scope: [
        "package_default",
        "addon_default",
        "package",
        "product",
      ],
      review_status: ["pending", "published", "rejected"],
      scan_phase: ["validate", "check_in"],
      scan_result: [
        "ok",
        "invalid_signature",
        "not_found",
        "already_used",
        "suspended",
        "revoked",
        "wrong_rw",
        "wrong_date",
        "outside_window",
        "booking_not_paid",
        "ticket_expired",
        "forbidden",
      ],
      schedule_type: [
        "dance_performance",
        "dolanan_session",
        "workshop",
        "art_class",
        "other",
      ],
      session_status: ["open", "closed", "cancelled"],
      ticket_status: ["issued", "used", "suspended", "revoked", "expired"],
    },
  },
} as const

