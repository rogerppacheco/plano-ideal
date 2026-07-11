import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toExternalCoverageDto } from "../src/dto/external/coverageDto.js";
import {
  toExternalCreditAcceptedDto,
  toExternalCreditPollingDto,
  isTerminalCreditStatus,
} from "../src/dto/external/creditDto.js";

describe("coverageDto", () => {
  it("sanitiza registros internos em operadoras e itens de fachada/logradouro", () => {
    const payload = toExternalCoverageDto({
      cep: "30130010",
      operators: ["Nio", "Vero"],
      records: [
        {
          operator: "Nio",
          source_file: "planilha-secreta.xlsx",
          sheet_name: "Sheet1",
          imported_at: "2026-07-11T10:00:00Z",
          row_data: { NUM_FACHADA: "39", COMPLEMENTO: "AP 101" },
        },
        {
          operator: "Nio",
          source_file: "planilha-secreta.xlsx",
          row_data: { NUM_FACHADA: "39", COMPLEMENTO: "AP 202" },
        },
        {
          operator: "Vero",
          source_file: "vero.csv",
          row_data: { LOGRADOURO: "RUA EXEMPLO", BAIRRO: "CENTRO" },
        },
      ],
    });

    assert.equal(payload.cep, "30130010");
    assert.equal(payload.hasCoverage, true);
    assert.equal(payload.operators.length, 2);

    const nio = payload.operators.find((operator) => operator.name === "Nio");
    const vero = payload.operators.find((operator) => operator.name === "Vero");

    assert.equal(nio.mode, "facades");
    assert.deepEqual(nio.items, ["39 +2"]);
    assert.equal(vero.mode, "streets");
    assert.deepEqual(vero.items, ["RUA EXEMPLO - CENTRO"]);
    assert.equal(JSON.stringify(payload).includes("planilha-secreta"), false);
  });
});

describe("creditDto", () => {
  it("accepted retorna apenas protocolo mínimo", () => {
    const payload = toExternalCreditAcceptedDto({
      id: 105,
      status: "queued",
      created_at: "2026-07-11T22:00:00.000Z",
    });

    assert.deepEqual(payload, {
      consultation: {
        id: 105,
        status: "queued",
        createdAt: "2026-07-11T22:00:00.000Z",
      },
    });
  });

  it("polling expõe estados canônicos e omite campos internos em andamento", () => {
    const payload = toExternalCreditPollingDto({
      id: 105,
      document_masked: "123.456.789-01",
      status: "processing",
      approved: null,
      result_detail: null,
      error_message: null,
      duration_seconds: null,
      created_at: "2026-07-11T22:00:00.000Z",
      started_at: "2026-07-11T22:00:05.000Z",
      finished_at: null,
    });

    assert.equal(payload.consultation.status, "processing");
    assert.equal(payload.consultation.isTerminal, false);
    assert.equal(payload.consultation.approved, undefined);
    assert.equal(payload.consultation.errorMessage, undefined);
  });

  it("polling terminal inclui approved e resultDetail", () => {
    const payload = toExternalCreditPollingDto({
      id: 105,
      document_masked: "123.456.789-01",
      status: "success",
      approved: false,
      result_detail: "Crédito negado",
      error_message: null,
      duration_seconds: 42.5,
      created_at: "2026-07-11T22:00:00.000Z",
      started_at: "2026-07-11T22:00:05.000Z",
      finished_at: "2026-07-11T22:01:00.000Z",
    });

    assert.equal(isTerminalCreditStatus("success"), true);
    assert.equal(payload.consultation.approved, false);
    assert.equal(payload.consultation.resultDetail, "Crédito negado");
    assert.equal(payload.consultation.durationSeconds, 42.5);
  });
});
