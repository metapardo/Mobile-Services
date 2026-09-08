import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import settingsRouter from "./settings";
import clientsRouter from "./clients";
import packagesRouter from "./packages";
import employeesRouter from "./employees";
import bookingsRouter from "./bookings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(settingsRouter);
router.use(clientsRouter);
router.use(packagesRouter);
router.use(employeesRouter);
router.use(bookingsRouter);

export default router;
