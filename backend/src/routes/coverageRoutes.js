import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { resolveLocationFromCep } from "../services/cepLocationService.js";
import {
  countCoverageByCep,
  DfvPowerBiError,
  getCoverageByCep,
} from "../services/coverageService.js";
import { normalizeCepDigits } from "../utils/cep.js";

const router = express.Router();

function sendPowerBiError(res, error) {
  if (error instanceof DfvPowerBiError) {
    return res.status(error.status || 502).json({
      message: error.message,
      code: error.code,
    });
  }
  // eslint-disable-next-line no-console
  console.error("[Coverage] Erro inesperado:", error);
  return res.status(500).json({ message: "Erro ao consultar cobertura." });
}

router.get("/public/viability/:cep", async (req, res) => {
  const cepDigits = normalizeCepDigits(req.params.cep);
  if (cepDigits.length !== 8) {
    return res.status(400).json({ message: "CEP inválido." });
  }

  try {
    const total = await countCoverageByCep(cepDigits);
    const statusCode = total > 0 ? "V-OK" : "V-NOK";
    return res.json({ statusCode, source: "powerbi_dfv" });
  } catch (error) {
    return sendPowerBiError(res, error);
  }
});

router.get("/public/cep-location/:cep", async (req, res) => {
  const cepDigits = normalizeCepDigits(req.params.cep);
  if (cepDigits.length !== 8) {
    return res.status(400).json({ message: "CEP inválido." });
  }

  const location = await resolveLocationFromCep(cepDigits);
  return res.json(location);
});

router.get("/coverage/:cep", requireAuth, async (req, res) => {
  const cepDigits = normalizeCepDigits(req.params.cep);
  if (cepDigits.length !== 8) {
    return res.status(400).json({ message: "CEP inválido." });
  }

  try {
    const coverage = await getCoverageByCep(cepDigits);
    return res.json(coverage);
  } catch (error) {
    return sendPowerBiError(res, error);
  }
});

export default router;
