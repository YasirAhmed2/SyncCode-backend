import { verifyToken } from "../utils/jwt.utils.js";
export const authenticate = (req, res, next) => {
    const token = req.cookies["auth_jwt"];
    console.log("Received token:", token);
    if (!token) {
        return res.status(401).json({ message: "Not authorized" });
    }
    try {
        const decoded = verifyToken(token);
        req.user = { userId: decoded.userId };
        console.log("Decoded payload:", decoded);
        next();
    }
    catch (error) {
        return res.status(401).json({ message: "Invalid token" });
    }
};
