import jwt from "jsonwebtoken";
import "dotenv/config";
const PRIVATE_KEY = process.env.JWT_SECRET;
export const generateToken = (payload, expiresIn = "15m") => {
    return jwt.sign(payload, PRIVATE_KEY, { expiresIn });
};
export const verifyToken = (token) => {
    return jwt.verify(token, PRIVATE_KEY);
};
