import assert from "node:assert/strict";
import test from "node:test";
import { lookupPostalCode } from "../lib/checkout/postal-code.ts";

test("CEP lookup validates format before the network and handles unknown addresses", async () => {
  await assert.rejects(lookupPostalCode("41710x000", async () => { throw new Error("must not fetch"); }), /CEP inválido/);
  for (const erro of [true,"true"]) await assert.rejects(lookupPostalCode("41710-000", async () => Response.json({ erro })), /não encontrado/);
  await assert.rejects(lookupPostalCode("41710000", async () => Response.json({ cep:"01001-000",localidade:"São Paulo",uf:"SP" })), /Resposta/);
  assert.deepEqual(await lookupPostalCode("41710-000", async () => Response.json({cep:"41710-000",localidade:"Salvador",uf:"BA"})), {postalCode:"41710000",city:"Salvador",state:"BA"});
});
