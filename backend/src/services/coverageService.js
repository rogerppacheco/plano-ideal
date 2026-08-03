import {
  DfvPowerBiError,
  getNioCoverageFromPowerBi,
  hasNioCoverageInPowerBi,
} from "./dfvPowerBiService.js";

export { DfvPowerBiError };

/**
 * Contagem simplificada para viabilidade pública: 1 se houver fachada Nio no PBI.
 */
export async function countCoverageByCep(cepDigits) {
  const has = await hasNioCoverageInPowerBi(cepDigits);
  return has ? 1 : 0;
}

/**
 * Consulta de cobertura: somente Nio via Power BI público (DFV), sem bases legadas.
 */
export async function getCoverageByCep(cepDigits) {
  return getNioCoverageFromPowerBi(cepDigits);
}
