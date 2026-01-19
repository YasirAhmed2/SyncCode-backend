import express from "express";
import { validate } from "@/middlewares/zod.validation.js";
import { signupSchema, loginSchema,forgotPasswordSchema,resetPasswordSchema } from "@/types/zod.types.js";
import { Signup,Signin } from "@/controllers/auth.controller.js";
import { resetPassword,sendOtp,verifyOtp,logoutUser } from "@/controllers/auth.controller.js";
import { authenticate } from "@/middlewares/auth.middleware.js";
import { verifyEmailOtp } from "@/controllers/auth.controller.js";

const authRouter=express.Router();

authRouter.post("/register", validate(signupSchema), async (req, res) => {
  const userData = req.body;
  console.log("Registering user with data:", userData);
  const userCreated = await Signup(userData);
  res.cookie("AUTH_JWT", userCreated.signedData, {
    httpOnly: true, 
  });

  res.status(201).json({
    message: "Signup successful. Please verify your email."
  });
});

authRouter.post("/login", validate(loginSchema), async (req, res) => {
 try{
  const signInReq = await Signin(req.body);
  if (signInReq == null) {
    res.status(401).send({
      error: "User does not exists or password is incorrect",
    });
    return;
  } else {
    res.cookie("auth_jwt", signInReq.signedData, {
    httpOnly: true,
    sameSite: "lax",
    secure: false // true in production
  }).status(200).json({
      user: signInReq.userId,
      name: signInReq.name,
      email: signInReq.email,
    });
  }
  } catch (error) {
    console.error("Login error:", error);
     if (error.message === "EMAIL_NOT_VERIFIED") {
      return res.status(403).json({
        error: "Please verify your email first"
      });
    }
    return res.status(500).json({
      error: "Internal server error"
    });
  }
});

authRouter.post("/forgot-password" ,validate(forgotPasswordSchema),sendOtp);
authRouter.post("/verify-otp", verifyOtp);
authRouter.post("/reset-password", authenticate, validate(resetPasswordSchema), resetPassword);
authRouter.post("/verify-email", verifyEmailOtp);
authRouter.post("/logout", logoutUser);

export default authRouter;

