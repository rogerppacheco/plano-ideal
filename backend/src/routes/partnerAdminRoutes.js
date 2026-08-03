import express from "express";
import { ROLES } from "../constants/roles.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createApiKey,
  deleteApiKey,
  handleApiKeyServiceError,
  listApiKeysByPartner,
  revokeApiKey,
} from "../services/apiKeyService.js";
import {
  createPartner,
  getPartnerById,
  handlePartnerServiceError,
  listPartners,
  updatePartner,
} from "../services/partnerService.js";

const router = express.Router();

router.get(
  "/partners",
  requireAuth,
  requireRole(ROLES.ADMIN),
  asyncHandler(async (_req, res) => {
    const partners = await listPartners();
    return res.json({ partners });
  })
);

router.post(
  "/partners",
  requireAuth,
  requireRole(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    try {
      const partner = await createPartner({
        actorUserId: req.user.sub,
        name: req.body?.name,
        slug: req.body?.slug,
        contactEmail: req.body?.contactEmail,
      });
      return res.status(201).json({
        partner,
        message: "Parceiro criado com sucesso.",
      });
    } catch (error) {
      return handlePartnerServiceError(error, res);
    }
  })
);

router.patch(
  "/partners/:id",
  requireAuth,
  requireRole(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    try {
      const partner = await updatePartner({
        actorUserId: req.user.sub,
        partnerId: req.params.id,
        name: req.body?.name,
        contactEmail: req.body?.contactEmail,
        isActive: req.body?.isActive,
      });
      return res.json({
        partner,
        message: "Parceiro atualizado com sucesso.",
      });
    } catch (error) {
      return handlePartnerServiceError(error, res);
    }
  })
);

router.get(
  "/partners/:id/keys",
  requireAuth,
  requireRole(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    try {
      const partner = await getPartnerById(req.params.id);
      if (!partner) {
        return res
          .status(404)
          .json({ message: "Parceiro não encontrado.", code: "PARTNER_NOT_FOUND" });
      }
      const apiKeys = await listApiKeysByPartner(partner.id);
      return res.json({ apiKeys });
    } catch (error) {
      return handlePartnerServiceError(error, res);
    }
  })
);

router.post(
  "/partners/:id/keys",
  requireAuth,
  requireRole(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    try {
      const result = await createApiKey({
        partnerId: req.params.id,
        name: req.body?.name,
        scopes: req.body?.scopes,
        createdBy: req.user.sub,
        actorUserId: req.user.sub,
      });
      return res.status(201).json({
        apiKey: result.apiKey,
        plaintext: result.plaintext,
        message: "Chave criada. Copie agora — ela não será exibida novamente.",
      });
    } catch (error) {
      return handleApiKeyServiceError(error, res);
    }
  })
);

router.post(
  "/api-keys/:id/revoke",
  requireAuth,
  requireRole(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    try {
      const apiKey = await revokeApiKey(req.params.id, req.user.sub, req.user.sub);
      return res.json({
        apiKey,
        message: "Chave revogada com sucesso.",
      });
    } catch (error) {
      return handleApiKeyServiceError(error, res);
    }
  })
);

/** Compat: DELETE antigo revogava — agora exclui de vez. Use POST .../revoke para só revogar. */
router.delete(
  "/api-keys/:id",
  requireAuth,
  requireRole(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    try {
      const apiKey = await deleteApiKey(req.params.id, req.user.sub);
      return res.json({
        apiKey,
        message: "Chave excluída permanentemente.",
      });
    } catch (error) {
      return handleApiKeyServiceError(error, res);
    }
  })
);

export default router;
