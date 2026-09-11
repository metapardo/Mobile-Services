import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import settingsRouter from "./settings";
import clientsRouter from "./clients";
import packagesRouter from "./packages";
import employeesRouter from "./employees";
import employeeRolesRouter from "./employee-roles";
import bookingsRouter from "./bookings";
import timeLogsRouter from "./time-logs";
import timeOffRequestsRouter from "./time-off-requests";
import payrollRouter from "./payroll";
import reportsRouter from "./reports";
import placesRouter from "./places";
import routingRouter from "./routing";
import weatherRouter from "./weather";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(settingsRouter);
router.use(clientsRouter);
router.use(packagesRouter);
router.use(employeesRouter);
router.use(employeeRolesRouter);
router.use(bookingsRouter);
router.use(timeLogsRouter);
router.use(timeOffRequestsRouter);
router.use(payrollRouter);
router.use(reportsRouter);
router.use(placesRouter);
router.use(routingRouter);
router.use(weatherRouter);

export default router;
