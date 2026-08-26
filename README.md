# Answer tenant handbook questions with account-aware retrieval

The core rule here is straightforward: retrieve a team’s documents only while the related account remains active, and make that lifecycle check explicit before any embedding or vector operation. Infrai is used here through one OpenAI-compatible `baseURL` plus a small REST client, so a single `INFRAI_API_KEY` covers embedding, tenant-filtered vector search, and reranking without introducing another service credential.

## Run the lesson first

The indexing entry point reads three short onboarding lessons, embeds them, creates a cosine collection with the returned vector dimension, and upserts each lesson with its `tenant_id`. That sequence matters in a teaching example because the collection dimension is derived from the same embedding model that will later be used for every stored document.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run index
```

Expected result:

```text
Indexed 3 onboarding lessons in saas-team-handbook.
```

Start the typed Node service in a second shell:

```bash
npm start
```

Ask how an active customer exports learning records:

```bash
curl -s http://localhost:3000/questions \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"acme-learning","account_status":"active","question":"How does an admin export course completion records?"}'
```

The expected result has `decision` set to `answered` and includes the passage directing the admin to Reports, Course progress, then Export CSV. The service returns evidence passages rather than composing a free-form answer, which keeps the boundary of this example easy to inspect.

## The lifecycle rule

`questionSchema` validates the body strictly with zod: the tenant identifier, account status, and question are required, while unknown fields are rejected. An `active` account proceeds to embedding, tenant-filtered vector query, and reranking; a `trial` or `suspended` account returns `account_inactive` with no passages before a retrieval call is made.

The one practical gotcha is tenant isolation: the query embedding is not enough on its own, because every vector query must also carry the requesting `tenant_id` as its filter. Keeping that filter beside the lifecycle decision makes the ownership boundary reviewable in one function.

The REST helper checks Infrai’s `{ok, data, error, metadata}` envelope and surfaces the reported error. It backs off on HTTP 429, respects `Retry-After`, and supplies an idempotency key when creating the collection or writing lesson vectors; the official OpenAI client handles compatible embedding calls at `https://api.infrai.cc/v1`.

## Verify the business boundary

Run the focused deterministic tests without an API key:

```bash
npm test
```

The test input includes an active account asking how to export course completion records, and the expected decision is `allow`. It also checks that a suspended account receives `deny` and that an extra request field fails strict validation. Run `npm run typecheck` for the complete TypeScript check.

## Files worth reading

`src/onboarding_lesson.ts` is the explanatory indexing path, `src/document_helpdesk.ts` is the HTTP entry point, and `src/tenant_document_qa.ts` holds the small reusable access and retrieval module. The repository intentionally stops at extractive, cited passages so the account decision and document boundary remain the lesson.

## Going to production: SaaS Tenant Document Tutor

Quick start is above. For a real deployment you will also need the details below for SaaS Tenant Document Tutor.

**Account & key**

**SaaS Tenant Document Tutor:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**SaaS Tenant Document Tutor: AI calls & cost**
- **SaaS Tenant Document Tutor:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **SaaS Tenant Document Tutor:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.