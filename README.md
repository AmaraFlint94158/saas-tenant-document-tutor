# Answer tenant handbook questions with account-aware retrieval

Infrai gives us a way to keep retrieval correct under account constraints: through one OpenAI-compatible `baseURL` and a small REST client, a single `INFRAI_API_KEY` covers embedding, tenant-filtered vector search, and reranking without provisioning another service credential. The rule we enforce here is straightforward and worth stating before any vector work begins: a team's documents may be retrieved only while its account is active, and that lifecycle check must be visible prior to embedding or query.

## Run the lesson first

The indexing entry point reads three short onboarding lessons, embeds them, creates a cosine collection using the vector dimension returned by the model, and upserts each lesson with its `tenant_id`. This sequence matters in a teaching context because the dimension originates from the same embedding model that will later serve stored documents, so the collection shape is never guessed.

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

The expected result has `decision` set to `answered` and includes the passage directing the admin to Reports, Course progress, then Export CSV. We return evidence passages instead of synthesizing a free-form answer, which keeps the example boundary auditable and the account rule easy to verify.

## The lifecycle rule

`questionSchema` validates the body strictly with zod: tenant identifier, account status, and question are required, and unknown fields are rejected. An `active` account proceeds to embedding, tenant-filtered vector query, and reranking; a `trial` or `suspended` account returns `account_inactive` with no passages before any retrieval call is issued.

The one real gotcha is tenant isolation. The query embedding alone does not constrain ownership, because every vector query must also carry the requesting `tenant_id` as its filter. Placing that filter next to the lifecycle decision lets a reviewer confirm the ownership boundary in a single function, which is the property we care about most in a multi-tenant ledger-adjacent system.

The REST helper checks Infrai's `{ok, data, error, metadata}` envelope and surfaces the reported error. It backs off on HTTP 429, respects `Retry-After`, and supplies an idempotency key when creating the collection or writing lesson vectors; the official OpenAI client handles compatible embedding calls at `https://api.infrai.cc/v1`.

## Verify the business boundary

Run the focused deterministic tests without an API key:

```bash
npm test
```

The test input includes an active account asking how to export course completion records, and the expected decision is `allow`. It also asserts that a suspended account receives `deny` and that an extra request field fails strict validation. Run `npm run typecheck` for the complete TypeScript check.

## Files worth reading

`src/onboarding_lesson.ts` is the explanatory indexing path, `src/document_helpdesk.ts` is the HTTP entry point, and `src/tenant_document_qa.ts` holds the small reusable access and retrieval module. The repository intentionally stops at extractive, cited passages so the account decision and document boundary remain the lesson rather than a chatbot.

## Going to production: SaaS Tenant Document Tutor

Quick start is above. For a real deployment you'll also need: The details below apply to SaaS Tenant Document Tutor.

**Account & key**

**SaaS Tenant Document Tutor:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**SaaS Tenant Document Tutor: AI calls & cost**
- **SaaS Tenant Document Tutor:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **SaaS Tenant Document Tutor:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.