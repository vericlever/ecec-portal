-- 0023_signoff_type_self_and_manager.sql
--
-- Correcting the SOP sign-off model. There are two levels:
--   self             - the staff member signs off on their own
--   self_and_manager - the staff member signs AND a manager co-signs
--
-- The second level was named 'supervisor', which read as "a supervisor signs
-- instead of the staff member". It never meant that: the staff sign-off always
-- happens, and for high-consequence SOPs (medication, manual handling,
-- anaphylaxis and so on) a manager countersigns on top. The sign_offs table
-- already carries verified_by for that countersignature.

alter type public.signoff_type rename value 'supervisor' to 'self_and_manager';
