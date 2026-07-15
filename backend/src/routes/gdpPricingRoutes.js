import express from "express";
import os from "node:os";
import path from "node:path";
import multer from "multer";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getCityPricing,
  getGdpPricingSummary,
  importGdpPricingFile,
  listGdpCitiesByUf,
} from "../services/gdpPricingService.js";

const router = express.Router();
const upload = multer({ dest: path.join(os.tmpdir(), "planoideal-gdp-imports") });

router.get("/public/city-pricing", async (req, res) => {
  const uf = req.query.uf;
  const city = req.query.city ?? req.query.municipio;
  const ibgeCode = req.query.ibge ?? req.query.ibgeCode;

  const pricing = await getCityPricing({ uf, city, ibgeCode });
  if (!pricing) {
    return res.status(404).json({ message: "Preços não encontrados para esta cidade." });
  }
  return res.json(pricing);
});

router.get("/public/cities", async (req, res) => {
  const cities = await listGdpCitiesByUf(req.query.uf);
  return res.json({ cities });
});

router.get("/site-settings/gdp-pricing", requireAuth, requireRole("admin"), async (_req, res) => {
  const summary = await getGdpPricingSummary();
  return res.json(summary);
});

router.post(
  "/site-settings/gdp-pricing/upload",
  requireAuth,
  requireRole("admin"),
  upload.single("file"),
  async (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: "Nenhum arquivo enviado." });
    }

    const fileName = String(file.originalname || file.filename || "gdp.xlsx");
    if (!fileName.toLowerCase().endsWith(".xlsx")) {
      return res.status(400).json({ message: "Envie um arquivo .xlsx da planilha GDP." });
    }

    try {
      const result = await importGdpPricingFile({
        filePath: file.path,
        fileName,
        importedBy: req.user?.sub ?? null,
      });
      const summary = await getGdpPricingSummary();
      return res.status(201).json({
        message: `Planilha importada com sucesso (${result.citiesCount} cidades).`,
        import: result,
        summary,
      });
    } catch (error) {
      return res.status(400).json({
        message: error?.message || "Falha ao importar planilha GDP.",
      });
    }
  }
);

export default router;
