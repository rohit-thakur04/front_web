import { describe, expect, it } from "vitest";
import { PHONE_PATTERN, sanitizePhoneInput } from "./phone";

// Browsers anchor the pattern attribute implicitly; mirror that here.
const re = new RegExp(`^(?:${PHONE_PATTERN})$`);

describe("sanitizePhoneInput", () => {
  it("strips letters and punctuation as they are typed", () => {
    // Only the space survives: semicolons and dots aren't separators a phone
    // number uses, so they go the same way as the letters.
    expect(sanitizePhoneInput("lk ck;.b;kWAB;KCB;BC;")).toBe(" ");
  });

  it("keeps a real number untouched", () => {
    expect(sanitizePhoneInput("9876543210")).toBe("9876543210");
    expect(sanitizePhoneInput("+91 98765 43210")).toBe("+91 98765 43210");
    expect(sanitizePhoneInput("+1 (555) 605-4594")).toBe("+1 (555) 605-4594");
  });

  it("keeps a plus only at the front, where it means a country prefix", () => {
    expect(sanitizePhoneInput("+919876543210")).toBe("+919876543210");
    expect(sanitizePhoneInput("9876+54321")).toBe("987654321");
  });

  it("caps the length so a paste cannot exceed what the pattern allows", () => {
    expect(sanitizePhoneInput("1".repeat(50))).toHaveLength(20);
  });

  it("drops letters mixed into digits", () => {
    expect(sanitizePhoneInput("98765o4321")).toBe("987654321");
    expect(sanitizePhoneInput("abcdefghij")).toBe("");
  });
});

describe("PHONE_PATTERN", () => {
  it("accepts the shapes people actually type", () => {
    for (const v of [
      "9876543210",
      "+91 98765 43210",
      "+1 (555) 605-4594",
      "+44 20 7946 0958",
      "98765-43210",
    ]) {
      expect(re.test(v), `${v} should be accepted`).toBe(true);
    }
  });

  it("rejects junk", () => {
    for (const v of ["lk ck;.b;kWAB;KCB;BC;", "abcdefghij", "12345", "phone", "", "98765 4321o"]) {
      expect(re.test(v), `${v} should be rejected`).toBe(false);
    }
  });

  // The two have to agree, or the field accepts keystrokes it then refuses to
  // submit — which is the confusing half-broken state this pairing avoids.
  it("accepts what the sanitizer produces from real numbers", () => {
    for (const v of ["+91 98765 43210", "9876543210", "+1 (555) 605-4594"]) {
      expect(re.test(sanitizePhoneInput(v)), `${v} round-trip`).toBe(true);
    }
  });
});

describe("PHONE_PATTERN shape", () => {
  // The browser applies this as an anchored regex, so the tests do too.
  const re = new RegExp(`^(?:${PHONE_PATTERN})$`);

  it("accepts the formats the hint promises", () => {
    for (const v of [
      "9876543210",
      "+91 98765 43210",
      "(022) 2222 3333",
      "022-2222-3333",
      "+1 (415) 555-0132",
    ]) {
      expect(re.test(v), v).toBe(true);
    }
  });

  it("accepts a number written in brackets, which it used to reject", () => {
    // The old pattern required a digit first, so this ordinary Indian landline
    // failed against a field whose error message said brackets were fine.
    expect(re.test("(022) 2222 3333")).toBe(true);
  });

  it("still rejects letters", () => {
    for (const v of ["abcxyz", "call me", "98765abcde"]) {
      expect(re.test(v), v).toBe(false);
    }
  });

  it("rejects anything too short to be a number", () => {
    expect(re.test("12345")).toBe(false);
  });
});
