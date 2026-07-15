const PLAN_TEMPLATES = [
  {
    id: "essencial-600",
    name: "Essencial",
    speedLabel: "600 Mega",
    speedMbps: 600,
    benefits: ["Roteador Wi-Fi 5", "Skeelo"],
    featured: false,
    badge: null,
  },
  {
    id: "super-800",
    name: "Super",
    speedLabel: "800 Mega",
    speedMbps: 800,
    benefits: ["Roteador Wi-Fi 6 (nova geração)", "Globoplay 12 meses incluso", "Skeelo"],
    featured: true,
    badge: "Mais Assinado",
  },
  {
    id: "ultra-1giga",
    name: "Ultra",
    speedLabel: "1 Giga",
    speedMbps: 1000,
    benefits: ["Roteador Wi-Fi 6", "Globoplay 12 meses incluso", "Skeelo"],
    featured: false,
    badge: null,
  },
];

function parseBrazilianMoney(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseSpeedPrices(offerText) {
  const items = [];
  const regex = /(\d+)\s*\(R\$\s*([\d.,]+)\)/gi;
  let match = regex.exec(String(offerText || ""));
  while (match) {
    items.push({
      speed: Number(match[1]),
      price: parseBrazilianMoney(match[2]),
    });
    match = regex.exec(String(offerText || ""));
  }
  return items;
}

function pickPrice(items, speed, index = 0) {
  const matches = items.filter((item) => item.speed === speed && item.price != null);
  return matches[index]?.price ?? null;
}

function resolvePlanPrices(cartaoItems, daccItems, speedMbps) {
  const cardPrice = pickPrice(cartaoItems, speedMbps, 0);
  let standardPrice = pickPrice(daccItems, speedMbps, 0);

  if (speedMbps === 1000) {
    const firstCard = pickPrice(cartaoItems, 1000, 0);
    const firstStandard = pickPrice(daccItems, 1000, 0);
    const secondStandard = pickPrice(daccItems, 1000, 1);
    if (
      firstCard != null &&
      firstStandard != null &&
      firstCard === firstStandard &&
      secondStandard != null &&
      secondStandard > firstStandard
    ) {
      standardPrice = secondStandard;
    }
  }

  if (cardPrice == null) return null;

  const resolvedStandard =
    standardPrice != null && standardPrice >= cardPrice ? standardPrice : cardPrice;
  const cardDiscount = Math.max(0, Number((resolvedStandard - cardPrice).toFixed(2)));

  return {
    priceCard: cardPrice,
    priceStandard: resolvedStandard,
    cardDiscount,
  };
}

export function buildPlansFromGdpOffers(cartaoOffer, daccOffer) {
  const cartaoItems = parseSpeedPrices(cartaoOffer);
  const daccItems = parseSpeedPrices(daccOffer);

  const plans = [];
  for (const template of PLAN_TEMPLATES) {
    let prices = resolvePlanPrices(cartaoItems, daccItems, template.speedMbps);
    if (!prices && template.speedMbps === 600) {
      prices = resolvePlanPrices(cartaoItems, daccItems, 500);
    }
    if (!prices) continue;

    plans.push({
      ...template,
      ...prices,
    });
  }

  return plans;
}
