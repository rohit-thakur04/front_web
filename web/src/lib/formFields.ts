/**
 * Which form elements display rather than ask.
 *
 * The builder could read the `content` flag off the palette catalog it already
 * fetches, but the public form page deliberately fetches only the form itself —
 * a lead should not pull down the whole element catalog to fill in four boxes.
 * So the type keys live here, shared by both, and the server keeps its own
 * authoritative flag on the catalog entry.
 */
const CONTENT_TYPES = new Set(["html"]);

/**
 * True for a field that renders markup and collects no answer.
 *
 * Every place that treats fields as questions has to ask this: a content block
 * gets no <label>, no `required`, and no entry in the submitted answers.
 */
export function isContentField(field: { type: string }): boolean {
  return CONTENT_TYPES.has(field.type);
}

/** What a newly dropped HTML block contains, so it is never a blank rectangle. */
export const DEFAULT_HTML_BLOCK =
  '<p style="color: #475569">Add your own HTML here — headings, a paragraph, a logo or a link.</p>';
