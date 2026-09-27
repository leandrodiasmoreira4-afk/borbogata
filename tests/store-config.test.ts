import assert from "node:assert/strict";
import test from "node:test";

import { storeConfig } from "../app/config/store.ts";

test("expõe o contato oficial da loja pelo WhatsApp", () => {
  assert.equal(storeConfig.support, "+55 71 8439-5835");
  const supportDigits = storeConfig.support.replace(/\D/g, "");

  assert.match(storeConfig.whatsappUrl, new RegExp(`^https://wa\\.me/${supportDigits}\\?text=`));
});
