import express from "express";
import { validate } from "@/middlewares/zod.validation.js";
import { signupSchema, loginSchema,forgotPasswordSchema,resetPasswordSchema } from "@/types/zod.types.js";
import { Signup,Signin } from "@/controllers/auth.controller.js";
import { resetPassword,sendOtp,verifyOtp,logoutUser } from "@/controllers/auth.controller.js";
import { authenticate } from "@/middlewares/auth.middleware.js";
import { verifyEmailOtp } from "@/controllers/auth.controller.js";
import { getMyProfile } from "@/controllers/user.controller.js";

const authRouter=express.Router();

const isProduction = process.env.NODE_ENV === "production";

const authCookieOptions = {
  httpOnly: true,
  sameSite: isProduction ? "none" : "lax",
  secure: isProduction,
  path: "/"
} as const;

authRouter.post("/register", validate(signupSchema), async (req, res) => {
  try {
    const userData = req.body;
    const userCreated = await Signup(userData);

    res.cookie("auth_jwt", userCreated.signedData, authCookieOptions);

    res.status(201).json({
      success: true,
      message: "Signup successful. Please verify your email.",
      user: {
        id: userCreated._id,
        name: userCreated.name,
        email: userCreated.email,
        isEmailVerified: userCreated.isEmailVerified
      }
    });
  } catch (error: any) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Email already registered"
      });
    }

    console.error("Register error:", error);
    return res.status(500).json({
      success: false,
      message: "Registration failed"
    });
  }
});

authRouter.post("/login", validate(loginSchema), async (req, res) => {
 try{
  const signInReq = await Signin(req.body);
  if (signInReq == null) {
    res.status(401).send({
      success: false,
      message: "User does not exist or password is incorrect",
    });
    return;
  } else {
    res.cookie("auth_jwt", signInReq.signedData, authCookieOptions).status(200).json({
      success: true,
      user: {
        id: signInReq.userId,
        userId: signInReq.userId,
        name: signInReq.name,
        email: signInReq.email,
      },
      token: signInReq.signedData,
      name: signInReq.name,
      email: signInReq.email
    });
  }
  } catch (error: any) {
    console.error("Login error:", error);
     if (error.message === "EMAIL_NOT_VERIFIED") {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first"
      });
    }
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

authRouter.get("/me", authenticate, getMyProfile);
authRouter.post("/forgot-password" ,validate(forgotPasswordSchema),sendOtp);
authRouter.post("/verify-otp", verifyOtp);
authRouter.post("/reset-password", authenticate, validate(resetPasswordSchema), resetPassword);
authRouter.post("/verify-email", verifyEmailOtp);
authRouter.post("/logout", logoutUser);

export default authRouter;

