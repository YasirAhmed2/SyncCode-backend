
import { Request, Response, NextFunction } from "express";
import { verifyToken } from "@/utils/jwt.utils.js";

interface JwtPayload {
  userId: string;
}
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const cookieToken = req.cookies["auth_jwt"];
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  const token = cookieToken || bearerToken;

  console.log("Received token:", token);

  if (!token) {
    return res.status(401).json({ message: "Not authorized" });
  }

  try {
    const decoded = verifyToken(token) as { userId: string };

    req.user = { userId: decoded.userId };
  
    console.log("Decoded payload:", decoded);

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};


export interface AuthRequest extends Request {
  user?: { userId: string };

}