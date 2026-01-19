import { Router } from "express";
import { getMyProfile,updateMyProfile } from "../controllers/user.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const userRouter = Router();


userRouter.get("/me", authenticate, getMyProfile);
userRouter.put("/me",authenticate, updateMyProfile);
export default userRouter;
