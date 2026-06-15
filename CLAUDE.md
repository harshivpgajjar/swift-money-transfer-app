@AGENTS.md
@docs/PROJECT_CONTEXT.md

# Swift Money — start here

Read `docs/PROJECT_CONTEXT.md` in full before changing anything. It explains the
architecture, the EOD-authoritative balance model, the file formats, the
notification/push system, deployment, and the non-obvious gotchas.

Quick reminders:
- One Supabase project (`rpcpoczwgishuywxpgpl`). Rules that must hold for both
  web and mobile live in the DB (RLS / triggers / RPCs), because mobile writes
  directly.
- After changing any source row, call `recompute_balances(retailer, account)`
  and re-verify the org outstanding total.
- i18n keys go in BOTH `src/lib/i18n-dict.ts` and `mobile/lib/i18n.tsx`, in all
  three locales (en/hi/gu).
- Never `export type` from a `"use server"` file.
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, Google keys) are NOT in the repo — set
  `/.env.local` from Vercel/Supabase settings. See PROJECT_CONTEXT §11.
