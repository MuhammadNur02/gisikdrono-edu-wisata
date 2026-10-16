-- 0002_enums: every enum of the schema, with the exact values of docs/PRD.md §8.3 (Task P1.2.02).
-- Postgres sorts and compares enum values by their position, so the order here is part of the
-- contract. A new value later means `alter type ... add value` in a new timestamped migration.

create type public.app_role                 as enum ('superadmin','admin_rw','none');
create type public.content_status           as enum ('draft','pending_review','published','archived');
create type public.session_status           as enum ('open','closed','cancelled');
create type public.package_category         as enum ('regular','student','institutional','combo');
create type public.pricing_basis            as enum ('per_pax','flat_group');
create type public.product_category         as enum ('compost','seedling','recycled_craft','snack','souvenir','other');
create type public.booker_type              as enum ('individual','school','university','government','company','community','other');
create type public.booking_channel          as enum ('web','admin');
create type public.booking_status           as enum ('quoted','pending_payment','paid','checked_in','completed','no_show','expired','cancelled','refunded');
create type public.booking_leg_status       as enum ('unreserved','reserved','checked_in','released');
create type public.addon_fulfillment_status as enum ('pending','prepared','handed_over','cancelled');
create type public.payment_provider         as enum ('midtrans','manual');
create type public.payment_method           as enum ('qris','virtual_account','manual_transfer','cash');
create type public.payment_status           as enum ('initiated','pending','needs_review','settled','denied','failed','cancelled','expired','refunded','partially_refunded','disputed','duplicate');
create type public.quotation_status         as enum ('issued','accepted','expired','superseded','void');
create type public.invoice_status           as enum ('issued','paid','void');
create type public.ticket_status            as enum ('issued','used','suspended','revoked','expired');
create type public.scan_phase               as enum ('validate','check_in');
create type public.scan_result              as enum ('ok','invalid_signature','not_found','already_used','suspended','revoked','wrong_rw','wrong_date','outside_window','booking_not_paid','ticket_expired','forbidden');
create type public.certificate_kind         as enum ('group','participant');
create type public.certificate_status       as enum ('issued','revoked');
create type public.review_status            as enum ('pending','published','rejected');
create type public.gallery_category         as enum ('activity','umkm','visit','event');
create type public.media_type               as enum ('image','video');
create type public.article_category         as enum ('news','education','announcement');
create type public.booklet_kind             as enum ('ebooklet','visit_proposal','price_list');
create type public.activity_point_type      as enum ('bank_sampah','composter','maggot','urban_farming','pkk_craft','sanggar','culture_house','stage','dolanan_area','umkm_stall','meeting_point','other');
create type public.schedule_type            as enum ('dance_performance','dolanan_session','workshop','art_class','other');
create type public.revenue_rule_scope       as enum ('package_default','addon_default','package','product');
create type public.revenue_beneficiary      as enum ('kelurahan','rw_treasury','umkm_vendor');
create type public.revenue_entry_type       as enum ('settlement','reversal','adjustment');
create type public.adjustment_type          as enum ('manual_mark_paid','manual_refund','write_off','reclassify_share','pax_correction');
create type public.adjustment_status        as enum ('proposed','approved','rejected','applied');
create type public.notification_channel     as enum ('whatsapp','email');
create type public.notification_status      as enum ('queued','sending','sent','delivered','read','failed','cancelled');
create type public.notification_template    as enum ('phone_otp','booking_created','quotation_ready','payment_reminder','payment_received_ticket','booking_expired','booking_cancelled','visit_reminder_d1','checked_in_thanks','certificate_ready','review_invite','refund_processed','admin_new_paid_booking','admin_booking_needs_review','security_alert');
create type public.document_kind            as enum ('quotation','invoice','receipt','credit_note','certificate');
create type public.otp_purpose              as enum ('booking_phone','dsr_identity');
create type public.export_kind              as enum ('visits','attendance','finance','audit');
create type public.alert_severity           as enum ('info','medium','high','critical');
