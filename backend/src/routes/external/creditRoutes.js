import express from "express";
import { recordAuditEvent } from "../../services/auditService.js";
import {
  createExternalCreditConsultation,
  getExternalCreditConsultationById,
} from "../../services/creditConsultService.js";
import {
  toExternalCreditAcceptedDto,
  toExternalCreditPollingDto,
} from "../../dto/external/creditDto.js";
import { sendExternalError } from "../../dto/external/errorDto.js";
import { hasAvailableBoCredential } from "../../services/creditRateLimit.js";
import { externalRateLimit } from "../../middleware/externalRateLimit.js";
import { requireApiKey, requireApiScope } from "../../middleware/requireApiKey.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { validateDocument } from "../../utils/documentValidation.js";

const router = express.Router();

router.post(
  "/consult",
  requireApiKey,
  requireApiScope("credit"),
  externalRateLimit("credit"),
  asyncHandler(async (req, res) => {
    const { document, cpfRepresentative } = req.body || {};
    const validation = validateDocument(document, cpfRepresentative);
    if (!validation.ok) {
      return sendExternalError(res, 400, "INVALID_DOCUMENT", validation.message);
    }

    const boAvailable = await hasAvailableBoCredential();
    if (!boAvailable) {
      return sendExternalError(
        res,
        503,
        "SERVICE_UNAVAILABLE",
        "Serviço de crédito temporariamente indisponível. Tente novamente em instantes."
      );
    }

    const row = await createExternalCreditConsultation({
      apiKeyId: req.apiClient.apiKeyId,
      document: validation.document,
      cpfRepresentative: validation.cpfRepresentative,
    });

    recordAuditEvent({
      action: "EXTERNAL_CREDIT_CONSULT",
      partnerId: req.apiClient.partnerId,
      apiKeyId: req.apiClient.apiKeyId,
      metadata: {
        consultationId: row.id,
        documentMasked: validation.document.length === 11 ? "CPF" : "CNPJ",
      },
    }).catch(() => {});

    return res.status(202).json(toExternalCreditAcceptedDto(row));
  })
);

router.get(
  "/consultations/:id",
  requireApiKey,
  requireApiScope("credit"),
  externalRateLimit("credit"),
  asyncHandler(async (req, res) => {
    const consultationId = Number(req.params.id);
    if (!Number.isInteger(consultationId) || consultationId <= 0) {
      return sendExternalError(res, 400, "INVALID_REQUEST", "ID de consulta inválido.");
    }

    const row = await getExternalCreditConsultationById({
      id: consultationId,
      apiKeyId: req.apiClient.apiKeyId,
    });

    if (!row) {
      return sendExternalError(res, 404, "NOT_FOUND", "Consulta não encontrada.");
    }

    return res.json(toExternalCreditPollingDto(row));
  })
);

export default router;
