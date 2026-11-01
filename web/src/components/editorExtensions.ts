import StarterKit from "@tiptap/starter-kit";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { TextAlign } from "@tiptap/extension-text-align";
import { Image } from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extension-placeholder";

/**
 * The editor's extension list.
 *
 * TipTap v3 gotcha: StarterKit already bundles link, underline, and undo/redo
 * history. Registering any of them as a separate extension throws a duplicate
 * -extension error when the editor mounts, so they are configured through
 * StarterKit.configure() and never imported individually.
 *
 * Only what StarterKit does NOT bundle is listed separately below.
 */
export function editorExtensions() {
  return [
    StarterKit.configure({
      link: {
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      },
    }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Image,
    Placeholder.configure({ placeholder: "Write your email…" }),
  ];
}
