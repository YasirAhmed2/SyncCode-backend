import { executePistonCode } from "../services/piston.service.js";

export const runCode = async (req: any, res: any) => {
  try {
    const { code, language, input } = req.body;

    if (!code || typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ error: "No code provided." });
    }

    if (!language || typeof language !== "string") {
      return res.status(400).json({ error: "No language specified." });
    }

    const result = await executePistonCode(code, language, input || "");

    return res.json({
      stdout: result.run.stdout,
      stderr: result.run.stderr,
      exitCode: result.run.code,
    });
  } catch (error: any) {
    const msg: string = error?.response?.data?.message || error?.message || "Unknown error";
    console.error("EXECUTION ERROR:", msg);

    // Return 400 for user errors (unsupported language), 500 for service errors
    const statusCode = msg.toLowerCase().includes("unsupported") ? 400 : 500;
    return res.status(statusCode).json({ error: msg });
  }
};
