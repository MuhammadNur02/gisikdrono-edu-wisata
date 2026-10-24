export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      activity_points: {
        Row: {
          body_md: string | null
          created_at: string
          id: string
          image_path: string | null
          lat: number | null
          lng: number | null
          map_x: number | null
          map_y: number | null
          name: string
          point_type: Database["public"]["Enums"]["activity_point_type"]
          rw_id: number
          short_description: string | null
          slug: string
          sort_order: number
          status: Database["public"]["Enums"]["content_status"]
          svg_hotspot_id: string | null
          updated_at: string
        }
        Insert: {
          body_md?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          lat?: number | null
          lng?: number | null
          map_x?: number | null
          map_y?: number | null
          name: string
          point_type: Database["public"]["Enums"]["activity_point_type"]
          rw_id: number
          short_description?: string | null
          slug: string
          sort_order?: number
          status?: Database["public"]["Enums"]["content_status"]
          svg_hotspot_id?: string | null
          updated_at?: string
        }
        Update: {
          body_md?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          lat?: number | null
          lng?: number | null
          map_x?: number | null
          map_y?: number | null
          name?: string
          point_type?: Database["public"]["Enums"]["activity_point_type"]
          rw_id?: number
          short_description?: string | null
          slug?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["content_status"]
          svg_hotspot_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_points_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          author_id: string | null
          body_json: Json
          category: Database["public"]["Enums"]["article_category"]
          cover_path: string | null
          created_at: string
          excerpt: string | null
          id: string
          published_at: string | null
          reading_minutes: number | null
          reviewed_by: string | null
          rw_id: number | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: Database["public"]["Enums"]["content_status"]
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body_json?: Json
          category?: Database["public"]["Enums"]["article_category"]
          cover_path?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          reading_minutes?: number | null
          reviewed_by?: string | null
          rw_id?: number | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: Database["public"]["Enums"]["content_status"]
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body_json?: Json
          category?: Database["public"]["Enums"]["article_category"]
          cover_path?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          reading_minutes?: number | null
          reviewed_by?: string | null
          rw_id?: number | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["content_status"]
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_ip: unknown
          actor_role: string
          after: Json | null
          before: Json | null
          entity_id: string | null
          entity_type: string
          entry_hash: string
          id: number
          metadata: Json
          occurred_at: string
          prev_hash: string | null
          request_id: string | null
          rw_id: number | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_ip?: unknown
          actor_role: string
          after?: Json | null
          before?: Json | null
          entity_id?: string | null
          entity_type: string
          entry_hash: string
          id?: never
          metadata?: Json
          occurred_at?: string
          prev_hash?: string | null
          request_id?: string | null
          rw_id?: number | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_ip?: unknown
          actor_role?: string
          after?: Json | null
          before?: Json | null
          entity_id?: string | null
          entity_type?: string
          entry_hash?: string
          id?: never
          metadata?: Json
          occurred_at?: string
          prev_hash?: string | null
          request_id?: string | null
          rw_id?: number | null
        }
        Relationships: []
      }
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
            foreignKeyName: "booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_booking_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_recap_by_booking"
            referencedColumns: ["booking_id"]
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
          {
            foreignKeyName: "booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_booking_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_recap_by_booking"
            referencedColumns: ["booking_id"]
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
            foreignKeyName: "booking_legs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_booking_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_legs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_legs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_recap_by_booking"
            referencedColumns: ["booking_id"]
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
            referencedRelation: "v_session_availability"
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
          {
            foreignKeyName: "booking_participants_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_booking_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_participants_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_participants_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_recap_by_booking"
            referencedColumns: ["booking_id"]
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
          email_masked: string | null
          email_verified_at: string | null
          expired_at: string | null
          expires_at: string | null
          guardian_consented_at: string | null
          id: string
          idempotency_key: string | null
          institution_name: string | null
          needs_review: boolean
          notes: string | null
          package_id: string
          package_snapshot: Json
          paid_at: string | null
          pax_count: number
          phone_masked: string | null
          phone_verified_at: string | null
          pic_email: string | null
          pic_first_name: string | null
          pic_name: string
          pic_phone: string | null
          pii_purged_at: string | null
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
          email_masked?: string | null
          email_verified_at?: string | null
          expired_at?: string | null
          expires_at?: string | null
          guardian_consented_at?: string | null
          id?: string
          idempotency_key?: string | null
          institution_name?: string | null
          needs_review?: boolean
          notes?: string | null
          package_id: string
          package_snapshot: Json
          paid_at?: string | null
          pax_count: number
          phone_masked?: string | null
          phone_verified_at?: string | null
          pic_email?: string | null
          pic_first_name?: string | null
          pic_name: string
          pic_phone?: string | null
          pii_purged_at?: string | null
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
          email_masked?: string | null
          email_verified_at?: string | null
          expired_at?: string | null
          expires_at?: string | null
          guardian_consented_at?: string | null
          id?: string
          idempotency_key?: string | null
          institution_name?: string | null
          needs_review?: boolean
          notes?: string | null
          package_id?: string
          package_snapshot?: Json
          paid_at?: string | null
          pax_count?: number
          phone_masked?: string | null
          phone_verified_at?: string | null
          pic_email?: string | null
          pic_first_name?: string | null
          pic_name?: string
          pic_phone?: string | null
          pii_purged_at?: string | null
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
      booklet_page_claims: {
        Row: {
          booklet_id: string
          claimed_at: string
          claimed_by: string
          created_at: string
          id: string
          rw_id: number | null
          updated_at: string
        }
        Insert: {
          booklet_id: string
          claimed_at?: string
          claimed_by: string
          created_at?: string
          id?: string
          rw_id?: number | null
          updated_at?: string
        }
        Update: {
          booklet_id?: string
          claimed_at?: string
          claimed_by?: string
          created_at?: string
          id?: string
          rw_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booklet_page_claims_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booklet_page_claims_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
        ]
      }
      booklets: {
        Row: {
          cover_path: string | null
          created_at: string
          created_by: string | null
          description: string | null
          download_count: number
          file_size_bytes: number | null
          id: string
          kind: Database["public"]["Enums"]["booklet_kind"]
          page_count: number | null
          page_images_prefix: string | null
          pdf_path: string
          published_at: string | null
          rw_id: number | null
          slug: string
          status: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at: string
        }
        Insert: {
          cover_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          download_count?: number
          file_size_bytes?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["booklet_kind"]
          page_count?: number | null
          page_images_prefix?: string | null
          pdf_path: string
          published_at?: string | null
          rw_id?: number | null
          slug: string
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at?: string
        }
        Update: {
          cover_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          download_count?: number
          file_size_bytes?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["booklet_kind"]
          page_count?: number | null
          page_images_prefix?: string | null
          pdf_path?: string
          published_at?: string | null
          rw_id?: number | null
          slug?: string
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booklets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booklets_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          booking_id: string
          certificate_number: string
          id: string
          institution_name: string | null
          issued_at: string
          issued_by: string | null
          kind: Database["public"]["Enums"]["certificate_kind"]
          participant_id: string | null
          pdf_path: string | null
          purged_at: string | null
          recipient_name: string
          release_waived_by: string | null
          released_at: string | null
          rendered_at: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by_undo: boolean
          rw_ids: number[]
          status: Database["public"]["Enums"]["certificate_status"]
          template_version: number
          verify_code: string
          visit_date: string
        }
        Insert: {
          booking_id: string
          certificate_number: string
          id?: string
          institution_name?: string | null
          issued_at?: string
          issued_by?: string | null
          kind: Database["public"]["Enums"]["certificate_kind"]
          participant_id?: string | null
          pdf_path?: string | null
          purged_at?: string | null
          recipient_name: string
          release_waived_by?: string | null
          released_at?: string | null
          rendered_at?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by_undo?: boolean
          rw_ids: number[]
          status?: Database["public"]["Enums"]["certificate_status"]
          template_version?: number
          verify_code: string
          visit_date: string
        }
        Update: {
          booking_id?: string
          certificate_number?: string
          id?: string
          institution_name?: string | null
          issued_at?: string
          issued_by?: string | null
          kind?: Database["public"]["Enums"]["certificate_kind"]
          participant_id?: string | null
          pdf_path?: string | null
          purged_at?: string | null
          recipient_name?: string
          release_waived_by?: string | null
          released_at?: string | null
          rendered_at?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by_undo?: boolean
          rw_ids?: number[]
          status?: Database["public"]["Enums"]["certificate_status"]
          template_version?: number
          verify_code?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_booking_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_recap_by_booking"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "certificates_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "booking_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_release_waived_by_fkey"
            columns: ["release_waived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_sequences: {
        Row: {
          kind: Database["public"]["Enums"]["document_kind"]
          last_value: number
          period: string
        }
        Insert: {
          kind: Database["public"]["Enums"]["document_kind"]
          last_value?: number
          period: string
        }
        Update: {
          kind?: Database["public"]["Enums"]["document_kind"]
          last_value?: number
          period?: string
        }
        Relationships: []
      }
      dsr_requests: {
        Row: {
          booking_code: string | null
          created_at: string
          due_at: string
          email: string | null
          handled_at: string | null
          handled_by: string | null
          id: string
          message: string | null
          otp_id: string | null
          phone: string | null
          request_type: string
          resolution_note: string | null
          status: string
          verified_at: string | null
        }
        Insert: {
          booking_code?: string | null
          created_at?: string
          due_at: string
          email?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message?: string | null
          otp_id?: string | null
          phone?: string | null
          request_type: string
          resolution_note?: string | null
          status?: string
          verified_at?: string | null
        }
        Update: {
          booking_code?: string | null
          created_at?: string
          due_at?: string
          email?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message?: string | null
          otp_id?: string | null
          phone?: string | null
          request_type?: string
          resolution_note?: string | null
          status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dsr_requests_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dsr_requests_otp_id_fkey"
            columns: ["otp_id"]
            isOneToOne: false
            referencedRelation: "guest_otps"
            referencedColumns: ["id"]
          },
        ]
      }
      exports: {
        Row: {
          created_at: string
          deleted_at: string | null
          downloaded_at: string | null
          expires_at: string
          filters: Json
          format: string
          id: string
          kind: Database["public"]["Enums"]["export_kind"]
          reason: string | null
          requested_by: string
          row_count: number | null
          rw_id: number | null
          storage_path: string | null
          watermark: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          downloaded_at?: string | null
          expires_at: string
          filters?: Json
          format: string
          id?: string
          kind: Database["public"]["Enums"]["export_kind"]
          reason?: string | null
          requested_by: string
          row_count?: number | null
          rw_id?: number | null
          storage_path?: string | null
          watermark: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          downloaded_at?: string | null
          expires_at?: string
          filters?: Json
          format?: string
          id?: string
          kind?: Database["public"]["Enums"]["export_kind"]
          reason?: string | null
          requested_by?: string
          row_count?: number | null
          rw_id?: number | null
          storage_path?: string | null
          watermark?: string
        }
        Relationships: [
          {
            foreignKeyName: "exports_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exports_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
        ]
      }
      galleries: {
        Row: {
          alt_text: string
          blurhash: string | null
          booking_id: string | null
          caption: string | null
          category: Database["public"]["Enums"]["gallery_category"]
          created_at: string
          height: number | null
          id: string
          media_type: Database["public"]["Enums"]["media_type"]
          rw_id: number | null
          sort_order: number
          status: Database["public"]["Enums"]["content_status"]
          storage_path: string
          tags: string[]
          taken_at: string | null
          thumbnail_path: string | null
          updated_at: string
          uploaded_by: string | null
          video_url: string | null
          width: number | null
        }
        Insert: {
          alt_text: string
          blurhash?: string | null
          booking_id?: string | null
          caption?: string | null
          category: Database["public"]["Enums"]["gallery_category"]
          created_at?: string
          height?: number | null
          id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          rw_id?: number | null
          sort_order?: number
          status?: Database["public"]["Enums"]["content_status"]
          storage_path: string
          tags?: string[]
          taken_at?: string | null
          thumbnail_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          video_url?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string
          blurhash?: string | null
          booking_id?: string | null
          caption?: string | null
          category?: Database["public"]["Enums"]["gallery_category"]
          created_at?: string
          height?: number | null
          id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          rw_id?: number | null
          sort_order?: number
          status?: Database["public"]["Enums"]["content_status"]
          storage_path?: string
          tags?: string[]
          taken_at?: string | null
          thumbnail_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          video_url?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "galleries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "galleries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_booking_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "galleries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "galleries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_recap_by_booking"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "galleries_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "galleries_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_otps: {
        Row: {
          attempts: number
          booking_id: string | null
          browser_hash: string | null
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
          browser_hash?: string | null
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
          browser_hash?: string | null
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
          {
            foreignKeyName: "guest_otps_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_booking_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_otps_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_otps_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_recap_by_booking"
            referencedColumns: ["booking_id"]
          },
        ]
      }
      hero_banners: {
        Row: {
          created_at: string
          created_by: string | null
          cta_href: string | null
          cta_label: string | null
          ends_at: string | null
          id: string
          image_path: string
          is_active: boolean
          mobile_image_path: string | null
          product_id: string | null
          sort_order: number
          starts_at: string | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cta_href?: string | null
          cta_label?: string | null
          ends_at?: string | null
          id?: string
          image_path: string
          is_active?: boolean
          mobile_image_path?: string | null
          product_id?: string | null
          sort_order?: number
          starts_at?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cta_href?: string | null
          cta_label?: string | null
          ends_at?: string | null
          id?: string
          image_path?: string
          is_active?: boolean
          mobile_image_path?: string | null
          product_id?: string | null
          sort_order?: number
          starts_at?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hero_banners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hero_banners_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_umkm"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_due: number
          amount_paid: number
          booking_id: string
          created_at: string
          credit_note_number: string | null
          credit_note_pdf_path: string | null
          due_date: string | null
          id: string
          invoice_number: string
          issued_at: string
          paid_at: string | null
          payment_id: string | null
          pdf_path: string | null
          receipt_number: string | null
          receipt_pdf_path: string | null
          snapshot: Json
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          amount_due: number
          amount_paid?: number
          booking_id: string
          created_at?: string
          credit_note_number?: string | null
          credit_note_pdf_path?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          issued_at?: string
          paid_at?: string | null
          payment_id?: string | null
          pdf_path?: string | null
          receipt_number?: string | null
          receipt_pdf_path?: string | null
          snapshot: Json
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          booking_id?: string
          created_at?: string
          credit_note_number?: string | null
          credit_note_pdf_path?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string
          paid_at?: string | null
          payment_id?: string | null
          pdf_path?: string | null
          receipt_number?: string | null
          receipt_pdf_path?: string | null
          snapshot?: Json
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_booking_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_recap_by_booking"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "invoices_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      job_heartbeats: {
        Row: {
          job: string
          kind: string
          last_error_code: string | null
          last_failure_at: string | null
          last_request_id: number | null
          last_requested_at: string | null
          last_success_at: string | null
          max_age: string
          updated_at: string
          watching_since: string
        }
        Insert: {
          job: string
          kind: string
          last_error_code?: string | null
          last_failure_at?: string | null
          last_request_id?: number | null
          last_requested_at?: string | null
          last_success_at?: string | null
          max_age: string
          updated_at?: string
          watching_since?: string
        }
        Update: {
          job?: string
          kind?: string
          last_error_code?: string | null
          last_failure_at?: string | null
          last_request_id?: number | null
          last_requested_at?: string | null
          last_success_at?: string | null
          max_age?: string
          updated_at?: string
          watching_since?: string
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          attempted_at: string
          email_hash: string | null
          id: number
          ip: unknown
          reason: string | null
          success: boolean
          user_id: string | null
        }
        Insert: {
          attempted_at?: string
          email_hash?: string | null
          id?: never
          ip?: unknown
          reason?: string | null
          success: boolean
          user_id?: string | null
        }
        Update: {
          attempted_at?: string
          email_hash?: string | null
          id?: never
          ip?: unknown
          reason?: string | null
          success?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          attempts: number
          booking_id: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          dead_at: string | null
          dedupe_key: string
          delivered_at: string | null
          document_path: string | null
          id: string
          last_error: string | null
          last_error_code: string | null
          locked_at: string | null
          max_attempts: number
          next_attempt_at: string
          params: Json
          provider_message_id: string | null
          provider_status: string | null
          read_at: string | null
          recipient: string
          recipient_name: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          template: Database["public"]["Enums"]["notification_template"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          booking_id?: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          dead_at?: string | null
          dedupe_key: string
          delivered_at?: string | null
          document_path?: string | null
          id?: string
          last_error?: string | null
          last_error_code?: string | null
          locked_at?: string | null
          max_attempts?: number
          next_attempt_at?: string
          params?: Json
          provider_message_id?: string | null
          provider_status?: string | null
          read_at?: string | null
          recipient: string
          recipient_name?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template: Database["public"]["Enums"]["notification_template"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          booking_id?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          dead_at?: string | null
          dedupe_key?: string
          delivered_at?: string | null
          document_path?: string | null
          id?: string
          last_error?: string | null
          last_error_code?: string | null
          locked_at?: string | null
          max_attempts?: number
          next_attempt_at?: string
          params?: Json
          provider_message_id?: string | null
          provider_status?: string | null
          read_at?: string | null
          recipient?: string
          recipient_name?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template?: Database["public"]["Enums"]["notification_template"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_booking_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_recap_by_booking"
            referencedColumns: ["booking_id"]
          },
        ]
      }
      package_price_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: number
          new_flat_price: number | null
          new_max_pax: number | null
          new_min_pax: number | null
          new_price_per_pax: number | null
          new_pricing_basis: Database["public"]["Enums"]["pricing_basis"] | null
          old_flat_price: number | null
          old_max_pax: number | null
          old_min_pax: number | null
          old_price_per_pax: number | null
          old_pricing_basis: Database["public"]["Enums"]["pricing_basis"] | null
          package_id: string
          reason: string | null
          tier_id: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_flat_price?: number | null
          new_max_pax?: number | null
          new_min_pax?: number | null
          new_price_per_pax?: number | null
          new_pricing_basis?:
            | Database["public"]["Enums"]["pricing_basis"]
            | null
          old_flat_price?: number | null
          old_max_pax?: number | null
          old_min_pax?: number | null
          old_price_per_pax?: number | null
          old_pricing_basis?:
            | Database["public"]["Enums"]["pricing_basis"]
            | null
          package_id: string
          reason?: string | null
          tier_id?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_flat_price?: number | null
          new_max_pax?: number | null
          new_min_pax?: number | null
          new_price_per_pax?: number | null
          new_pricing_basis?:
            | Database["public"]["Enums"]["pricing_basis"]
            | null
          old_flat_price?: number | null
          old_max_pax?: number | null
          old_min_pax?: number | null
          old_price_per_pax?: number | null
          old_pricing_basis?:
            | Database["public"]["Enums"]["pricing_basis"]
            | null
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
      payment_adjustments: {
        Row: {
          amount: number
          applied_at: string | null
          apply_not_before: string | null
          approved_at: string | null
          approved_by: string | null
          booking_id: string
          evidence_path: string
          id: string
          payment_id: string | null
          proposed_at: string
          proposed_by: string
          reason: string
          rejected_reason: string | null
          status: Database["public"]["Enums"]["adjustment_status"]
          type: Database["public"]["Enums"]["adjustment_type"]
        }
        Insert: {
          amount: number
          applied_at?: string | null
          apply_not_before?: string | null
          approved_at?: string | null
          approved_by?: string | null
          booking_id: string
          evidence_path: string
          id?: string
          payment_id?: string | null
          proposed_at?: string
          proposed_by: string
          reason: string
          rejected_reason?: string | null
          status?: Database["public"]["Enums"]["adjustment_status"]
          type: Database["public"]["Enums"]["adjustment_type"]
        }
        Update: {
          amount?: number
          applied_at?: string | null
          apply_not_before?: string | null
          approved_at?: string | null
          approved_by?: string | null
          booking_id?: string
          evidence_path?: string
          id?: string
          payment_id?: string | null
          proposed_at?: string
          proposed_by?: string
          reason?: string
          rejected_reason?: string | null
          status?: Database["public"]["Enums"]["adjustment_status"]
          type?: Database["public"]["Enums"]["adjustment_type"]
        }
        Relationships: [
          {
            foreignKeyName: "payment_adjustments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_adjustments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_adjustments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_booking_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_adjustments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_adjustments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_recap_by_booking"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payment_adjustments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_adjustments_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          event_hash: string
          fraud_status: string | null
          gross_amount_raw: string | null
          id: number
          order_id: string
          payload: Json
          payment_id: string | null
          processed_at: string | null
          processing_result: string | null
          received_at: string
          source: string
          status_code: string | null
          transaction_status: string | null
        }
        Insert: {
          event_hash: string
          fraud_status?: string | null
          gross_amount_raw?: string | null
          id?: never
          order_id: string
          payload: Json
          payment_id?: string | null
          processed_at?: string | null
          processing_result?: string | null
          received_at?: string
          source: string
          status_code?: string | null
          transaction_status?: string | null
        }
        Update: {
          event_hash?: string
          fraud_status?: string | null
          gross_amount_raw?: string | null
          id?: never
          order_id?: string
          payload?: Json
          payment_id?: string | null
          processed_at?: string | null
          processing_result?: string | null
          received_at?: string
          source?: string
          status_code?: string | null
          transaction_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          attempt_no: number
          booking_id: string
          created_at: string
          expiry_time: string | null
          fraud_status: string | null
          gross_amount: number
          id: string
          last_payload: Json | null
          last_polled_at: string | null
          manual_proof_path: string | null
          manual_reference: string | null
          method: Database["public"]["Enums"]["payment_method"] | null
          order_id: string
          payment_type_raw: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_txn_id: string | null
          recorded_by: string | null
          refunded_amount: number
          settlement_time: string | null
          snap_redirect_url: string | null
          snap_token: string | null
          status: Database["public"]["Enums"]["payment_status"]
          status_code: string | null
          transaction_time: string | null
          updated_at: string
          va_bank: string | null
          va_number: string | null
        }
        Insert: {
          attempt_no: number
          booking_id: string
          created_at?: string
          expiry_time?: string | null
          fraud_status?: string | null
          gross_amount: number
          id?: string
          last_payload?: Json | null
          last_polled_at?: string | null
          manual_proof_path?: string | null
          manual_reference?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          order_id: string
          payment_type_raw?: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_txn_id?: string | null
          recorded_by?: string | null
          refunded_amount?: number
          settlement_time?: string | null
          snap_redirect_url?: string | null
          snap_token?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          status_code?: string | null
          transaction_time?: string | null
          updated_at?: string
          va_bank?: string | null
          va_number?: string | null
        }
        Update: {
          attempt_no?: number
          booking_id?: string
          created_at?: string
          expiry_time?: string | null
          fraud_status?: string | null
          gross_amount?: number
          id?: string
          last_payload?: Json | null
          last_polled_at?: string | null
          manual_proof_path?: string | null
          manual_reference?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          order_id?: string
          payment_type_raw?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_txn_id?: string | null
          recorded_by?: string | null
          refunded_amount?: number
          settlement_time?: string | null
          snap_redirect_url?: string | null
          snap_token?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          status_code?: string | null
          transaction_time?: string | null
          updated_at?: string
          va_bank?: string | null
          va_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_booking_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_recap_by_booking"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_batches: {
        Row: {
          beneficiary_key: string
          created_at: string
          created_by: string
          id: string
          notes: string | null
          paid_at: string | null
          period_from: string
          period_to: string
          proof_path: string | null
          reference: string | null
          total_amount: number
        }
        Insert: {
          beneficiary_key: string
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_from: string
          period_to: string
          proof_path?: string | null
          reference?: string | null
          total_amount: number
        }
        Update: {
          beneficiary_key?: string
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_from?: string
          period_to?: string
          proof_path?: string | null
          reference?: string | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "payout_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          description_md: string | null
          ends_at: string
          id: string
          image_path: string | null
          package_id: string | null
          recurrence_rule: string | null
          rw_id: number
          schedule_type: Database["public"]["Enums"]["schedule_type"]
          starts_at: string
          status: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description_md?: string | null
          ends_at: string
          id?: string
          image_path?: string | null
          package_id?: string | null
          recurrence_rule?: string | null
          rw_id: number
          schedule_type: Database["public"]["Enums"]["schedule_type"]
          starts_at: string
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description_md?: string | null
          ends_at?: string
          id?: string
          image_path?: string | null
          package_id?: string | null
          recurrence_rule?: string | null
          rw_id?: number
          schedule_type?: Database["public"]["Enums"]["schedule_type"]
          starts_at?: string
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_schedules_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "tour_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_schedules_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
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
          mfa_reset_requested_at: string | null
          mfa_reset_requested_by: string | null
          phone: string | null
          promotion_requested_at: string | null
          promotion_requested_by: string | null
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
          mfa_reset_requested_at?: string | null
          mfa_reset_requested_by?: string | null
          phone?: string | null
          promotion_requested_at?: string | null
          promotion_requested_by?: string | null
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
          mfa_reset_requested_at?: string | null
          mfa_reset_requested_by?: string | null
          phone?: string | null
          promotion_requested_at?: string | null
          promotion_requested_by?: string | null
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
            foreignKeyName: "profiles_mfa_reset_requested_by_fkey"
            columns: ["mfa_reset_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_promotion_requested_by_fkey"
            columns: ["promotion_requested_by"]
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
      quotations: {
        Row: {
          booking_id: string
          id: string
          issued_at: string
          issued_by: string | null
          pdf_path: string | null
          quotation_number: string
          snapshot: Json
          status: Database["public"]["Enums"]["quotation_status"]
          valid_until: string
          verify_code: string
          version: number
        }
        Insert: {
          booking_id: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          pdf_path?: string | null
          quotation_number: string
          snapshot: Json
          status?: Database["public"]["Enums"]["quotation_status"]
          valid_until: string
          verify_code: string
          version?: number
        }
        Update: {
          booking_id?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          pdf_path?: string | null
          quotation_number?: string
          snapshot?: Json
          status?: Database["public"]["Enums"]["quotation_status"]
          valid_until?: string
          verify_code?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_booking_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_recap_by_booking"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "quotations_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_buckets: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      reconciliation_issues: {
        Row: {
          booking_id: string | null
          created_at: string
          details: Json
          id: string
          issue_type: string
          payment_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          run_id: string
          severity: Database["public"]["Enums"]["alert_severity"]
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          issue_type: string
          payment_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_id: string
          severity: Database["public"]["Enums"]["alert_severity"]
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          issue_type?: string
          payment_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string
          severity?: Database["public"]["Enums"]["alert_severity"]
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_issues_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_issues_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_booking_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_issues_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_issues_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_recap_by_booking"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "reconciliation_issues_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_issues_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_issues_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_runs: {
        Row: {
          audit_chain_ok: boolean | null
          created_by: string | null
          finished_at: string | null
          id: string
          issues_found: number
          ledger_chain_ok: boolean | null
          payments_checked: number
          run_date: string
          source: string
          started_at: string
          summary: Json
        }
        Insert: {
          audit_chain_ok?: boolean | null
          created_by?: string | null
          finished_at?: string | null
          id?: string
          issues_found?: number
          ledger_chain_ok?: boolean | null
          payments_checked?: number
          run_date: string
          source: string
          started_at?: string
          summary?: Json
        }
        Update: {
          audit_chain_ok?: boolean | null
          created_by?: string | null
          finished_at?: string | null
          id?: string
          issues_found?: number
          ledger_chain_ok?: boolean | null
          payments_checked?: number
          run_date?: string
          source?: string
          started_at?: string
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_share_entries: {
        Row: {
          adjustment_id: string | null
          amount: number
          base_amount: number
          beneficiary: Database["public"]["Enums"]["revenue_beneficiary"]
          beneficiary_key: string
          booking_addon_id: string | null
          booking_id: string
          created_at: string
          entry_hash: string
          entry_type: Database["public"]["Enums"]["revenue_entry_type"]
          id: number
          line_ref: string
          payment_id: string | null
          payout_batch_id: string | null
          pct: number
          prev_hash: string | null
          rule_id: string | null
          rule_version: Json
          rw_id: number | null
          vendor_id: string | null
        }
        Insert: {
          adjustment_id?: string | null
          amount: number
          base_amount: number
          beneficiary: Database["public"]["Enums"]["revenue_beneficiary"]
          beneficiary_key: string
          booking_addon_id?: string | null
          booking_id: string
          created_at?: string
          entry_hash: string
          entry_type: Database["public"]["Enums"]["revenue_entry_type"]
          id?: never
          line_ref: string
          payment_id?: string | null
          payout_batch_id?: string | null
          pct: number
          prev_hash?: string | null
          rule_id?: string | null
          rule_version: Json
          rw_id?: number | null
          vendor_id?: string | null
        }
        Update: {
          adjustment_id?: string | null
          amount?: number
          base_amount?: number
          beneficiary?: Database["public"]["Enums"]["revenue_beneficiary"]
          beneficiary_key?: string
          booking_addon_id?: string | null
          booking_id?: string
          created_at?: string
          entry_hash?: string
          entry_type?: Database["public"]["Enums"]["revenue_entry_type"]
          id?: never
          line_ref?: string
          payment_id?: string | null
          payout_batch_id?: string | null
          pct?: number
          prev_hash?: string | null
          rule_id?: string | null
          rule_version?: Json
          rw_id?: number | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_share_entries_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "payment_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_share_entries_booking_addon_id_fkey"
            columns: ["booking_addon_id"]
            isOneToOne: false
            referencedRelation: "booking_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_share_entries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_share_entries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_booking_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_share_entries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_share_entries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_recap_by_booking"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "revenue_share_entries_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_share_entries_payout_batch_id_fkey"
            columns: ["payout_batch_id"]
            isOneToOne: false
            referencedRelation: "payout_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_share_entries_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "revenue_share_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_share_entries_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_share_entries_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "umkm_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_share_rule_lines: {
        Row: {
          beneficiary: Database["public"]["Enums"]["revenue_beneficiary"]
          id: string
          pct: number
          rule_id: string
          rw_id: number | null
          vendor_id: string | null
        }
        Insert: {
          beneficiary: Database["public"]["Enums"]["revenue_beneficiary"]
          id?: string
          pct: number
          rule_id: string
          rw_id?: number | null
          vendor_id?: string | null
        }
        Update: {
          beneficiary?: Database["public"]["Enums"]["revenue_beneficiary"]
          id?: string
          pct?: number
          rule_id?: string
          rw_id?: number | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_share_rule_lines_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "revenue_share_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_share_rule_lines_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_share_rule_lines_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "umkm_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_share_rules: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          name: string
          package_id: string | null
          product_id: string | null
          rw_id: number | null
          scope: Database["public"]["Enums"]["revenue_rule_scope"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          name: string
          package_id?: string | null
          product_id?: string | null
          rw_id?: number | null
          scope: Database["public"]["Enums"]["revenue_rule_scope"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          name?: string
          package_id?: string | null
          product_id?: string | null
          rw_id?: number | null
          scope?: Database["public"]["Enums"]["revenue_rule_scope"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_share_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_share_rules_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "tour_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_share_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_umkm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_share_rules_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string
          booking_id: string
          created_at: string
          id: string
          institution_name: string | null
          is_anonymous: boolean
          is_featured: boolean
          moderated_at: string | null
          moderated_by: string | null
          moderation_note: string | null
          public_reviewer_name: string | null
          rating: number
          reviewer_name: string
          rw_ids: number[]
          status: Database["public"]["Enums"]["review_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          body: string
          booking_id: string
          created_at?: string
          id?: string
          institution_name?: string | null
          is_anonymous?: boolean
          is_featured?: boolean
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_note?: string | null
          public_reviewer_name?: string | null
          rating: number
          reviewer_name: string
          rw_ids: number[]
          status?: Database["public"]["Enums"]["review_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          booking_id?: string
          created_at?: string
          id?: string
          institution_name?: string | null
          is_anonymous?: boolean
          is_featured?: boolean
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_note?: string | null
          public_reviewer_name?: string | null
          rating?: number
          reviewer_name?: string
          rw_ids?: number[]
          status?: Database["public"]["Enums"]["review_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_booking_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_bookings_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "v_revenue_recap_by_booking"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "reviews_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rw_units: {
        Row: {
          accent_key: Database["public"]["Enums"]["rw_accent"]
          code: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          description_md: string | null
          hero_image_path: string | null
          icon_key: Database["public"]["Enums"]["rw_icon"]
          id: number
          is_active: boolean
          map_lat: number | null
          map_lng: number | null
          name: string
          products_heading: string | null
          schedule_enabled: boolean
          short_name: string
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
          accent_key: Database["public"]["Enums"]["rw_accent"]
          code: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          description_md?: string | null
          hero_image_path?: string | null
          icon_key: Database["public"]["Enums"]["rw_icon"]
          id: number
          is_active?: boolean
          map_lat?: number | null
          map_lng?: number | null
          name: string
          products_heading?: string | null
          schedule_enabled?: boolean
          short_name: string
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
          accent_key?: Database["public"]["Enums"]["rw_accent"]
          code?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          description_md?: string | null
          hero_image_path?: string | null
          icon_key?: Database["public"]["Enums"]["rw_icon"]
          id?: number
          is_active?: boolean
          map_lat?: number | null
          map_lng?: number | null
          name?: string
          products_heading?: string | null
          schedule_enabled?: boolean
          short_name?: string
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
      security_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          delivery_claimed_at: string | null
          details: Json
          fingerprint: string
          first_seen_at: string
          id: string
          last_seen_at: string
          notified_at: string | null
          occurrences: number
          rule: string
          severity: Database["public"]["Enums"]["alert_severity"]
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          delivery_claimed_at?: string | null
          details?: Json
          fingerprint: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          notified_at?: string | null
          occurrences?: number
          rule: string
          severity: Database["public"]["Enums"]["alert_severity"]
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          delivery_claimed_at?: string | null
          details?: Json
          fingerprint?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          notified_at?: string | null
          occurrences?: number
          rule?: string
          severity?: Database["public"]["Enums"]["alert_severity"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          details: Json
          entity_id: string | null
          entity_type: string | null
          event_type: string
          fingerprint: string | null
          id: number
          ip_hash: string | null
          occurred_at: string
          rw_id: number | null
          severity: Database["public"]["Enums"]["alert_severity"]
          user_agent: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          fingerprint?: string | null
          id?: never
          ip_hash?: string | null
          occurred_at?: string
          rw_id?: number | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          user_agent?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          fingerprint?: string | null
          id?: never
          ip_hash?: string | null
          occurred_at?: string
          rw_id?: number | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          user_agent?: string | null
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
      ticket_scans: {
        Row: {
          attempt_id: string
          attendee_count: number | null
          device_info: Json
          id: number
          ip: unknown
          override_reason: string | null
          phase: Database["public"]["Enums"]["scan_phase"]
          raw_payload: string | null
          result: Database["public"]["Enums"]["scan_result"]
          rw_id: number | null
          scanned_at: string
          scanned_by: string
          source: string
          ticket_id: string | null
        }
        Insert: {
          attempt_id: string
          attendee_count?: number | null
          device_info?: Json
          id?: never
          ip?: unknown
          override_reason?: string | null
          phase: Database["public"]["Enums"]["scan_phase"]
          raw_payload?: string | null
          result: Database["public"]["Enums"]["scan_result"]
          rw_id?: number | null
          scanned_at?: string
          scanned_by: string
          source?: string
          ticket_id?: string | null
        }
        Update: {
          attempt_id?: string
          attendee_count?: number | null
          device_info?: Json
          id?: never
          ip?: unknown
          override_reason?: string | null
          phase?: Database["public"]["Enums"]["scan_phase"]
          raw_payload?: string | null
          result?: Database["public"]["Enums"]["scan_result"]
          rw_id?: number | null
          scanned_at?: string
          scanned_by?: string
          source?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_scans_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_scans_scanned_by_fkey"
            columns: ["scanned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_scans_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets_qr"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_scans_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      tickets_qr: {
        Row: {
          booking_id: string
          booking_leg_id: string
          check_in_note: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          checked_in_pax: number | null
          id: string
          issued_at: string
          key_id: string
          pax_count: number
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          rw_id: number
          status: Database["public"]["Enums"]["ticket_status"]
          suspend_reason: string | null
          suspended_at: string | null
          ticket_code: string
          unpaid_pax: number
          updated_at: string
          valid_from: string
          valid_on: string
          valid_until: string
          visit_session_id: string
        }
        Insert: {
          booking_id: string
          booking_leg_id: string
          check_in_note?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          checked_in_pax?: number | null
          id?: string
          issued_at?: string
          key_id: string
          pax_count: number
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          rw_id: number
          status?: Database["public"]["Enums"]["ticket_status"]
          suspend_reason?: string | null
          suspended_at?: string | null
          ticket_code: string
          unpaid_pax?: number
          updated_at?: string
          valid_from: string
          valid_on: string
          valid_until: string
          visit_session_id: string
        }
        Update: {
          booking_id?: string
          booking_leg_id?: string
          check_in_note?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          checked_in_pax?: number | null
          id?: string
          issued_at?: string
          key_id?: string
          pax_count?: number
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          rw_id?: number
          status?: Database["public"]["Enums"]["ticket_status"]
          suspend_reason?: string | null
          suspended_at?: string | null
          ticket_code?: string
          unpaid_pax?: number
          updated_at?: string
          valid_from?: string
          valid_on?: string
          valid_until?: string
          visit_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_qr_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_qr_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_booking_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_qr_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_qr_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_recap_by_booking"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "tickets_qr_booking_leg_id_fkey"
            columns: ["booking_leg_id"]
            isOneToOne: true
            referencedRelation: "booking_legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_qr_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_qr_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_qr_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_qr_visit_session_id_fkey"
            columns: ["visit_session_id"]
            isOneToOne: false
            referencedRelation: "v_session_availability"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_qr_visit_session_id_fkey"
            columns: ["visit_session_id"]
            isOneToOne: false
            referencedRelation: "visit_sessions"
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
      webhook_rejections: {
        Row: {
          body_sha256: string | null
          id: number
          ip: unknown
          order_id: string | null
          provider: string
          reason: string
          received_at: string
          status_code: string | null
          user_agent: string | null
        }
        Insert: {
          body_sha256?: string | null
          id?: never
          ip?: unknown
          order_id?: string | null
          provider: string
          reason: string
          received_at?: string
          status_code?: string | null
          user_agent?: string | null
        }
        Update: {
          body_sha256?: string | null
          id?: never
          ip?: unknown
          order_id?: string | null
          provider?: string
          reason?: string
          received_at?: string
          status_code?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_attendance_today: {
        Row: {
          booked_pax: number | null
          booker_type: Database["public"]["Enums"]["booker_type"] | null
          booking_code: string | null
          booking_id: string | null
          checked_in_at: string | null
          checked_in_pax: number | null
          end_time: string | null
          institution_name: string | null
          is_manual: boolean | null
          pic_first_name: string | null
          rw_id: number | null
          session_label: string | null
          start_time: string | null
          ticket_code: string | null
          ticket_id: string | null
          ticket_status: Database["public"]["Enums"]["ticket_status"] | null
          unpaid_pax: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_qr_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_qr_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_booking_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_qr_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_bookings_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_qr_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_recap_by_booking"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "tickets_qr_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
        ]
      }
      v_booking_admin: {
        Row: {
          admin_notes: string | null
          amount_paid: number | null
          booker_type: Database["public"]["Enums"]["booker_type"] | null
          booking_code: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          channel: Database["public"]["Enums"]["booking_channel"] | null
          checked_in_at: string | null
          completed_at: string | null
          created_at: string | null
          email_masked: string | null
          expired_at: string | null
          expires_at: string | null
          id: string | null
          institution_name: string | null
          invoices: Json | null
          is_anonymised: boolean | null
          is_email_verified: boolean | null
          is_phone_verified: boolean | null
          legs: Json | null
          needs_review: boolean | null
          notes: string | null
          package_id: string | null
          package_name: string | null
          paid_at: string | null
          pax_count: number | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          payments: Json | null
          phone_masked: string | null
          pic_first_name: string | null
          quoted_at: string | null
          refunded_at: string | null
          review_reason: string | null
          rw_ids: number[] | null
          shows_amounts: boolean | null
          status: Database["public"]["Enums"]["booking_status"] | null
          subtotal_package: number | null
          ticket_statuses: Json | null
          tickets: Json | null
          total_amount: number | null
          visit_date: string | null
          visit_date_end: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "tour_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      v_booking_export: {
        Row: {
          booker_type: Database["public"]["Enums"]["booker_type"] | null
          booking_code: string | null
          booking_status: Database["public"]["Enums"]["booking_status"] | null
          checked_in_pax: number | null
          institution_name: string | null
          leg_pax: number | null
          leg_status: Database["public"]["Enums"]["booking_leg_status"] | null
          package_name: string | null
          paid_at: string | null
          rw_id: number | null
          session_date: string | null
          session_label: string | null
          start_time: string | null
          ticket_code: string | null
          ticket_status: Database["public"]["Enums"]["ticket_status"] | null
          total_amount: number | null
          unpaid_pax: number | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_legs_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
        ]
      }
      v_bookings_staff: {
        Row: {
          admin_notes: string | null
          amount_paid: number | null
          booker_type: Database["public"]["Enums"]["booker_type"] | null
          booking_code: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          channel: Database["public"]["Enums"]["booking_channel"] | null
          checked_in_at: string | null
          completed_at: string | null
          created_at: string | null
          email_masked: string | null
          expired_at: string | null
          expires_at: string | null
          id: string | null
          institution_name: string | null
          is_anonymised: boolean | null
          is_email_verified: boolean | null
          is_phone_verified: boolean | null
          legs: Json | null
          needs_review: boolean | null
          notes: string | null
          package_id: string | null
          package_name: string | null
          paid_at: string | null
          pax_count: number | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          phone_masked: string | null
          pic_first_name: string | null
          quoted_at: string | null
          refunded_at: string | null
          review_reason: string | null
          rw_ids: number[] | null
          shows_amounts: boolean | null
          status: Database["public"]["Enums"]["booking_status"] | null
          subtotal_package: number | null
          ticket_statuses: Json | null
          total_amount: number | null
          visit_date: string | null
          visit_date_end: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "tour_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      v_finance_daily: {
        Row: {
          day: string | null
          gross_settled: number | null
          net: number | null
          payments_count: number | null
          qris_count: number | null
          refunds: number | null
          va_count: number | null
        }
        Relationships: []
      }
      v_public_reviews: {
        Row: {
          body: string | null
          created_at: string | null
          id: string | null
          institution_name: string | null
          is_featured: boolean | null
          rating: number | null
          reviewer_name: string | null
          rw_ids: number[] | null
          title: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string | null
          institution_name?: string | null
          is_featured?: boolean | null
          rating?: number | null
          reviewer_name?: string | null
          rw_ids?: number[] | null
          title?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string | null
          institution_name?: string | null
          is_featured?: boolean | null
          rating?: number | null
          reviewer_name?: string | null
          rw_ids?: number[] | null
          title?: string | null
        }
        Relationships: []
      }
      v_revenue_recap_by_booking: {
        Row: {
          booking_code: string | null
          booking_id: string | null
          entries: Json | null
          paid_at: string | null
          total_amount: number | null
        }
        Relationships: []
      }
      v_revenue_recap_by_party: {
        Row: {
          accrued: number | null
          beneficiary: Database["public"]["Enums"]["revenue_beneficiary"] | null
          beneficiary_key: string | null
          beneficiary_name: string | null
          outstanding: number | null
          paid_out: number | null
          rw_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_share_entries_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
        ]
      }
      v_revenue_recap_daily: {
        Row: {
          beneficiary_key: string | null
          bookings: number | null
          day: string | null
          net_amount: number | null
          reversed_amount: number | null
          rw_id: number | null
          settled_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_share_entries_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
        ]
      }
      v_session_availability: {
        Row: {
          capacity: number | null
          end_time: string | null
          id: string | null
          label: string | null
          remaining: number | null
          rw_id: number | null
          session_date: string | null
          start_time: string | null
        }
        Insert: {
          capacity?: number | null
          end_time?: string | null
          id?: string | null
          label?: string | null
          remaining?: never
          rw_id?: number | null
          session_date?: string | null
          start_time?: string | null
        }
        Update: {
          capacity?: number | null
          end_time?: string | null
          id?: string | null
          label?: string | null
          remaining?: never
          rw_id?: number | null
          session_date?: string | null
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visit_sessions_rw_id_fkey"
            columns: ["rw_id"]
            isOneToOne: false
            referencedRelation: "rw_units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      aal2: { Args: never; Returns: boolean }
      app_role: { Args: never; Returns: string }
      app_rw_id: { Args: never; Returns: number }
      cancel_staff_mfa_reset: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      cancel_superadmin_promotion: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      check_in_ticket: {
        Args: {
          p_attempt_id: string
          p_attendee_count: number
          p_device?: Json
          p_note?: string
          p_override?: boolean
          p_override_reason?: string
          p_raw?: string
          p_source?: string
          p_ticket_id: string
        }
        Returns: Json
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      find_manual_ticket: {
        Args: { p_booking_code: string; p_phone_last_digits: string }
        Returns: Json
      }
      fresh_totp: { Args: never; Returns: boolean }
      generate_visit_sessions: {
        Args: { p_from: string; p_rw_id: number; p_to: string }
        Returns: number
      }
      hook_mfa_verification_attempt: { Args: { event: Json }; Returns: Json }
      hook_password_verification_attempt: {
        Args: { event: Json }
        Returns: Json
      }
      invite_superadmin: {
        Args: { p_email: string; p_invite_code_hash: string }
        Returns: Json
      }
      is_admin_rw: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      issue_certificates: {
        Args: { p_booking_id: string; p_waiver_reason?: string }
        Returns: number
      }
      owns_any_rw: { Args: { p_rw_ids: number[] }; Returns: boolean }
      owns_rw: { Args: { p_rw_id: number }; Returns: boolean }
      reset_staff_mfa: { Args: { p_user_id: string }; Returns: Json }
      revenue_recap: {
        Args: { p_from: string; p_rw_id?: number; p_to: string }
        Returns: Json
      }
      revoke_certificate: {
        Args: { p_certificate_id: string; p_reason: string }
        Returns: undefined
      }
      rpc_create_export: {
        Args: {
          p_filters: Json
          p_format: string
          p_kind: Database["public"]["Enums"]["export_kind"]
          p_reason: string
        }
        Returns: Json
      }
      rpc_get_participants: {
        Args: { p_booking_id: string }
        Returns: {
          booking_id: string
          created_at: string
          full_name: string
          group_label: string | null
          id: string
          role_label: string | null
          seq_no: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "booking_participants"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_log_ui_event: {
        Args: { p_entity_id?: string; p_event: string }
        Returns: undefined
      }
      rpc_reveal_booking_contact: {
        Args: { p_booking_id: string; p_reason: string }
        Returns: Json
      }
      scan_ticket: {
        Args: {
          p_attempt_id: string
          p_attendee_count?: number
          p_attestation?: string
          p_device?: Json
          p_expires_at?: number
          p_mode: string
          p_override_reason?: string
          p_raw?: string
          p_source: string
          p_ticket_id?: string
        }
        Returns: Json
      }
      set_rw_unit_status: {
        Args: { p_is_active: boolean; p_rw_id: number }
        Returns: undefined
      }
      set_staff_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_rw_id?: number
          p_user_id: string
        }
        Returns: Json
      }
      set_staff_status: {
        Args: { p_is_active: boolean; p_reason: string; p_user_id: string }
        Returns: undefined
      }
      svc_apply_payment_event: {
        Args: {
          p_confirmed?: Json
          p_event_id: number
          p_key_id: string
          p_source: string
        }
        Returns: Json
      }
      svc_attach_snap_token: {
        Args: {
          p_payment_id: string
          p_redirect_url: string
          p_snap_token: string
        }
        Returns: undefined
      }
      svc_claim_booklet_pages: {
        Args: {
          p_actor_id: string
          p_booklet_id: string
          p_hold_seconds: number
          p_rw_id?: number
        }
        Returns: boolean
      }
      svc_claim_notifications: {
        Args: {
          p_limit: number
          p_templates: Database["public"]["Enums"]["notification_template"][]
        }
        Returns: {
          attempts: number
          booking_id: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          dead_at: string | null
          dedupe_key: string
          delivered_at: string | null
          document_path: string | null
          id: string
          last_error: string | null
          last_error_code: string | null
          locked_at: string | null
          max_attempts: number
          next_attempt_at: string
          params: Json
          provider_message_id: string | null
          provider_status: string | null
          read_at: string | null
          recipient: string
          recipient_name: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          template: Database["public"]["Enums"]["notification_template"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      svc_claim_security_alerts: {
        Args: { p_limit: number }
        Returns: {
          id: string
          last_seen_at: string
          rule: string
          severity: Database["public"]["Enums"]["alert_severity"]
        }[]
      }
      svc_complete_notification: {
        Args: { p_id: string; p_provider_message_id: string }
        Returns: undefined
      }
      svc_complete_paid_order: {
        Args: { p_key_id: string; p_order_id: string }
        Returns: Json
      }
      svc_create_booking: {
        Args: {
          p_addons: Json
          p_booker: Json
          p_client_meta: Json
          p_consent: Json
          p_idempotency_key: string
          p_mode: string
          p_otp_id: string
          p_package_id: string
          p_participants: Json
          p_pax: number
          p_quote_hash: string
          p_session_ids: string[]
        }
        Returns: Json
      }
      svc_create_payment_attempt: {
        Args: { p_actor_id?: string; p_booking_id: string; p_replaces?: string }
        Returns: Json
      }
      svc_create_quotation: {
        Args: { p_actor_id?: string; p_booking_id: string }
        Returns: Json
      }
      svc_enqueue_notification: {
        Args: {
          p_booking_id: string
          p_channel: Database["public"]["Enums"]["notification_channel"]
          p_params: Json
          p_template: Database["public"]["Enums"]["notification_template"]
        }
        Returns: string
      }
      svc_expire_stale_bookings: { Args: never; Returns: Json }
      svc_fail_notification: {
        Args: {
          p_error: string
          p_error_code: string
          p_id: string
          p_permanent: boolean
        }
        Returns: undefined
      }
      svc_forget_purged_files: { Args: { p_paths: string[] }; Returns: number }
      svc_increment_booklet_download: {
        Args: { p_booklet_id: string }
        Returns: undefined
      }
      svc_issue_first_quotation: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      svc_issue_phone_otp: {
        Args: {
          p_booking_id?: string
          p_browser_hash: string
          p_channel: Database["public"]["Enums"]["notification_channel"]
          p_code: string
          p_code_hash: string
          p_email?: string
          p_ip?: unknown
          p_otp_id: string
          p_phone?: string
          p_purpose: Database["public"]["Enums"]["otp_purpose"]
        }
        Returns: Json
      }
      svc_job_health: {
        Args: never
        Returns: {
          is_stalled: boolean
          job: string
          kind: string
          last_error_code: string
          last_failure_at: string
          last_success_at: string
        }[]
      }
      svc_log_audit: {
        Args: {
          p_action: string
          p_actor_id?: string
          p_entity_id?: string
          p_entity_type: string
          p_metadata?: Json
        }
        Returns: undefined
      }
      svc_mark_security_alert_sent: {
        Args: { p_id: string; p_last_seen_at: string }
        Returns: undefined
      }
      svc_payments_housekeeping: { Args: never; Returns: Json }
      svc_payments_to_poll: {
        Args: { p_limit: number }
        Returns: {
          order_id: string
          reason: string
        }[]
      }
      svc_placeholder_site_settings: { Args: never; Returns: string[] }
      svc_purgeable_files: {
        Args: { p_limit: number }
        Returns: {
          bucket: string
          path: string
        }[]
      }
      svc_rate_limit_hit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      svc_rate_limit_refund: {
        Args: { p_key: string; p_window_seconds: number }
        Returns: undefined
      }
      svc_record_document_pdf: {
        Args: {
          p_actor_id?: string
          p_document_id: string
          p_kind: string
          p_path: string
        }
        Returns: undefined
      }
      svc_record_job_run: {
        Args: { p_error_code?: string; p_job: string; p_succeeded: boolean }
        Returns: undefined
      }
      svc_record_payment_event: {
        Args: { p_event_hash: string; p_payload: Json; p_source: string }
        Returns: Json
      }
      svc_record_payment_failure: {
        Args: {
          p_payload?: Json
          p_payment_id: string
          p_status: Database["public"]["Enums"]["payment_status"]
        }
        Returns: undefined
      }
      svc_record_webhook_rejection: {
        Args: {
          p_body_sha256?: string
          p_ip?: unknown
          p_order_id?: string
          p_reason: string
          p_status_code?: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      svc_release_security_alert: { Args: { p_id: string }; Returns: undefined }
      svc_resend_booking_link: {
        Args: { p_booking_code: string; p_email?: string; p_phone?: string }
        Returns: string
      }
      svc_revoke_guest_links: {
        Args: { p_booking_id: string }
        Returns: number
      }
      svc_submit_review: {
        Args: {
          p_body: string
          p_booking_id: string
          p_is_anonymous: boolean
          p_rating: number
          p_reviewer_name: string
          p_title: string
        }
        Returns: string
      }
      svc_verify_phone_otp: {
        Args: {
          p_browser_hash: string
          p_channel: Database["public"]["Enums"]["notification_channel"]
          p_code_hash: string
          p_email?: string
          p_phone?: string
          p_purpose: Database["public"]["Enums"]["otp_purpose"]
        }
        Returns: Json
      }
      today_jkt: { Args: never; Returns: string }
      undo_check_in: {
        Args: { p_reason: string; p_ticket_id: string }
        Returns: undefined
      }
      unlock_scanner_officer: {
        Args: { p_profile_id: string }
        Returns: undefined
      }
      validate_ticket: {
        Args: {
          p_attempt_id: string
          p_device?: Json
          p_raw?: string
          p_source?: string
          p_ticket_id: string
        }
        Returns: Json
      }
      verify_audit_chain: { Args: never; Returns: Json }
      visit_stats: {
        Args: {
          p_from: string
          p_granularity?: string
          p_rw_id?: number
          p_to: string
        }
        Returns: Json
      }
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
        | "inclusion_center"
        | "child_friendly_space"
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
        | "booking_link"
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
      rw_accent: "leaf" | "terracotta" | "mulberry" | "teal" | "violet"
      rw_icon: "recycle" | "drama" | "heart_handshake" | "landmark" | "users"
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
        "inclusion_center",
        "child_friendly_space",
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
        "booking_link",
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
      rw_accent: ["leaf", "terracotta", "mulberry", "teal", "violet"],
      rw_icon: ["recycle", "drama", "heart_handshake", "landmark", "users"],
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

