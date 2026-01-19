import jwt from "jsonwebtoken";
import "dotenv/config";

const PRIVATE_KEY = process.env.JWT_SECRET;

export const generateToken = (
  payload: object,
  expiresIn: string = "15m"
) => {
  return jwt.sign(payload, PRIVATE_KEY, { expiresIn });
};

export const verifyToken = (token: string) => {
  return jwt.verify(token, PRIVATE_KEY);
};