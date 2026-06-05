# SKILL-2 / SUB-TASK-1 — Certificate upload handler, parse prompt, schema & idempotency

**Parent:** SKILL-2 · **Component:** Upload service + Claude integration · **Repo:** ai-nu-skillsync
**Gaps:** TD-CERT-01, TD-DATA-05

## Pseudocode

1. **Implement `POST /api/uploads/certificate`** (Route Handler, multipart):
   - Re-derive session + own-profile scope server-side (await `cookies()` — Next.js 16 async). Reject if not the owning employee.
   - Read the file from `FormData`; compute `contentHash = sha256(bytes)`.
   - **Idempotency fast path:** `find Certificate by (employeeId, contentHash)`; if found → return `{ uploadId: existing.id, extracted: existing.parsedJson, deduped: true }` WITHOUT re-parsing (AC-23).
2. **Parse on a new file:** call `callClaude({ promptName: "parse-certificate", variables: { fileRef }, schema: CertParseResult, complexity: "routine" })` (Sonnet).
3. **Gate the result:**
   - If `Failure` OR `result.confidence < CONFIDENCE_THRESHOLD` → return `400`-style typed failure carrying the user message *"We couldn't reliably read this certificate…"*; write NOTHING; the item stays in-progress (AC-03).
   - Else persist a `Certificate` row (`employeeId`, `fileName`, `contentHash`, `rawText?`, `parsedJson = result`) — relying on `@@unique([employeeId, contentHash])` as the race-safe backstop; on a unique-violation race, read back the winner's row (AC-23). Return `{ uploadId, extracted: result.skills }` for the confirm step.
4. **Author `src/prompts/parse-certificate.ts`** — instruct extraction of `{ skills:[{skill, level?}], issuer, date?, confidence }`; multi-skill allowed (AC-02); confidence 0..1. **Define `CertParseResult`** Zod schema in `src/schemas/` per Page 02 §2.5; `skills` length ≥1; `confidence` number.

## Implementation Contract

- **GOAL:** Receive a certificate, dedupe by content hash, parse via Claude into a validated `CertParseResult`, gate on confidence, and return the extraction for confirmation — writing nothing on failure.
- **CONSTRAINTS:**
  - Per **ADR-004**, uploads are Route Handlers (not Server Actions); parse→confirm→write split; demo-local file storage only.
  - Per **ADR-003 / BR-09 / BR-02 / P2**, parsing is the single Claude boundary with a Zod gate; failure/low-confidence ⇒ typed failure, no write.
  - Per **ADR-004 / BR-19 / TS-004**, idempotency is DB-enforced via `@@unique([employeeId, contentHash])`, with the app-layer check as the fast path.
  - Per **ADR-006 / Next.js 16**, `cookies()` is awaited; multipart handled at the request edge.
- **FORMAT:** `app/api/uploads/certificate/route.ts`; `src/prompts/parse-certificate.ts`; `src/schemas/cert.ts` (`CertParseResult`); a `lib/hash.ts` content-hash util; a config'd `CONFIDENCE_THRESHOLD`.

## Data Models

- **Endpoint:** `POST /api/uploads/certificate` (multipart) → `{ uploadId, extracted, deduped? }` or typed failure.
- **Zod:** `CertParseResult { skills:[{skill:string, level?:string}], issuer:string, date?:string, confidence:number }`.
- **Prompt:** `parse-certificate` (Sonnet).
- **Prisma:** `Certificate(employeeId, fileName, contentHash, rawText?, parsedJson)` with `@@unique([employeeId, contentHash])`.

## Error Handling

1. **Claude unreachable / SDK throws:** wrapper returns `Failure` → handler returns the *"couldn't reliably read…"* message; no `Certificate` row written; HTTP non-2xx with a typed body.
2. **`safeParse` fails (garbled/extra fields):** treated as parse failure (AC-03); nothing written.
3. **`confidence < threshold`:** treated as failure even though JSON validated; nothing written; item stays in-progress.
4. **Duplicate content hash (double-submit / concurrent):** fast path or `@unique` race → return prior `uploadId`, no re-parse, no new row (AC-23).
5. **Non-cert / unreadable file (e.g. not-a-cert.png):** Claude returns low confidence or unparseable → failure path; no write.

## Failure Conditions (testable defects)

1. A low-confidence parse results in a persisted `Certificate` or any `EmployeeSkill` write → BR-02/AC-03 violation.
2. Uploading the same file twice creates two `Certificate` rows → BR-19/AC-23 violation.
3. A multi-skill cert returns only the first skill (schema or prompt drops the array) → AC-02 violation.
4. The handler accepts a client-sent `employeeId` and writes to another user's profile → authorization violation.
5. Parsing succeeds but the model id is hardcoded (not routed via config) → BR-12 violation.
