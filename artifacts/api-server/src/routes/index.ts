import { Router, type IRouter } from "express";
import healthRouter from "./health";
import childrenRouter from "./children";
import hospitalsRouter from "./hospitals";
import ambulancesRouter from "./ambulances";
import messagesRouter from "./messages";
import incidentsRouter from "./incidents";
import vitalsRouter from "./vitals";
import timelineRouter from "./timeline";
import sensorRouter from "./sensor";
import dashboardRouter from "./dashboard";
import busesRouter from "./buses";
import routeAnalyticsRouter from "./route_analytics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(childrenRouter);
router.use(hospitalsRouter);
router.use(ambulancesRouter);
router.use(messagesRouter);
router.use(incidentsRouter);
router.use(vitalsRouter);
router.use(timelineRouter);
router.use(sensorRouter);
router.use(dashboardRouter);
router.use(busesRouter);
router.use(routeAnalyticsRouter);

export default router;
