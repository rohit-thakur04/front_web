import { describe, expect, it } from "vitest";
import {
  mapRows,
  neutralizeFormula,
  parseCSV,
  parseMoney,
  phoneKey,
  toCSV,
} from "./csv";

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

describe("phoneKey", () => {
  it("collapses every spelling of one number", () => {
    // These are the three forms a client's own exports actually contain.
    const first = phoneKey("+91 98765 43210");
    for (const spelling of ["09876543210", "9876543210", "(987) 654-3210"]) {
      expect(phoneKey(spelling)).toBe(first);
    }
  });

  it("keeps different numbers apart", () => {
    expect(phoneKey("9876543210")).not.toBe(phoneKey("9876543211"));
  });

  it("refuses anything too short to be a number", () => {
    // An extension or a half-filled cell would otherwise match every other
    // short value in the file and skip real rows.
    expect(phoneKey("1234")).toBe("");
    expect(phoneKey("")).toBe("");
    expect(phoneKey("x22")).toBe("");
  });

  it("agrees with the Go implementation on the seven-digit boundary", () => {
    expect(phoneKey("1234567")).toBe("1234567");
    expect(phoneKey("123456")).toBe("");
  });
});

describe("mapRows duplicate handling", () => {
  it("skips a repeated phone even when the emails differ", () => {
    // The email-only rule let the same person in twice whenever one row left
    // the email blank or used a second address.
    const res = mapRows([
      ["name", "phone", "email"],
      ["Asha", "+91 98765 43210", "asha@work.example"],
      ["Asha P", "09876543210", "asha@home.example"],
    ]);
    expect(res.rows).toHaveLength(1);
    expect(res.duplicatesInFile).toBe(1);
  });

  it("skips a repeated email even when the phones differ", () => {
    const res = mapRows([
      ["name", "phone", "email"],
      ["Asha", "9876543210", "asha@x.example"],
      ["Asha", "9000000000", "ASHA@X.EXAMPLE"],
    ]);
    expect(res.rows).toHaveLength(1);
    expect(res.duplicatesInFile).toBe(1);
  });

  it("keeps rows that share neither", () => {
    const res = mapRows([
      ["name", "phone", "email"],
      ["Asha", "9876543210", "asha@x.example"],
      ["Ben", "9000000000", "ben@x.example"],
    ]);
    expect(res.rows).toHaveLength(2);
    expect(res.duplicatesInFile).toBe(0);
  });

  it("keeps rows with no email and no usable phone", () => {
    // Nothing to match on is not the same as matching, or a column of blanks
    // would collapse to a single contact.
    const res = mapRows([
      ["name", "phone", "email"],
      ["Walk-in one", "", ""],
      ["Walk-in two", "", ""],
    ]);
    expect(res.rows).toHaveLength(2);
    expect(res.duplicatesInFile).toBe(0);
  });

  it("does not match a phone number sitting in the email column", () => {
    const res = mapRows([
      ["name", "phone", "email"],
      ["A", "", "9876543210"],
      ["B", "9876543210", ""],
    ]);
    expect(res.rows).toHaveLength(2);
  });
});

describe("neutralizeFormula", () => {
  it("defuses every character a spreadsheet treats as a formula", () => {
    for (const lead of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(neutralizeFormula(lead + "cmd")).toBe("'" + lead + "cmd");
    }
  });

  it("leaves ordinary values alone", () => {
    for (const v of ["Asha Patel", "9876543210", "", "a=b", "Priya (Sales)"]) {
      expect(neutralizeFormula(v)).toBe(v);
    }
  });

  it("does not double-prefix a value that is already quoted off", () => {
    expect(neutralizeFormula("'=1+1")).toBe("'=1+1");
  });
});

describe("toCSV formula injection", () => {
  it("defuses a malicious contact name that came from the public form", () => {
    // That endpoint is unauthenticated, so the name is attacker-chosen — and it
    // executes on the client's machine when they open their own export.
    const csv = toCSV(["Name"], ['=HYPERLINK("http://evil.example")'].map((n) => [n]));
    expect(csv).toContain("'=HYPERLINK");
    // No cell may begin with a bare "=", whether at a comma or inside quotes.
    expect(csv).not.toMatch(/(^|,|")=/);
  });

  it("still quotes a defused value that contains a comma", () => {
    expect(toCSV(["Name"], [["=1+1,2"]])).toContain('"' + "'=1+1,2" + '"');
  });

  it("keeps the UTF-8 BOM so Excel renders rupees and Devanagari", () => {
    // The QA report claimed this was missing; it is not, and this pins it.
    expect(toCSV(["Name"], [["\u0906\u0936\u093e"]]).charCodeAt(0)).toBe(0xfeff);
  });

  it("writes a real amount untouched and defuses a text one", () => {
    expect(toCSV(["Value"], [[5000]])).toContain("5000");
    expect(toCSV(["Value"], [["-5000"]])).toContain("'-5000");
  });
});
