# Closed Beta Access

Whistle Keeper's login page sends OTP codes and magic links only to existing Auth users. New beta testers should request access, then an owner/admin should send an invitation from Admin.

For this to be a real closed beta, Supabase must also block direct signups:

1. Open Supabase Dashboard.
2. Go to Authentication settings.
3. Disable new-user signups.
4. Keep email OTP and magic links enabled for invited users.

The dashboard setting matters because Supabase's project URL and publishable key are necessarily available to the browser. Without disabling signups, someone could bypass Whistle Keeper's login page and call the public Auth API directly.

Before opening public registration later, replace this restriction with an explicit approved-access or paid-entitlement gate that is enforced server-side and in RLS.
