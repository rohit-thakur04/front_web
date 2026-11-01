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
 * any international form all have to pass. It rejects letters, which is all a
 * shape check can honestly do.
 *
 * The first character may be "(" as well as a digit. It could not before, so
 * "(022) 2222 3333" — an ordinary Indian landline — was rejected by a field whose
 * own error message said brackets were fine. The message was the honest one.
 *
 * Shape alone does not reject punctuation soup; the server also requires at least
 * seven digits (handlers.minPhoneDigits). A pattern strict enough to catch that
 * is also strict enough to reject somebody's real number, and of those two
 * mistakes only one loses a lead.
 *
 * The HTML `pattern` attribute is implicitly anchored, so no ^ or $ here.
 */
export const PHONE_PATTERN = "[+]?[0-9(][0-9 ()-]{6,19}";

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

/**
 * The hint shown on every phone field, and the text of the browser's own
 * validation bubble.
 *
 * Shared so the three places that render a phone input cannot describe the rule
 * three different ways — which is how the old wording came to promise brackets
 * that the pattern then rejected.
 */
export const PHONE_TITLE =
  "At least 7 digits. Spaces, brackets and dashes are fine, and it may start with +.";
