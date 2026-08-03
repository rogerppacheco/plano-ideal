import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ehViavel,
  filtrarEDeduplicar,
  limparCep,
  montarComplemento,
  parseDsrRows,
  toCoverageRecords,
} from "../src/services/dfvPowerBiService.js";

describe("dfvPowerBiService", () => {
  it("limpa CEP com hífen e zero à esquerda", () => {
    assert.equal(limparCep("30130-000"), "30130000");
    assert.equal(limparCep("130000"), "00130000");
  });

  it("detecta viável sem confundir com inviável", () => {
    assert.equal(ehViavel("Viável"), true);
    assert.equal(ehViavel("INVIAVEL"), false);
    assert.equal(ehViavel("Inviável"), false);
  });

  it("monta complemento concatenado", () => {
    assert.equal(
      montarComplemento({
        COMPLEMENTO1: "CA 1",
        COMPLEMENTO2: "BL A",
        COMPLEMENTO3: "AP 101",
      }),
      "CA 1 | BL A | AP 101"
    );
    assert.equal(
      montarComplemento({ COMPLEMENTO1: "CA 1", COMPLEMENTO2: "", COMPLEMENTO3: null }),
      "CA 1"
    );
  });

  it("parseia DSR com ValueDicts, repeat e null", () => {
    const data = {
      results: [
        {
          result: {
            data: {
              dsr: {
                DS: [
                  {
                    ValueDicts: { D0: ["RUA X", "CENTRO"] },
                    IC: true,
                    PH: [
                      {
                        DM0: [
                          {
                            S: [
                              { N: "G0", DN: "D0" },
                              { N: "G1" },
                              { N: "G2", DN: "D0" },
                            ],
                            C: [0, 10, 1],
                          },
                          {
                            R: 1,
                            "\u00d8": 4,
                            C: [12],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      ],
    };

    const { rows, incomplete, restartTokens } = parseDsrRows(data, 3);
    assert.equal(incomplete, false);
    assert.equal(restartTokens, null);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], ["RUA X", 10, "CENTRO"]);
    assert.equal(rows[1][0], "RUA X");
    assert.equal(rows[1][1], 12);
    assert.equal(rows[1][2], null);
  });

  it("filtra viáveis, deduplica e mapeia para CoverageRecord", () => {
    const regs = [
      {
        CEP: "30130000",
        NO_FACHADA: "12",
        COMPLEMENTO1: "AP 101",
        COMPLEMENTO2: null,
        COMPLEMENTO3: null,
        LOGRADURO: "RUA X",
        BAIRRO: "Y",
        MUNICIPIO: "BH",
        UF: "MG",
        VIABILIDADE_ATUAL: "Viável",
        CODIGO_CDO: "CDO-1",
      },
      {
        CEP: "30130000",
        NO_FACHADA: "10",
        COMPLEMENTO1: "CA 1",
        COMPLEMENTO2: "BL A",
        COMPLEMENTO3: null,
        LOGRADURO: "RUA X",
        BAIRRO: "Y",
        MUNICIPIO: "BH",
        UF: "MG",
        VIABILIDADE_ATUAL: "Viável",
        CODIGO_CDO: "CDO-1",
      },
      {
        CEP: "30130000",
        NO_FACHADA: "10",
        COMPLEMENTO1: "CA 1",
        COMPLEMENTO2: "BL A",
        COMPLEMENTO3: null,
        LOGRADURO: "RUA X",
        BAIRRO: "Y",
        MUNICIPIO: "BH",
        UF: "MG",
        VIABILIDADE_ATUAL: "Viável",
        CODIGO_CDO: "CDO-1",
      },
    ];

    const { registros, onlyViable } = filtrarEDeduplicar(regs);
    assert.equal(onlyViable, true);
    assert.equal(registros.length, 2);
    assert.equal(registros[0]._linha, "10 (CA 1 | BL A)");

    const mapped = toCoverageRecords(regs);
    assert.equal(mapped.records.length, 2);
    assert.equal(mapped.records[0].operator, "Nio");
    assert.equal(mapped.records[0].row_data.NUM_FACHADA, "10");
    assert.equal(mapped.records[0].row_data.COMPLEMENTO, "CA 1 | BL A");
    assert.deepEqual(mapped.cdoCodes, ["CDO-1"]);
  });

  it("expõe Sudeste, SP e Sul como fontes padrão", async () => {
    const { getDfvSources, DEFAULT_DFV_SOURCES } = await import(
      "../src/services/dfvPowerBiService.js"
    );
    const sources = getDfvSources();
    assert.equal(sources.length, 3);
    assert.deepEqual(
      sources.map((s) => s.id),
      DEFAULT_DFV_SOURCES.map((s) => s.id)
    );
  });
});
