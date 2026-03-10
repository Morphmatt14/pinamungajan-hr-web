import { safeParseDateToIso, formatDateDdMmYyyy } from "../src/lib/pds/validators.ts";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected} but got ${actual}`);
  }
}

function assert(cond, label) {
  if (!cond) throw new Error(label);
}

const cases = [
  {
    input: "03/06/1979",
    opts: { isPds: true, pdsLabelSuggestsDdMm: true, templateVersion: "2025" },
    expectIso: "1979-06-03",
    expectFormat: "dd/mm",
  },
  {
    input: "12/28/2020",
    opts: { isPds: true, pdsLabelSuggestsDdMm: true, templateVersion: "2025" },
    expectIso: "2020-12-28",
    expectFormat: "mm/dd",
  },
  {
    input: "28/12/2020",
    opts: { isPds: true, pdsLabelSuggestsDdMm: true, templateVersion: "2025" },
    expectIso: "2020-12-28",
    expectFormat: "dd/mm",
  },
  {
    input: "1979-06-03",
    opts: { isPds: true, pdsLabelSuggestsDdMm: true, templateVersion: "2025" },
    expectIso: "1979-06-03",
    expectFormat: "iso",
  },
  {
    input: "06/03/1979",
    opts: { isPds: false },
    expectIso: null,
    expectReason: "ambiguous_date_format",
  },
];

for (const c of cases) {
  const res = safeParseDateToIso(c.input, c.opts);
  if (c.expectIso === null) {
    assertEqual(res.iso, null, `${c.input} iso`);
    assert(Array.isArray(res.reasonsIfNull) && res.reasonsIfNull.includes(c.expectReason), `${c.input} reasons include`);
    continue;
  }
  assertEqual(res.iso, c.expectIso, `${c.input} iso`);
  assertEqual(res.detectedFormat, c.expectFormat, `${c.input} detectedFormat`);
  assertEqual(formatDateDdMmYyyy(res.iso), `${c.expectIso.slice(8, 10)}/${c.expectIso.slice(5, 7)}/${c.expectIso.slice(0, 4)}`, `${c.input} display`);
}

console.log("OK: safeParseDateToIso acceptance tests passed");
