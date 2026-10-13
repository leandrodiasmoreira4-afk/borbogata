import test from "node:test";
import assert from "node:assert/strict";
import { periodRange, todayInBrazil, validateRange } from "../lib/admin/period.ts";
import { loadPages } from "../lib/admin/load-pages.ts";

test("admin periods use Brazilian day and a Monday-to-Sunday week across years", () => {
  assert.equal(todayInBrazil(new Date("2026-01-01T02:59:59Z")), "2025-12-31");
  assert.deepEqual(periodRange("week", "2026-01-01"), { start: "2025-12-29", end: "2026-01-04" });
  assert.deepEqual(periodRange("week", "2026-10-18"), { start: "2026-10-12", end: "2026-10-18" });
  assert.deepEqual(periodRange("day", "2026-10-13"), { start: "2026-10-13", end: "2026-10-13" });
});
test("month/year presets handle leap years and reject invalid or oversized ranges", () => {
  assert.deepEqual(periodRange("month", "2024-02-12"), { start: "2024-02-01", end: "2024-02-29" });
  assert.deepEqual(periodRange("year", "2024-02-12"), { start: "2024-01-01", end: "2024-12-31" });
  assert.doesNotThrow(() => validateRange("2024-01-01", "2024-12-31"));
  assert.throws(() => periodRange("day", "2026-02-30"));
  assert.throws(() => validateRange("2024-01-01", "2025-01-01"));
  assert.throws(() => validateRange("2026-10-13", "2026-10-12"));
});
test("catalogue pagination retrieves beyond the API cap and propagates failure", async () => {
  const all = Array.from({ length: 1102 }, (_, id) => ({ id }));
  const result = await loadPages(async (from, to) => ({ data: all.slice(from, to + 1), error: null }));
  assert.deepEqual(result.data, all);
  const failed = await loadPages(async from => from ? { data: null, error: "denied" } : { data: all.slice(0, 500), error: null });
  assert.deepEqual(failed, { data: null, error: "denied" });
});
