import path from "path";
import { fileURLToPath } from "url";
import SwaggerParser from "@apidevtools/swagger-parser";
import swaggerUi from "swagger-ui-express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPENAPI_ENTRY = path.join(__dirname, "openapi", "openapi.yaml");

let cachedSpec = null;

/**
 * Faz bundle contract-first dos YAMLs (resolve $ref entre arquivos).
 * Preferido a swagger-jsdoc para specs separadas por domínio.
 */
export async function loadOpenApiSpec() {
  if (cachedSpec) return cachedSpec;
  cachedSpec = await SwaggerParser.bundle(OPENAPI_ENTRY);
  return cachedSpec;
}

export function resetOpenApiSpecCache() {
  cachedSpec = null;
}

export async function mountSwaggerDocs(app) {
  const spec = await loadOpenApiSpec();

  app.get("/api/docs/openapi.json", (_req, res) => {
    res.json(spec);
  });

  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: "Plano Ideal API B2B",
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        tryItOutEnabled: true,
      },
    })
  );

  return spec;
}
