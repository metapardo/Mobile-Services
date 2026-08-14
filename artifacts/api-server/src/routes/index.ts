import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import accessRequestsRouter from "./access-requests";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(accessRequestsRouter);

export default router;
