-- The activity points of RW 08's new programme, Kampung Inklusif & Ramah Anak (decision of 2026-10-21, Task
-- P2.10.01): Semar Cakep is an inclusion centre and Ketan Ronggolawe a child-friendly space, which none of the waste
-- and arts types of 0002 describe. They sit before the types every RW shares, so each programme's types stay
-- together. A new enum value cannot be used in the transaction that adds it, so nothing else happens here.
alter type public.activity_point_type add value 'inclusion_center' before 'umkm_stall';
alter type public.activity_point_type add value 'child_friendly_space' before 'umkm_stall';
