import { describe, expect, it } from "vitest";
import {
  SAMPLE_CONTACT,
  previewDocument,
  substituteTokens,
  unknownTokens,
} from "./emailPreview";

describe("substituteTokens", () => {
  it("replaces every known token", () => {
    const out = substituteTokens("<p>Hi {{name}}, call {{phone}}</p>");
    expect(out).toBe("<p>Hi Priya Sharma, call +91 98765 43210</p>");
  });

  it("tolerates inner spacing, as the sender does", () => {
    expect(substituteTokens("{{ name }}")).toBe("Priya Sharma");
  });

  it("leaves an unknown token exactly as written", () => {
    // The sender does the same, so the preview must not hide it.
    expect(substituteTokens("<p>Hi {{Name}}</p>")).toBe("<p>Hi {{Name}}</p>");
  });

  it("works inside an attribute", () => {
    expect(substituteTokens('<a href="mailto:{{email}}">write</a>')).toBe(
      '<a href="mailto:priya.sharma@example.com">write</a>',
    );
  });

  it("escapes the substituted value", () => {
    // Otherwise a value containing a quote breaks out of the attribute it sits in.
    const out = substituteTokens('<a title="{{name}}">x</a>', {
      name: '" onload="x',
    });
    expect(out).toBe('<a title="&quot; onload=&quot;x">x</a>');
    expect(out).not.toContain('onload="x"');
  });

  it("accepts a caller-supplied value map", () => {
    expect(substituteTokens("{{city}}", { city: "Pune" })).toBe("Pune");
  });

  it("leaves content with no tokens untouched", () => {
    expect(substituteTokens("<p>plain</p>")).toBe("<p>plain</p>");
  });
});

describe("unknownTokens", () => {
  it("names only the tokens with no value", () => {
    expect(unknownTokens("{{name}} {{Name}} {{fullName}}")).toEqual([
      "Name",
      "fullName",
    ]);
  });

  it("de-duplicates and keeps first-seen order", () => {
    expect(unknownTokens("{{b}} {{a}} {{b}}")).toEqual(["b", "a"]);
  });

  it("is empty when every token resolves", () => {
    const all = Object.keys(SAMPLE_CONTACT)
      .map((k) => `{{${k}}}`)
      .join(" ");
    expect(unknownTokens(all)).toEqual([]);
  });
});

describe("previewDocument", () => {
  it("embeds the body and opens links in a new tab", () => {
    const doc = previewDocument("<p>hello</p>");
    expect(doc).toContain("<p>hello</p>");
    expect(doc).toContain('<base target="_blank">');
    expect(doc.startsWith("<!doctype html>")).toBe(true);
  });

  it("carries none of the app's typography classes", () => {
    // The whole point: the preview must not inherit `prose`.
    expect(previewDocument("<p>x</p>")).not.toContain("prose");
  });
});
