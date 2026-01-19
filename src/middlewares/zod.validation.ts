import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

export const validate =
  (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      console.log("Validation successful for request body:", req.body);
      next();
    } catch (error: any) {
      console.error("Validation error:", error.errors);
      return res.status(400).json({
        success: false,
        errors: error.errors,
    
      
      });
    }

  };
