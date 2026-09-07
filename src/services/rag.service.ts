import RagDocument from "@/models/document.mongo.js";
import DocumentChunk from "@/models/documentChunk.mongo.js";
import { embedDocuments, embedQuery, generateAnswer } from "@/services/ai.service.js";

const MIN_SCORE = parseFloat(process.env.RAG_MIN_SCORE || "0.5");
const TOP_K = 4;

/**
 * Computes cosine similarity between two numerical vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Splits plain text into overlapping chunks respecting natural paragraph and sentence breaks.
 */
function chunkText(text: string, chunkSize = 800, overlap = 150): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];

  if (cleaned.length <= chunkSize) {
    return [cleaned];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < cleaned.length) {
    let end = start + chunkSize;
    if (end >= cleaned.length) {
      const lastChunk = cleaned.slice(start).trim();
      if (lastChunk.length > 0) chunks.push(lastChunk);
      break;
    }

    // Attempt to break at paragraph, line, sentence, or word boundary
    let breakPoint = cleaned.lastIndexOf("\n\n", end);
    if (breakPoint <= start || breakPoint < end - 200) {
      breakPoint = cleaned.lastIndexOf("\n", end);
    }
    if (breakPoint <= start || breakPoint < end - 200) {
      breakPoint = cleaned.lastIndexOf(". ", end);
      if (breakPoint > start) breakPoint += 1;
    }
    if (breakPoint <= start || breakPoint < end - 200) {
      breakPoint = cleaned.lastIndexOf(" ", end);
    }
    if (breakPoint <= start) {
      breakPoint = end;
    }

    const chunk = cleaned.slice(start, breakPoint).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    start = Math.max(breakPoint - overlap, start + 1);
  }

  return chunks;
}

/**
 * Chunks a document's extracted text, embeds each chunk, and saves chunks to MongoDB.
 * Updates RagDocument status to 'ready' on completion or 'failed' on error.
 */
export async function ingestDocument(
  documentId: string,
  roomId: string,
  text: string
): Promise<void> {
  try {
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      throw new Error("No readable text content extracted from document.");
    }

    const embeddings = await embedDocuments(chunks);

    // Clean up any existing chunks for this document
    await DocumentChunk.deleteMany({ documentId });

    const chunkDocs = chunks.map((content, index) => ({
      roomId,
      documentId,
      chunkIndex: index,
      content,
      embedding: embeddings[index],
    }));

    await DocumentChunk.insertMany(chunkDocs);

    await RagDocument.findByIdAndUpdate(documentId, {
      status: "ready",
      chunkCount: chunks.length,
      error: null,
    });

    console.log(`[RAG] Document ${documentId} indexed successfully (${chunks.length} chunks).`);
  } catch (err: any) {
    console.error(`[RAG] Failed to ingest document ${documentId}:`, err);
    await RagDocument.findByIdAndUpdate(documentId, {
      status: "failed",
      error: err?.message || "Failed to process document",
    });
  }
}

/**
 * Removes a document and all of its associated chunks from the database.
 */
export async function deleteDocument(documentId: string): Promise<void> {
  await Promise.all([
    DocumentChunk.deleteMany({ documentId }),
    RagDocument.findByIdAndDelete(documentId),
  ]);
}

/**
 * Answers a user's question by performing semantic search over the room's document chunks
 * and generating a grounded answer using Gemini.
 */
export async function askQuestion(
  roomId: string,
  question: string
): Promise<{
  answer: string;
  sources: Array<{ title: string; chunkIndex: number; score: number }>;
  grounded: boolean;
}> {
  const chunks = await DocumentChunk.find({ roomId })
    .select("+embedding content chunkIndex documentId")
    .populate<{ documentId: { _id: any; title: string } }>("documentId", "title")
    .lean();

  if (!chunks || chunks.length === 0) {
    return {
      answer:
        "No study materials have been uploaded to this room yet. Ask your instructor to upload documents first.",
      sources: [],
      grounded: false,
    };
  }

  const queryEmbedding = await embedQuery(question);

  const scored = chunks
    .map((chunk) => {
      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      const title = (chunk.documentId as any)?.title || "Course Material";
      return {
        title,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        score: Number(score.toFixed(4)),
      };
    })
    .sort((a, b) => b.score - a.score);

  const topScore = scored[0]?.score ?? 0;
  if (topScore < MIN_SCORE) {
    return {
      answer:
        "I can only answer questions related to the materials provided for this room. This topic doesn't appear to be covered in the uploaded course documents.",
      sources: [],
      grounded: false,
    };
  }

  const relevant = scored.filter((c) => c.score >= MIN_SCORE).slice(0, TOP_K);
  const sources = relevant.map(({ title, chunkIndex, score }) => ({
    title,
    chunkIndex,
    score,
  }));

  const contextText = relevant
    .map((c) => `[Source: ${c.title}, Chunk ${c.chunkIndex}]\n${c.content}`)
    .join("\n\n---\n\n");

  const prompt = `You are a helpful and accurate AI teaching assistant for this classroom.
Answer the student's question based strictly on the provided course material excerpts below.
If the excerpts do not contain enough information to fully answer the question, state what is known from the text and acknowledge what is not mentioned.
Do not hallucinate facts outside the provided excerpts.
Match the student's language (for example, if asked in Urdu or Hinglish, reply naturally in that style).

Course Material Context:
${contextText}

Student Question:
${question}

Answer:`;

  const answer = await generateAnswer(prompt);

  return {
    answer,
    sources,
    grounded: true,
  };
}
