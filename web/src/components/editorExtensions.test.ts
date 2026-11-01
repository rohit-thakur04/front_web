// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorExtensions } from "./editorExtensions";

/**
 * These tests exist to catch the TipTap v3 duplicate-extension trap: StarterKit
 * bundles link, underline, and undo/redo, and re-adding any of them throws only
 * when the editor is actually constructed — never at build or typecheck time.
 */
function makeEditor() {
  return new Editor({ extensions: editorExtensions(), content: "<p>hi</p>" });
}

describe("editor extensions", () => {
  it("constructs without a duplicate-extension error", () => {
    let editor: Editor | undefined;
    expect(() => {
      editor = makeEditor();
    }).not.toThrow();
    editor?.destroy();
  });

  it("registers each extension exactly once", () => {
    const editor = makeEditor();
    const names = editor.extensionManager.extensions.map((e) => e.name);
    const duplicated = names.filter((n, i) => names.indexOf(n) !== i);
    expect(duplicated).toEqual([]);
    editor.destroy();
  });

  it("has link, underline, and undo/redo available via StarterKit", () => {
    const editor = makeEditor();
    const names = editor.extensionManager.extensions.map((e) => e.name);
    // These come from StarterKit; if they were missing the toolbar would be dead.
    expect(names).toContain("link");
    expect(names).toContain("underline");
    expect(names).toContain("undoRedo");
    editor.destroy();
  });

  it("has the extensions StarterKit does not bundle", () => {
    const editor = makeEditor();
    const names = editor.extensionManager.extensions.map((e) => e.name);
    for (const n of ["textStyle", "color", "highlight", "taskList", "taskItem", "textAlign", "image", "placeholder"]) {
      expect(names).toContain(n);
    }
    editor.destroy();
  });

  // Each toolbar command is exercised against a fresh document and selection:
  // chaining them all against one stale selection would fail on position maths
  // that has nothing to do with whether the command is wired up.
  const commands: [string, (e: Editor) => unknown][] = [
    ["bold", (e) => e.chain().toggleBold().run()],
    ["italic", (e) => e.chain().toggleItalic().run()],
    ["underline", (e) => e.chain().toggleUnderline().run()],
    ["code", (e) => e.chain().toggleCode().run()],
    ["heading", (e) => e.chain().toggleHeading({ level: 2 }).run()],
    ["paragraph", (e) => e.chain().setParagraph().run()],
    ["bulletList", (e) => e.chain().toggleBulletList().run()],
    ["orderedList", (e) => e.chain().toggleOrderedList().run()],
    ["taskList", (e) => e.chain().toggleTaskList().run()],
    ["blockquote", (e) => e.chain().toggleBlockquote().run()],
    ["horizontalRule", (e) => e.chain().setHorizontalRule().run()],
    ["color", (e) => e.chain().setColor("#ff0000").run()],
    ["highlight", (e) => e.chain().toggleHighlight().run()],
    ["textAlign", (e) => e.chain().setTextAlign("center").run()],
    ["link", (e) => e.chain().setLink({ href: "https://example.com" }).run()],
    ["unsetLink", (e) => e.chain().unsetLink().run()],
    ["image", (e) => e.chain().setImage({ src: "https://example.com/a.png" }).run()],
    ["undo", (e) => e.chain().undo().run()],
    ["redo", (e) => e.chain().redo().run()],
  ];

  it.each(commands)("toolbar command %s runs without throwing", (_name, run) => {
    const editor = makeEditor();
    editor.commands.setContent("<p>hello world</p>");
    editor.commands.selectAll();
    expect(() => run(editor)).not.toThrow();
    editor.destroy();
  });

  it("round-trips HTML, so saved template content survives a reload", () => {
    const editor = makeEditor();
    editor.commands.setContent("<p>Hello <strong>Ada</strong></p>");
    expect(editor.getHTML()).toContain("<strong>Ada</strong>");
    editor.destroy();
  });

  it("keeps placeholder tokens intact for server-side rendering", () => {
    // The mailer substitutes these at send time; the editor must not mangle them.
    const editor = makeEditor();
    editor.commands.setContent("<p>Hi {{name}}, from {{pipelineName}}</p>");
    expect(editor.getHTML()).toContain("{{name}}");
    expect(editor.getHTML()).toContain("{{pipelineName}}");
    editor.destroy();
  });
});
