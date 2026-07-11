import express from "express";
import { canViewAllCreditHistory } from "../constants/roles.js";
import { requireAuth } from "../middleware/auth.js";
import { checkCreditRateLimit, hasAvailableBoCredential } from "../services/creditRateLimit.js";
import {
  createInternalCreditConsultation,
  getInternalCreditConsultationById,
  getInternalCreditScreenshot,
  listInternalCreditConsultations,
} from "../services/creditConsultService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validateDocument } from "../utils/documentValidation.js";

const router = express.Router();

router.post(
  "/credit/consult",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { document, cpfRepresentative } = req.body || {};
    const validation = validateDocument(document, cpfRepresentative);
    if (!validation.ok) {
      return res.status(400).json({ message: validation.message });
    }

    const rate = await checkCreditRateLimit(req.user.sub);
    if (!rate.ok) {
      return res.status(429).json({ message: rate.message });
    }

    const boAvailable = await hasAvailableBoCredential();
    if (!boAvailable) {
      return res.status(503).json({
        message: "Todos os logins PAP estão em uso. Tente novamente em alguns instantes.",
      });
    }

    const consultation = await createInternalCreditConsultation({
      requestedBy: req.user.sub,
      document: validation.document,
      cpfRepresentative: validation.cpfRepresentative,
    });

    return res.status(202).json({ consultation });
  })
);

router.get(
  "/credit/consultations",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const viewAll = canViewAllCreditHistory(req.user.role);
    const consultations = await listInternalCreditConsultations({
      userId: req.user.sub,
      viewAll,
      limit,
    });

    return res.json({ consultations });
  })
);

router.get(
  "/credit/consultations/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const viewAll = canViewAllCreditHistory(req.user.role);
    const consultation = await getInternalCreditConsultationById({
      id: req.params.id,
      userId: req.user.sub,
      viewAll,
    });

    if (!consultation) {
      return res.status(404).json({ message: "Consulta não encontrada." });
    }

    return res.json({ consultation });
  })
);

router.get(
  "/credit/consultations/:id/screenshot",
  requireAuth,
  asyncHandler(async (req, res) => {
    const viewAll = canViewAllCreditHistory(req.user.role);
    const screenshotBase64 = await getInternalCreditScreenshot({
      id: req.params.id,
      userId: req.user.sub,
      viewAll,
    });

    if (!screenshotBase64) {
      return res.status(404).json({ message: "Comprovante não disponível." });
    }

    return res.json({ screenshotBase64 });
  })
);

export default router;
