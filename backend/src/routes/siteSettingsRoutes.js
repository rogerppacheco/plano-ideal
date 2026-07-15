import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getLeadsWhatsappSetting,
  getPublicSiteConfig,
  updateLeadsWhatsappConfig,
} from "../services/siteSettingsService.js";

const router = express.Router();

router.get("/public/site-config", async (_req, res) => {
  const config = await getPublicSiteConfig();
  return res.json(config);
});

router.get("/site-settings/leads-whatsapp", requireAuth, requireRole("admin"), async (_req, res) => {
  const setting = await getLeadsWhatsappSetting();
  return res.json(setting);
});

router.put("/site-settings/leads-whatsapp", requireAuth, requireRole("admin"), async (req, res) => {
  const defaultNumber = req.body?.defaultNumber ?? req.body?.whatsappNumber ?? "";
  const byUf = req.body?.byUf ?? req.body?.by_uf ?? {};
  const result = await updateLeadsWhatsappConfig({ defaultNumber, byUf }, req.user?.sub ?? null);
  if (!result.ok) {
    return res.status(400).json({ message: result.message });
  }
  return res.json({
    defaultNumber: result.defaultNumber,
    byUf: result.byUf,
    updatedAt: result.updatedAt,
    updatedByName: req.user?.fullName ?? null,
  });
});

export default router;
