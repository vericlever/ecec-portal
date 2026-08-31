-- seed/0006_reset_test_signoffs.sql
-- DEV. Clears the sign-offs left behind by Claude's testing so the accounts
-- start from zero. Safe to run any time you want a clean slate.

delete from public.sign_offs;

select count(*) as remaining_signoffs from public.sign_offs;
