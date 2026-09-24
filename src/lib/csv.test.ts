import { describe, expect, it } from "vitest";
import { mapRows, parseCSV, parseMoney, toCSV } from "./csv";

describe("parseCSV", () => {
  it("parses a plain grid", () => {
    expect(parseCSV("name,email\nAda,ada@x.com")).toEqual([
      ["name", "email"],
      ["Ada", "ada@x.com"],
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(parseCSV('name,note\n"Lovelace, Ada",hi')).toEqual([
      ["name", "note"],
      ["Lovelace, Ada", "hi"],
    ]);
  });

  it('treats "" as an escaped quote', () => {
    expect(parseCSV('name\n"She said ""hi"""')).toEqual([
      ["name"],
      ['She said "hi"'],
    ]);
  });

  it("keeps newlines inside quoted fields", () => {
    expect(parseCSV('name,addr\nAda,"12 Main\nLondon"')).toEqual([
      ["name", "addr"],
      ["Ada", "12 Main\nLondon"],
    ]);
  });

  it("strips a UTF-8 BOM so the first header is usable", () => {
    expect(parseCSV("﻿name,email\nAda,a@x.com")[0]).toEqual([
      "name",
      "email",
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCSV("name\r\nAda\r\nGrace")).toEqual([["name"], ["Ada"], ["Grace"]]);
  });

  it("parses a final row with no trailing newline", () => {
    expect(parseCSV("name\nAda")).toEqual([["name"], ["Ada"]]);
  });

  it("drops blank lines", () => {
    expect(parseCSV("name\n\nAda\n")).toEqual([["name"], ["Ada"]]);
  });
});

describe("parseMoney", () => {
  it("parses rupee amounts with separators", () => {
    expect(parseMoney("₹50,000")).toBe(50000);
  });

  it("keeps decimals", () => {
    expect(parseMoney("50,000.50")).toBe(50000.5);
  });

  it("ignores currency words", () => {
    expect(parseMoney("Rs. 1200")).toBe(1200);
  });

  it("returns 0 for empty or junk input", () => {
    expect(parseMoney("")).toBe(0);
    expect(parseMoney("n/a")).toBe(0);
  });
});

describe("mapRows", () => {
  it("requires a name column", () => {
    const res = mapRows([["email"], ["a@x.com"]]);
    expect(res.rows).toHaveLength(0);
    expect(res.errors[0].message).toMatch(/name/i);
  });

  it("maps name/phone/email/value and parses messy money", () => {
    const res = mapRows([
      ["Name", "Phone", "Email", "Value"],
      ["Ada", "123", "ada@x.com", "₹50,000"],
    ]);
    expect(res.rows).toEqual([
      { name: "Ada", phone: "123", email: "ada@x.com", value: 50000 },
    ]);
  });

  it("treats phone/email/value as optional", () => {
    const res = mapRows([["name"], ["Ada"]]);
    expect(res.rows).toEqual([{ name: "Ada", phone: "", email: "", value: 0 }]);
  });

  it("reports a missing name against the spreadsheet row number", () => {
    // Row 1 is the header, so this blank name is row 3 to the user.
    const res = mapRows([["name"], ["Ada"], [""]]);
    expect(res.errors).toEqual([{ row: 3, message: "Missing name" }]);
    expect(res.rows).toHaveLength(1);
  });

  it("dedupes by email within the file, case-insensitively", () => {
    const res = mapRows([
      ["name", "email"],
      ["Ada", "ada@x.com"],
      ["Ada Again", "ADA@x.com"],
    ]);
    expect(res.rows).toHaveLength(1);
    expect(res.duplicatesInFile).toBe(1);
  });

  it("does not dedupe rows that have no email", () => {
    const res = mapRows([
      ["name", "email"],
      ["Ada", ""],
      ["Grace", ""],
    ]);
    expect(res.rows).toHaveLength(2);
  });
});

describe("toCSV", () => {
  it("prefixes a BOM so Excel renders ₹ correctly", () => {
    expect(toCSV(["a"], [["₹1"]]).charCodeAt(0)).toBe(0xfeff);
  });

  it("quotes fields containing commas, quotes, or newlines", () => {
    const csv = toCSV(["name"], [['Lovelace, Ada']]);
    expect(csv).toContain('"Lovelace, Ada"');
    expect(toCSV(["n"], [['say "hi"']])).toContain('"say ""hi"""');
  });

  it("round-trips through parseCSV", () => {
    const csv = toCSV(["name", "note"], [["Lovelace, Ada", 'say "hi"']]);
    expect(parseCSV(csv)).toEqual([
      ["name", "note"],
      ["Lovelace, Ada", 'say "hi"'],
    ]);
  });
});
