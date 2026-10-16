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
      [_ in never]: never
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

