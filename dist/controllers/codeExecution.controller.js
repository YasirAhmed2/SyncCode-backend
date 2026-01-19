import { executePistonCode } from "../services/piston.service.js";
export const runCode = async (req, res) => {
    try {
        const { code, language, input } = req.body;
        const result = await executePistonCode(code, language, input || "");
        return res.json({
            stdout: result.run.stdout,
            stderr: result.run.stderr,
            exitCode: result.run.code,
        });
    }
    catch (error) {
        console.error("EXECUTION ERROR:", error?.response?.data || error.message);
        return res.status(500).json({ message: "Failed to execute code" });
    }
};
