# SKILL-6 / SUB-TASK-1 — Auth.js Google OIDC + nulogic.io hd check + deterministic identity mapping + session gate

**Parent:** SKILL-6 · **Component:** Auth & Identity service · **Repo:** ai-nu-skillsync
**Gaps:** TD-AUTH-01, TD-AUTH-02, TD-AUTH-03, TD-AUTH-04

## Pseudocode

1. **Mount Auth.js Google provider** (`app/api/auth/[...nextauth]/route.ts`, ADR-001, Page 02 §3.2/§4.7):
   - Configure the Google OIDC provider; client id/secret + auth secret read from env (`.env.example` placeholders only — BR-10).
   - In the **sign-in callback**, read the `id_token` claims (`email`, `hd`, `sub`). **`hd` check:** if `hd != "nulogic.io"` → return `false` (no session) and surface "Sign-in is restricted to NULogic accounts. Please use your @nulogic.io Google account." (AC-15/BR-13).
2. **Deterministic identity mapping** (`lib/auth/resolveIdentity.ts`, BR-13a, Page 03 §4.7/§5):
   - Compute `syntheticHandle = opaque(sub)` (a stable opaque derivation of the OIDC `sub` — NOT the email). Look up `IdentityMapping` by `syntheticHandle @unique` → resolve to the seeded synthetic `Employee` profile + role.
   - **Discard the real email/name** immediately after the `hd` check — never persist or log it (P3). If no mapping entry exists, apply the demo policy (designated synthetic profile or restricted-access message) — only synthetic data is ever persisted.
   - Put `{ profileId, role }` (synthetic) into the session; land the user on their role-appropriate home (AC-14).
3. **Session gate** (`proxy.ts`, ADR-006, Page 02 §3.3): match protected paths (exclude `/api/auth`, static, sign-in). On a valid session → forward with the identity context. On an expired/invalid session → redirect to sign-in, serve no protected data, and ensure no in-flight action writes under the stale identity (AC-24/BR-20). Await `cookies()`/`headers()` (Next.js 16 async APIs).

## Implementation Contract

- **GOAL:** Real Google sign-in restricted to nulogic.io, mapping each identity deterministically to a synthetic profile/role by an opaque handle with zero real PII persisted, plus a session gate that redirects expired sessions without serving protected data or writing under a stale identity.
- **CONSTRAINTS:**
  - Per **ADR-001 / BR-13 / AC-15**, the `hd == nulogic.io` check is enforced in the sign-in callback; a non-matching account gets **no session**.
  - Per **BR-13a / ADR-005 / Page 03 §5**, the mapping is keyed by a synthetic handle (opaque from `sub`), never the real email/PII; the real email is used only for the `hd` check and discarded; persist only synthetic data.
  - Per **ADR-006 / Next.js 16**, the gate is `proxy.ts` (not `middleware.ts`); `cookies()`/`headers()` are awaited — read `node_modules/next/dist/docs/` before writing.
  - Per **BR-10 / AC-13**, OAuth secrets come from env; `.env.example` carries placeholders only; logs carry only synthetic ids.
- **FORMAT:** `app/api/auth/[...nextauth]/route.ts`, `lib/auth/resolveIdentity.ts`, `proxy.ts`, `auth.config.ts`. Reuses the seeded `IdentityMapping` (SKILL-1).

## Data Models

- **Prisma:** `IdentityMapping` (`syntheticHandle @unique`, `employeeId` FK — Page 03 §4.7); `Employee` (`role`, `leadId`).
- **Session shape:** `{ profileId: string /* synthetic */, role: "ADMIN"|"MANAGER"|"PRACTICE_LEAD"|"EMPLOYEE" }` — no email/name.
- **Route Handler:** `/api/auth/[...]` (Auth.js-owned); `proxy.ts` gate. Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET` (placeholders in `.env.example`).

## Error Handling

1. **`hd != nulogic.io`:** sign-in callback returns false; no session created; spec'd restricted-access message (AC-15).
2. **No `IdentityMapping` for the handle:** apply the demo policy (designated synthetic profile or restricted-access message); never persist real identity data (BR-13a).
3. **Expired/invalid session on a protected route:** `proxy.ts` redirects to sign-in; serves no protected data; in-flight unsaved work is not written under the stale identity (AC-24/BR-20).
4. **Missing OAuth env vars:** fail fast at startup with a clear config error; never fall back to a hardcoded secret (BR-10).
5. **Google returns no `hd` claim** (personal account): treat as non-NULogic → reject (AC-15).

## Failure Conditions (testable defects)

1. A non-nulogic.io account obtains a session → AC-15/BR-13 security violation.
2. The real email or name is persisted or logged anywhere → AC-13/AC-14/BR-13a no-PII violation.
3. The same authenticated identity resolves to different synthetic profiles across sessions → AC-14 determinism violation.
4. An expired session still serves protected data or writes under the stale identity → AC-24/BR-20 violation.
5. The gate is implemented as `middleware.ts` or uses sync `cookies()`/`headers()` → ADR-006/Next.js 16 violation (build breakage).
