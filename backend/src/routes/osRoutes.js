import express from "express";
import { canViewAllCreditHistory } from "../constants/roles.js";
import { requireAuth } from "../middleware/auth.js";
import { hasAvailableBoCredential } from "../services/creditRateLimit.js";
import { checkOsRateLimit } from "../services/osRateLimit.js";
import {
  createInternalOsConsultation,
  getInternalOsConsultationById,
  getInternalOsScreenshot,
  listInternalOsConsultations,
} from "../services/osConsultService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validateOsLookupDocument } from "../utils/documentValidation.js";

const router = express.Router();

function normalizeNumeroOs(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits || null;
}

router.post(
  "/os/consult",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { document, numeroOs } = req.body || {};
    const validation = validateOsLookupDocument(document);
    if (!validation.ok) {
      return res.status(400).json({ message: validation.message });
    }

    const rate = await checkOsRateLimit(req.user.sub);
    if (!rate.ok) {
      return res.status(429).json({ message: rate.message });
    }

    const boAvailable = await hasAvailableBoCredential();
    if (!boAvailable) {
      return res.status(503).json({
        message: "Todos os logins PAP estão em uso. Tente novamente em alguns instantes.",
      });
    }

    const consultation = await createInternalOsConsultation({
      requestedBy: req.user.sub,
      document: validation.document,
      numeroOsFiltro: normalizeNumeroOs(numeroOs),
    });

    return res.status(202).json({ consultation });
  })
);

router.get(
  "/os/consultations",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const viewAll = canViewAllCreditHistory(req.user.role);
    const consultations = await listInternalOsConsultations({
      userId: req.user.sub,
      viewAll,
      limit,
    });

    return res.json({ consultations });
  })
);

router.get(
  "/os/consultations/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const viewAll = canViewAllCreditHistory(req.user.role);
    const consultation = await getInternalOsConsultationById({
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
  "/os/consultations/:id/screenshot",
  requireAuth,
  asyncHandler(async (req, res) => {
    const viewAll = canViewAllCreditHistory(req.user.role);
    const screenshotBase64 = await getInternalOsScreenshot({
      id: req.params.id,
      userId: req.user.sub,
      viewAll,
    });

    if (!screenshotBase64) {
      return res.status(404).json({ message: "Captura PAP não disponível." });
    }

    return res.json({ screenshotBase64 });
  })
);

export default router;
