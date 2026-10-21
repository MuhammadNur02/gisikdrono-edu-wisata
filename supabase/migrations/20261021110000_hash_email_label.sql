-- The keyed email hash of login_attempts names its use before the address, as every hash under OTP_PEPPER now does
-- (src/lib/pepper.ts), so it can never equal a hash the server makes of the same text for another purpose (review
-- of PR #20). Rows hashed the old way stop counting, which costs nothing: the lockout looks back 15 minutes, and no
-- production data exists yet. 0004_functions.sql stays as applied; this replaces only the function's body.
create or replace function internal.hash_email(p_email text) returns text
  language sql stable security definer
  set search_path = ''
as $$
  select encode(
    extensions.hmac(
      convert_to(E'gsk-login-email-v1\n' || lower(btrim(p_email)), 'utf8'),
      convert_to((select decrypted_secret from vault.decrypted_secrets where name = 'otp_pepper'), 'utf8'),
      'sha256'
    ),
    'hex'
  );
$$;
revoke execute on function internal.hash_email(text) from public, anon, authenticated;
