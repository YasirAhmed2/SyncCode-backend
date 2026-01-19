import axios from "axios";
const PISTON_URL = "https://emkc.org/api/v2/piston/execute";
const DEFAULT_VERSIONS = {
    python: "3.10.0",
    javascript: "18.15.0",
};
export const executePistonCode = async (code, language, stdin = "") => {
    const version = DEFAULT_VERSIONS[language];
    if (!version) {
        throw new Error("Unsupported language");
    }
    const response = await axios.post(PISTON_URL, {
        language,
        version,
        files: [
            {
                content: code,
            },
        ],
        stdin,
    });
    return response.data;
};
