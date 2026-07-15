import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { resolveLocationFromCep } from "../services/cepLocationService.js";
import { countCoverageByCep, getCoverageByCep } from "../services/coverageService.js";
import { normalizeCepDigits } from "../utils/cep.js";

const router = express.Router();

router.get("/public/viability/:cep", async (req, res) => {
  const cepDigits = normalizeCepDigits(req.params.cep);
  if (cepDigits.length !== 8) {
    return res.status(400).json({ message: "CEP inválido." });
  }

  const total = await countCoverageByCep(cepDigits);
  const statusCode = total > 0 ? "V-OK" : "V-NOK";
  return res.json({ statusCode });
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

  const coverage = await getCoverageByCep(cepDigits);
  return res.json(coverage);
});

export default router;
