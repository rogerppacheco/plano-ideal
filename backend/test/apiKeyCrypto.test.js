import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  API_KEY_LIVE_PREFIX,
  generateApiKeyMaterial,
  hashApiKey,
  isApiKeyFormat,
  parseApiKeyPlaintext,
  timingSafeEqualStrings,
  verifyApiKeyHash,
} from "../src/utils/apiKeyCrypto.js";

describe("apiKeyCrypto", () => {
  it("generateApiKeyMaterial produz pk_live_ com prefixo de 8 chars", () => {
    const material = generateApiKeyMaterial();
    assert.ok(material.plaintext.startsWith(API_KEY_LIVE_PREFIX));
    assert.equal(material.keyPrefix.length, 8);
    assert.equal(material.keyPrefix, material.secret.slice(0, 8));
    assert.ok(isApiKeyFormat(material.plaintext));
  });

  it("parseApiKeyPlaintext rejeita formatos inválidos", () => {
    assert.equal(parseApiKeyPlaintext("invalid"), null);
    assert.equal(parseApiKeyPlaintext(`${API_KEY_LIVE_PREFIX}curto`), null);
  });

  it("verifyApiKeyHash valida chave correta e rejeita incorreta", async () => {
    const material = generateApiKeyMaterial();
    const hash = await hashApiKey(material.plaintext);

    assert.equal(await verifyApiKeyHash(material.plaintext, hash), true);
    assert.equal(await verifyApiKeyHash(`${API_KEY_LIVE_PREFIX}outra-chave-invalida`, hash), false);
    assert.equal(await verifyApiKeyHash("invalid", hash), false);
  });

  it("timingSafeEqualStrings compara buffers de mesmo tamanho", () => {
    assert.equal(timingSafeEqualStrings("abcdefgh", "abcdefgh"), true);
    assert.equal(timingSafeEqualStrings("abcdefgh", "abcdefgX"), false);
    assert.equal(timingSafeEqualStrings("abc", "abcd"), false);
  });
});
