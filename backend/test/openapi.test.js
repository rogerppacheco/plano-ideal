import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadOpenApiSpec, resetOpenApiSpecCache } from "../src/docs/swagger.js";

describe("openapi spec", () => {
  it("faz bundle dos YAMLs com paths, security e exemplos", async () => {
    resetOpenApiSpecCache();
    const spec = await loadOpenApiSpec();

    assert.equal(spec.openapi, "3.0.3");
    assert.ok(spec.paths["/api/v1/external/coverage/{cep}"]?.get);
    assert.ok(spec.paths["/api/v1/external/credit/consult"]?.post);
    assert.ok(spec.paths["/api/v1/external/credit/consultations/{id}"]?.get);

    assert.ok(spec.components?.securitySchemes?.ApiKeyAuth);
    assert.ok(spec.components?.securitySchemes?.BearerApiKey);
    assert.ok(spec.components?.responses?.RateLimited);
    assert.ok(spec.components?.schemas?.CoverageResponse);
    assert.ok(spec.components?.schemas?.CreditConsultAccepted);

    const creditPost = spec.paths["/api/v1/external/credit/consult"].post;
    const example202 = creditPost.responses["202"].content["application/json"].example;
    assert.equal(example202.consultation.status, "queued");
  });
});
