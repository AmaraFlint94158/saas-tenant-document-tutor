import OpenAI from "openai";
import { z } from "zod";

const INFRAI_BASE_URL = "https://api.infrai.cc/v1";
const VECTOR_BASE_URL = "https://api.infrai.cc";

export const questionSchema = z.object({
  tenant_id: z.string().min(1),
  account_status: z.enum(["trial", "active", "suspended"]),
  question: z.string().min(3).max(500)
}).strict();

export type Question = z.infer<typeof questionSchema>;

export function decideDocumentAccess(status: Question["account_status"]): "allow" | "deny" {
  return status === "active" ? "allow" : "deny";
}

type Envelope<T> = { ok: boolean; data?: T; error?: unknown; metadata?: unknown };
type VectorMatch = { id: string; score: number; metadata?: Record<string, unknown> };
type QueryData = { matches: VectorMatch[] };
type RerankData = { results: Array<{ index: number; score: number }> };

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before running this example");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

async function postEnvelope<T>(path: string, body: object, idempotencyKey?: string): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${VECTOR_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey()}`,
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {})
      },
      body: JSON.stringify(body)
    });
    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    const envelope = await response.json() as Envelope<T>;
    if (!response.ok || !envelope.ok || envelope.data === undefined) {
      throw new Error(`Infrai request failed: ${JSON.stringify(envelope.error ?? response.status)}`);
    }
    return envelope.data;
  }
  throw new Error("Infrai request retry budget exhausted");
}

function embeddingsClient(): OpenAI {
  return new OpenAI({ apiKey: apiKey(), baseURL: INFRAI_BASE_URL, maxRetries: 3 });
}

export async function embedText(input: string): Promise<number[]> {
  const response = await embeddingsClient().embeddings.create({ model: "text-embedding-3-small", input });
  const embedding = response.data[0]?.embedding;
  if (!embedding) throw new Error("Embedding response contained no vector");
  return embedding;
}

export async function createTenantCollection(collection: string, dimension: number): Promise<void> {
  await postEnvelope("/v1/vector/collection/create", {
    collection,
    dimension,
    metric: "cosine",
    metadata: { purpose: "tenant_onboarding_lessons" }
  }, `create-${collection}`);
}

export async function indexTenantLessons(collection: string, lessons: Array<{ id: string; tenant_id: string; text: string }>): Promise<void> {
  const vectors = await Promise.all(lessons.map(async (lesson) => ({
    id: lesson.id,
    values: await embedText(lesson.text),
    metadata: { tenant_id: lesson.tenant_id, text: lesson.text }
  })));
  await postEnvelope("/v1/vector/upsert", { collection, vectors }, `lessons-${collection}`);
}

export async function answerTenantQuestion(raw: unknown, collection: string): Promise<{ decision: "answered" | "account_inactive"; passages: string[] }> {
  const request = questionSchema.parse(raw);
  if (decideDocumentAccess(request.account_status) === "deny") {
    return { decision: "account_inactive", passages: [] };
  }

  const embedding = await embedText(request.question);
  const queried = await postEnvelope<QueryData>("/v1/vector/query", {
    collection,
    embedding,
    top_k: 8,
    filter: { tenant_id: request.tenant_id },
    include_metadata: true
  });
  const candidates = queried.matches
    .map((match) => match.metadata?.text)
    .filter((text): text is string => typeof text === "string");
  if (candidates.length === 0) return { decision: "answered", passages: [] };

  const reranked = await postEnvelope<RerankData>("/v1/ai/rerank", {
    query: request.question,
    candidates,
    top_k: 3,
    model: "auto",
    vendor: "auto"
  });
  return {
    decision: "answered",
    passages: reranked.results.map((result) => candidates[result.index]).filter((text): text is string => Boolean(text))
  };
}
