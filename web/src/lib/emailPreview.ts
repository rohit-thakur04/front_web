/**
 * Turning a saved template into what the recipient will actually receive.
 *
 * The editor is not a preview. TipTap renders inside `prose prose-sm`, which is
 * Tailwind's typography — margins, heading sizes and link colours that exist in
 * this app and nowhere in Gmail. So a template can look spaced and readable in
 * the editor and arrive as a wall of text. The preview therefore renders the
 * same HTML with email-client defaults instead, in an iframe, so none of the
 * app's CSS can reach it.
 */

/** The values shown in place of merge tokens, so the preview reads as an email. */
export const SAMPLE_CONTACT: Record<string, string> = {
  name: "Priya Sharma",
  phone: "+91 98765 43210",
  email: "priya.sharma@example.com",
  pipelineName: "Enterprise Sales",
};

/** Matches `{{token}}` with optional inner spacing, as the sender does. */
const TOKEN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Substitutes the tokens the sender knows about and leaves the rest alone.
 *
 * Leaving an unknown token untouched is deliberate: that is precisely what the
 * sender does, so the preview shows the real outcome rather than hiding it
 * behind a blank. `unknownTokens` then names them so it isn't missed.
 *
 * Values are escaped because they land in an HTML document, and a token can sit
 * inside an attribute (`href="mailto:{{email}}"`) where a raw quote would break
 * out of it.
 */
export function substituteTokens(
  html: string,
  values: Record<string, string> = SAMPLE_CONTACT,
): string {
  return html.replace(TOKEN, (whole, key: string) => {
    const value = values[key];
    return value === undefined ? whole : escapeHtml(value);
  });
}

/**
 * The tokens in this template that the sender has no value for, de-duplicated
 * and in the order they appear.
 *
 * This is the one thing the editor cannot tell you: `{{Name}}` and `{{fullName}}`
 * look perfectly deliberate on screen and go out as literal braces to every
 * contact. Catching them needs the list of what is actually substitutable.
 */
export function unknownTokens(
  html: string,
  values: Record<string, string> = SAMPLE_CONTACT,
): string[] {
  const found: string[] = [];
  for (const match of html.matchAll(TOKEN)) {
    const key = match[1];
    if (values[key] === undefined && !found.includes(key)) found.push(key);
  }
  return found;
}

/**
 * Wraps the body in a standalone document for the preview iframe.
 *
 * The styles imitate an email client's defaults, not this app's: a system font
 * stack, black on white, and a centred column, because that is the frame the
 * content has to survive. `<base target="_blank">` keeps a click inside the
 * template from replacing the editor — the iframe is sandboxed, so navigation
 * is blocked regardless, but the intent should be stated in the document too.
 */
export function previewDocument(bodyHtml: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><base target="_blank">
<style>
  html { background: #f1f5f9; }
  body {
    margin: 0; padding: 24px 16px;
    font: 15px/1.6 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #111827;
  }
  .sheet { max-width: 600px; margin: 0 auto; background: #fff; padding: 24px;
           border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
  img { max-width: 100%; height: auto; }
  a { color: #1a56db; }
  table { border-collapse: collapse; }
  blockquote { margin: 1em 0; padding-left: 1em; border-left: 3px solid #d1d5db; color: #4b5563; }
  hr { border: 0; border-top: 1px solid #e5e7eb; }
</style></head>
<body><div class="sheet">${bodyHtml}</div></body></html>`;
}
