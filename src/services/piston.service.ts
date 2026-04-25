import axios from "axios";

/**
 * Judge0 CE public instance — https://ce.judge0.com
 * Free, no API key required for basic use.
 * Replaces the now-whitelist-only Piston API (deprecated Feb 2026).
 *
 * Language IDs (Judge0):
 *   93  = JavaScript (Node.js 18.15.0)
 *   92  = Python (3.11.2)
 *   74  = TypeScript (3.7.4)
 *   62  = Java (OpenJDK 13.0.1)
 *   54  = C++ (GCC 9.2.0)
 *   50  = C (GCC 9.2.0)
 */

const JUDGE0_BASE = "https://ce.judge0.com";

const LANGUAGE_IDS: Record<string, number> = {
  javascript: 93,
  python: 92,
  typescript: 94,
  java: 62,
  cpp: 54,
  c: 50,
  go: 95,
  rust: 73,
};

export interface ExecutionResult {
  run: {
    stdout: string;
    stderr: string;
    code: number;
  };
}

export const executePistonCode = async (
  code: string,
  language: string,
  stdin = ""
): Promise<ExecutionResult> => {
  const langKey = language.toLowerCase().trim();
  const languageId = LANGUAGE_IDS[langKey];

  if (!languageId) {
    throw new Error(`Unsupported language: "${language}". Supported: ${Object.keys(LANGUAGE_IDS).join(", ")}`);
  }

  // ── STEP 1: Submit the code ──────────────────────────────────────────────
  const submitRes = await axios.post(
    `${JUDGE0_BASE}/submissions?base64_encoded=false&wait=false`,
    {
      source_code: code,
      language_id: languageId,
      stdin: stdin || "",
    },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 10_000,
    }
  );

  const token: string = submitRes.data?.token;
  if (!token) {
    throw new Error("Judge0 did not return a submission token.");
  }

  // ── STEP 2: Poll until finished (max ~10 s, polling every 800 ms) ────────
  let attempts = 0;
  const maxAttempts = 12;

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    attempts++;

    const pollRes = await axios.get(
      `${JUDGE0_BASE}/submissions/${token}?base64_encoded=false&fields=status,stdout,stderr,exit_code,compile_output`,
      { timeout: 10_000 }
    );

    const { status, stdout, stderr, exit_code, compile_output } = pollRes.data;

    // Status IDs: 1 = In Queue, 2 = Processing, 3 = Accepted, others = error
    if (status?.id <= 2) {
      // Still queued/running — keep polling
      continue;
    }

    // Build a unified stderr that includes compile errors if any
    const fullStderr = [compile_output, stderr].filter(Boolean).join("\n").trim();

    return {
      run: {
        stdout: (stdout || "").trimEnd(),
        stderr: fullStderr,
        code: exit_code ?? (status?.id === 3 ? 0 : 1),
      },
    };
  }

  throw new Error("Execution timed out waiting for Judge0 response.");
};
