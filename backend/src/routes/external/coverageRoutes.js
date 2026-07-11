import express from "express";
import { recordAuditEvent } from "../../services/auditService.js";
import { getCoverageByCep } from "../../services/coverageService.js";
import { toExternalCoverageDto } from "../../dto/external/coverageDto.js";
import { sendExternalError } from "../../dto/external/errorDto.js";
import { externalRateLimit } from "../../middleware/externalRateLimit.js";
import { requireApiKey, requireApiScope } from "../../middleware/requireApiKey.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { normalizeCepDigits } from "../../utils/cep.js";

const router = express.Router();

router.get(
  "/:cep",
  requireApiKey,
  requireApiScope("coverage"),
  externalRateLimit("coverage"),
  asyncHandler(async (req, res) => {
    const cepDigits = normalizeCepDigits(req.params.cep);
    if (cepDigits.length !== 8) {
      return sendExternalError(res, 400, "INVALID_CEP", "CEP inválido. Informe 8 dígitos.");
    }

    const coverage = await getCoverageByCep(cepDigits);
    const payload = toExternalCoverageDto(coverage);

    recordAuditEvent({
      action: "EXTERNAL_COVERAGE_LOOKUP",
      partnerId: req.apiClient.partnerId,
      apiKeyId: req.apiClient.apiKeyId,
      metadata: {
        cep: cepDigits,
        hasCoverage: payload.hasCoverage,
        operatorCount: payload.operators.length,
      },
    }).catch(() => {});

    return res.json(payload);
  })
);

export default router;
