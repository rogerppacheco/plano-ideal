import express from "express";
import coverageRoutes from "./coverageRoutes.js";
import creditRoutes from "./creditRoutes.js";

const router = express.Router();

router.use("/coverage", coverageRoutes);
router.use("/credit", creditRoutes);

export default router;
