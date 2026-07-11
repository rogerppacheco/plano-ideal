import { describe, expect, it } from "vitest";
import type { CoverageRecordInput } from "../types/coverage";
import {
  buildFacadeLabel,
  buildStreetLabel,
  groupFacadeNumbers,
  maskCep,
  narrowCoverageRecord,
  normalizeCoverageRecords,
  parseFacadeLabel,
  recordsMatchOperator,
  sortAddressNumbers,
  toCoverageOperator,
} from "./coverage";

describe("coverage", () => {
  describe("maskCep", () => {
    it("formata CEP com hífen", () => {
      expect(maskCep("30130010")).toBe("30130-010");
    });
  });

  describe("sortAddressNumbers", () => {
    it("ordena numericamente em pt-BR", () => {
      expect(sortAddressNumbers(["100", "26", "3", "111"])).toEqual(["3", "26", "100", "111"]);
    });
  });

  describe("parseFacadeLabel", () => {
    it("separa número e complemento", () => {
      expect(parseFacadeLabel("120 COMPL A")).toEqual({
        base: "120",
        suffix: "COMPL A",
        full: "120 COMPL A",
        hasComplement: true,
        isNumericBase: true,
      });
    });

    it("retorna null para valor vazio", () => {
      expect(parseFacadeLabel("")).toBeNull();
    });
  });

  describe("buildFacadeLabel", () => {
    it("combina NUM_FACHADA e COMPLEMENTO no padrão Nio", () => {
      const label = buildFacadeLabel({ NUM_FACHADA: "45", COMPLEMENTO: "BL A" }, ["NUM_FACHADA"]);
      expect(label).toBe("45 BL A");
    });

    it("retorna apenas NUM para Vivo", () => {
      expect(buildFacadeLabel({ NUM: "100" }, ["NUM", "Numero"])).toBe("100");
    });
  });

  describe("buildStreetLabel", () => {
    it("monta logradouro com bairro para Vero", () => {
      expect(
        buildStreetLabel({
          LOGRADOURO: "Rua das Flores",
          BAIRRO: "Centro",
        })
      ).toBe("Rua das Flores · Centro");
    });
  });

  describe("groupFacadeNumbers", () => {
    it("agrupa variantes pelo número base", () => {
      const groups = groupFacadeNumbers(["120", "120 BL A", "26"]);
      expect(groups).toHaveLength(2);
      expect(groups[0].base).toBe("26");
      expect(groups[1].base).toBe("120");
      expect(groups[1].isExpandable).toBe(true);
    });
  });

  describe("narrowCoverageRecord", () => {
    it("discrimina registro Vivo", () => {
      const record = narrowCoverageRecord({
        operator: "vivo",
        row_data: { NUM: "10" },
      });
      expect(record.operator).toBe("Vivo");
      if (record.operator === "Vivo") {
        expect(record.row_data.NUM).toBe("10");
      }
    });

    it("discrimina registro Nio", () => {
      const record = narrowCoverageRecord({
        operator: "Nio",
        row_data: { NUM_FACHADA: "22", COMPLEMENTO: "AP 1" },
      });
      expect(record.operator).toBe("Nio");
      if (record.operator === "Nio") {
        expect(record.row_data.NUM_FACHADA).toBe("22");
      }
    });

    it("discrimina registro Vero", () => {
      const record = narrowCoverageRecord({
        operator: "VERO",
        row_data: { LOGRADOURO: "Av. Brasil" },
      });
      expect(record.operator).toBe("Vero");
    });

    it("mantém operadora desconhecida como genérica", () => {
      const record = narrowCoverageRecord({
        operator: "Outra",
        row_data: { NUM: "1" },
      });
      expect(record.operator).toBe("Outra");
    });
  });

  describe("normalizeCoverageRecords", () => {
    it("normaliza lista da API", () => {
      const input: CoverageRecordInput[] = [
        { operator: "Vivo", row_data: { NUM: "1" } },
        { operator: "Nio", row_data: { NUM_FACHADA: "2" } },
      ];
      const records = normalizeCoverageRecords(input);
      expect(records.map((r) => r.operator)).toEqual(["Vivo", "Nio"]);
    });
  });

  describe("recordsMatchOperator", () => {
    it("compara operadoras sem diferenciar caixa", () => {
      expect(recordsMatchOperator({ operator: "VIVO" }, "vivo")).toBe(true);
      expect(recordsMatchOperator({ operator: "Nio" }, "Vero")).toBe(false);
    });
  });

  describe("toCoverageOperator", () => {
    it("resolve operadoras conhecidas", () => {
      expect(toCoverageOperator("nio")).toBe("Nio");
      expect(toCoverageOperator("Desconhecida")).toBeNull();
    });
  });
});
