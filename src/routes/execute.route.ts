import { Router } from "express";
import { runCode } from "../controllers/codeExecution.controller.js";

const executeRouter = Router();

executeRouter.post("/", runCode);

export default executeRouter;