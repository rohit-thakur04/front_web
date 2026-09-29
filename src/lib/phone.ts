/**
 * One phone rule, shared by the form builder's preview and the public form.
 *
 * It was duplicated in both pages, which is exactly how the two drift apart —
 * a form that validates in preview and rejects on submit, or worse the reverse.
 * The server applies the same rule again in public_forms.go, because anything
 * enforced only in the browser is enforced nowhere.
 */

/**
 * Permissive on purpose: a bare 10-digit Indian number, a +91-prefixed one and
 * any international form all have to pass. It rejects letters and punctuation
 * soup, which is all it is meant to do.
 *
 * The HTML `pattern` attribute is implicitly anchored, so no ^ or $ here.
 */
export const PHONE_PATTERN = "[+]?[0-9][0-9 ()-]{6,19}";

/** Longest value the pattern can match, so paste can't exceed it either. */
const MAX_PHONE_LEN = 20;

/**
 * Strips anything that can't appear in a phone number, as it is typed.
 *
 * `pattern` alone only speaks up on submit, so someone types "lk ck;.b;kWAB"
 * and learns it was wrong at the very end. Filtering the keystroke gives the
 * answer immediately, and `pattern` stays as the backstop for paste, autofill
 * and anyone who edits the DOM.
 */
export function sanitizePhoneInput(raw: string): string {
  // A plus is only meaningful as a country prefix, so it survives only at the
  // front — "9876+54321" is not a phone number.
  const plus = raw.trimStart().startsWith("+") ? "+" : "";
  const rest = raw.replace(/[^0-9 ()-]/g, "");
  return (plus + rest).slice(0, MAX_PHONE_LEN);
}
