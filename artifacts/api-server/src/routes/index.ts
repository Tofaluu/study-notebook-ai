import { Router, type IRouter } from "express";
import healthRouter from "./health";
import conceptGraphsRouter from "./concept-graphs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(conceptGraphsRouter);

export default router;
