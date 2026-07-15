import test from "node:test";
import assert from "node:assert/strict";
import { buildPlansFromGdpOffers } from "../src/utils/gdpOfferParser.js";

test("buildPlansFromGdpOffers parseia ofertas regular e especial", () => {
  const regular = buildPlansFromGdpOffers(
    "500 (R$90,00) 600 (R$95,00) 800 (R$120,00) 1000 (R$135,00) 1000 (R$145,00)",
    "500 (R$100,00) 600 (R$110,00) 800 (R$135,00) 1000 (R$150,00) 1000 (R$160,00)"
  );
  assert.equal(regular.length, 3);
  assert.equal(regular[0].priceCard, 95);
  assert.equal(regular[0].priceStandard, 110);
  assert.equal(regular[1].priceCard, 120);
  assert.equal(regular[2].priceCard, 135);
  assert.equal(regular[2].priceStandard, 150);

  const especial = buildPlansFromGdpOffers(
    "600 (R$55,00) 800 (R$67,50) 1000 (R$75,00) 1000 (R$80,00)",
    "600 (R$55,00) 800 (R$67,50) 1000 (R$75,00) 1000 (R$80,00)"
  );
  assert.equal(especial[0].priceCard, 55);
  assert.equal(especial[2].priceCard, 75);
  assert.equal(especial[2].priceStandard, 80);
});
