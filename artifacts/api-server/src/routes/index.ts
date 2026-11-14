import { Router, type IRouter } from "express";
import healthRouter from "./health";
import studyRouter from "./study";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(studyRouter);
router.use(billingRouter);

export default router;
