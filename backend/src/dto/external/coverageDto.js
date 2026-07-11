import {
  buildOperatorFacadeItems,
  buildOperatorStreetItems,
  getOperatorCoverageConfig,
  toOperatorDisplayName,
} from "../../utils/coverageLabels.js";

export function toExternalCoverageDto(coverageResult) {
  const recordsByOperator = new Map();

  for (const record of coverageResult.records) {
    const operatorName = toOperatorDisplayName(record.operator);
    if (!recordsByOperator.has(operatorName)) {
      recordsByOperator.set(operatorName, []);
    }
    recordsByOperator.get(operatorName).push(record);
  }

  const operators = coverageResult.operators.map((operatorName) => {
    const config = getOperatorCoverageConfig(operatorName);
    const records = recordsByOperator.get(config.name) || [];

    const items =
      config.mode === "streets"
        ? buildOperatorStreetItems(records)
        : buildOperatorFacadeItems(records, config.keys);

    return {
      name: config.name,
      mode: config.mode,
      items,
    };
  });

  return {
    cep: coverageResult.cep,
    hasCoverage: operators.some((operator) => operator.items.length > 0),
    operators,
  };
}
