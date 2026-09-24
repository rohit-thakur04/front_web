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
}

export interface ParseResult {
  rows: ParsedContact[];
  errors: { row: number; message: string }[];
  duplicatesInFile: number;
}

/**
 * mapRows turns the raw grid into contact rows.
 *
 * A `name` column is required; phone/email/value are optional. Rows are deduped
 * by email within the file (the server dedupes against the pipeline separately).
 */
export function mapRows(grid: string[][]): ParseResult {
  const errors: ParseResult["errors"] = [];
  if (grid.length === 0) {
    return { rows: [], errors: [{ row: 0, message: "The file is empty" }], duplicatesInFile: 0 };
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

  if (nameIdx === -1) {
    return {
      rows: [],
      errors: [{ row: 1, message: 'A "name" column is required' }],
      duplicatesInFile: 0,
    };
  }

  const rows: ParsedContact[] = [];
  const seenEmails = new Set<string>();
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
    const key = email.toLowerCase();
    if (key) {
      if (seenEmails.has(key)) {
        duplicatesInFile++;
        continue;
      }
      seenEmails.add(key);
    }

    rows.push({
      name,
      phone: phoneIdx === -1 ? "" : (cells[phoneIdx] ?? "").trim(),
      email,
      value: valueIdx === -1 ? 0 : parseMoney((cells[valueIdx] ?? "").trim()),
    });
  }

  return { rows, errors, duplicatesInFile };
}

/**
 * toCSV builds a CSV file from the rows currently on screen.
 *
 * The BOM is required: without it Excel reads the file as ANSI and renders ₹ as
 * mojibake.
 */
export function toCSV(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
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
