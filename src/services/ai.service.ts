/**
 * AiService
 * ──────────
 * The only file that talks to an LLM provider. Swap providers here and the
 * rest of the RAG pipeline does not change.
 *
 * Default provider: Google Gemini REST API (free tier), called with axios so
 * no new SDK dependency is needed.
 *
 * Required env:
 *   GEMINI_API_KEY        — https://aistudio.google.com/apikey
 * Optional env:
 *   GEMINI_EMBED_MODEL    — default "text-embedding-004" (768 dims)
 *   GEMINI_CHAT_MODEL     — default "gemini-2.0-flash"
 */

import axios from "axios";
import "dotenv/config";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || "text-embedding-004";
const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-2.0-flash";

// Gemini allows up to 100 requests per batchEmbedContents call; stay well under.
const EMBED_BATCH_SIZE = 50;

const apiKey = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env before using the AI tutor."
    );
  }
  return key;
};

const describeAxiosError = (err: any, what: string) => {
  const status = err?.response?.status;
  const detail =
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    err?.message ||
    "unknown error";
  return new Error(`[AI] ${what} failed${status ? ` (${status})` : ""}: ${detail}`);
};

/**
 * Embed many texts at once (used when ingesting a document).
 * taskType RETRIEVAL_DOCUMENT tells the model these are haystack passages.
 */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);

    try {
      const { data } = await axios.post(
        `${API_BASE}/${EMBED_MODEL}:batchEmbedContents?key=${apiKey()}`,
        {
          requests: batch.map((text) => ({
            model: `models/${EMBED_MODEL}`,
            content: { parts: [{ text }] },
            taskType: "RETRIEVAL_DOCUMENT",
          })),
        },
        { timeout: 60_000 }
      );

      const embeddings = data?.embeddings || [];
      if (embeddings.length !== batch.length) {
        throw new Error(
          `expected ${batch.length} embeddings, got ${embeddings.length}`
        );
      }

      for (const e of embeddings) out.push(e.values as number[]);
    } catch (err) {
      throw describeAxiosError(err, "embedDocuments");
    }
  }

  return out;
}

/**
 * Embed a single student question.
 * taskType RETRIEVAL_QUERY is the needle side of the same space.
 */
export async function embedQuery(text: string): Promise<number[]> {
  try {
    const { data } = await axios.post(
      `${API_BASE}/${EMBED_MODEL}:embedContent?key=${apiKey()}`,
      {
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_QUERY",
      },
      { timeout: 30_000 }
    );

    const values = data?.embedding?.values;
    if (!Array.isArray(values)) throw new Error("no embedding in response");
    return values as number[];
  } catch (err) {
    throw describeAxiosError(err, "embedQuery");
  }
}

/**
 * One-shot text generation. `prompt` already contains the retrieved context.
 */
export async function generateAnswer(prompt: string): Promise<string> {
  try {
    const { data } = await axios.post(
      `${API_BASE}/${CHAT_MODEL}:generateContent?key=${apiKey()}`,
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      },
      { timeout: 60_000 }
    );

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p?.text || "")
      .join("")
      .trim();

    if (!text) {
      const blocked = data?.promptFeedback?.blockReason;
      throw new Error(
        blocked ? `response blocked (${blocked})` : "empty response from model"
      );
    }

    return text;
  } catch (err) {
    throw describeAxiosError(err, "generateAnswer");
  }
}

export const aiConfig = { EMBED_MODEL, CHAT_MODEL };
