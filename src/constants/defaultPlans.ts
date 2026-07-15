export interface InternetPlan {
  id: string;
  name: string;
  speedLabel: string;
  benefits: string[];
  priceStandard: number;
  priceCard: number;
  cardDiscount: number;
  featured: boolean;
  badge: string | null;
}

export const DEFAULT_INTERNET_PLANS: InternetPlan[] = [
  {
    id: "essencial-600",
    name: "Essencial",
    speedLabel: "600 Mega",
    benefits: ["Roteador Wi-Fi 5", "Skeelo"],
    priceStandard: 110,
    priceCard: 95,
    cardDiscount: 15,
    featured: false,
    badge: null,
  },
  {
    id: "super-800",
    name: "Super",
    speedLabel: "800 Mega",
    benefits: ["Roteador Wi-Fi 6 (nova geração)", "Globoplay 12 meses incluso", "Skeelo"],
    featured: true,
    badge: "Mais Assinado",
    priceStandard: 135,
    priceCard: 120,
    cardDiscount: 15,
  },
  {
    id: "ultra-1giga",
    name: "Ultra",
    speedLabel: "1 Giga",
    benefits: ["Roteador Wi-Fi 6", "Globoplay 12 meses incluso", "Skeelo"],
    priceStandard: 150,
    priceCard: 135,
    cardDiscount: 15,
    featured: false,
    badge: null,
  },
];
