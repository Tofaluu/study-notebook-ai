import { Router, type IRouter } from "express";
import healthRouter from "./health";
import studyRouter from "./study";
import billingRouter from "./billing";
import analyticsRouter from "./analytics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(studyRouter);
router.use(billingRouter);
router.use(analyticsRouter);

export default router;
