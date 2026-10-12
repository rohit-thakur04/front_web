"use client";

import { useAsk } from "@/components/PromptProvider";

import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { editorExtensions } from "./editorExtensions";
import {
  previewDocument,
  substituteTokens,
  unknownTokens,
} from "@/lib/emailPreview";

const CUSTOM_VALUES = [
  { label: "Contact name", token: "{{name}}" },
  { label: "Phone", token: "{{phone}}" },
  { label: "Email", token: "{{email}}" },
  { label: "Pipeline name", token: "{{pipelineName}}" },
];

/** Which of the three views is on screen. */
type Mode = "editor" | "html" | "preview";

interface Props {
  value: string;
  onChange: (html: string) => void;
  /**
   * The envelope fields, for the preview's header. Optional because the editor
   * is also used where there is no subject line to show.
   */
  meta?: { subject?: string; fromName?: string };
}

export function RichTextEditor({ value, onChange, meta }: Props) {
  const [mode, setMode] = useState<Mode>("editor");
  const [source, setSource] = useState(value);

  const editor = useEditor({
    // The editor renders on the client only; SSR would mismatch the DOM.
    immediatelyRender: false,
    extensions: editorExtensions(),
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[280px] px-3 py-2 focus:outline-none",
      },
    },
  });

  // Sync external changes (e.g. loading an existing template) into the editor
  // without clobbering what the user is typing.
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  function applySource() {
    onChange(source);
    editor?.commands.setContent(source, { emitUpdate: false });
  }

  /**
   * Hand-edited HTML is committed on the way out of the source view, whichever
   * view is next. Leaving it to the textarea's onBlur alone loses the edit when
   * the switch itself is what takes the focus.
   */
  function changeMode(next: Mode) {
    if (mode === next) return;
    if (mode === "html") applySource();
    if (next === "html") setSource(editor!.getHTML());
    setMode(next);
  }

  return (
    <div className="rounded-lg border border-slate-300 bg-white">
      <Toolbar editor={editor} mode={mode} onMode={changeMode} />

      {mode === "html" ? (
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onBlur={applySource}
          spellCheck={false}
          className="min-h-[280px] w-full resize-y px-3 py-2 font-mono text-xs outline-none"
        />
      ) : mode === "preview" ? (
        <EmailPreview html={value} meta={meta} />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
}

/**
 * The template as a recipient sees it.
 *
 * An iframe rather than a div, for two reasons that both matter. The app's CSS
 * cannot reach into it, so what is on screen is the HTML standing on its own —
 * which is the entire question being asked. And the HTML is whatever a tenant
 * typed into the source view, so it is rendered under `sandbox=""`: no scripts,
 * no same-origin access, no navigation of the page around it.
 */
function EmailPreview({
  html,
  meta,
}: {
  html: string;
  meta?: { subject?: string; fromName?: string };
}) {
  const [narrow, setNarrow] = useState(false);

  const doc = useMemo(() => previewDocument(substituteTokens(html)), [html]);
  const unknown = useMemo(() => unknownTokens(html), [html]);

  const empty = html.replace(/<[^>]*>/g, "").trim() === "";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs">
        <span className="text-slate-500">
          From{" "}
          <span className="font-medium text-slate-700">
            {meta?.fromName?.trim() || "—"}
          </span>
        </span>
        <span className="text-slate-500">
          Subject{" "}
          <span className="font-medium text-slate-700">
            {meta?.subject?.trim() || "—"}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setNarrow(false)}
            className={widthBtn(!narrow)}
          >
            Desktop
          </button>
          <button
            type="button"
            onClick={() => setNarrow(true)}
            className={widthBtn(narrow)}
          >
            Mobile
          </button>
        </span>
      </div>

      {unknown.length > 0 && (
        <p className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Sent as-is, with no value to substitute:{" "}
          <span className="font-mono">
            {unknown.map((t) => `{{${t}}}`).join(", ")}
          </span>
          . Check the spelling against the Custom values menu.
        </p>
      )}

      {empty ? (
        <p className="px-3 py-16 text-center text-sm text-slate-400">
          Nothing to preview yet.
        </p>
      ) : (
        <div className="bg-slate-100 p-3">
          <iframe
            // Keyed on the width so the frame reloads at its new size rather
            // than reflowing content laid out for the old one.
            key={narrow ? "narrow" : "wide"}
            title="Email preview"
            srcDoc={doc}
            sandbox=""
            className={`h-[420px] rounded border border-slate-200 bg-white ${
              narrow ? "mx-auto w-[375px]" : "w-full"
            }`}
          />
        </div>
      )}

      <p className="px-3 py-2 text-xs text-slate-500">
        Merge fields show sample data. Email clients vary — treat this as the
        shape of the message, not a pixel guarantee.
      </p>
    </div>
  );
}

function widthBtn(active: boolean) {
  return `rounded px-2 py-0.5 transition ${
    active ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
  }`;
}

function Toolbar({
  editor,
  mode,
  onMode,
}: {
  editor: Editor;
  mode: Mode;
  onMode: (next: Mode) => void;
}) {
  const ask = useAsk();
  const btn = (active: boolean) =>
    `rounded px-2 py-1 text-xs transition ${
      active ? "bg-slate-900 text-white" : "hover:bg-slate-200"
    }`;

  async function addLink() {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = await ask({
      title: previous ? "Edit link" : "Add link",
      label: "Link URL",
      defaultValue: previous ?? "https://",
      // The clearing behaviour was undiscoverable with a browser prompt and is
      // worth saying, since it is the only way to remove a link.
      hint: "Clear the field and confirm to remove the link.",
      confirmLabel: previous ? "Update link" : "Add link",
    });

    // Null is cancel; empty is a deliberate removal. The same distinction
    // window.prompt made, and the reason ask resolves to null rather than "".
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  async function addImage() {
    const url = await ask({
      title: "Insert image",
      label: "Image URL",
      placeholder: "https://example.com/photo.jpg",
      hint: "The image is linked, not uploaded, so it has to stay online where it is.",
      confirmLabel: "Insert",
      required: true,
    });
    if (url) editor.chain().focus().setImage({ src: url }).run();
  }

  function insertToken(token: string) {
    // Insert at the cursor so tokens can be dropped mid-sentence.
    editor.chain().focus().insertContent(token).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 p-1.5">
      {/* Formatting acts on the editor, so it is only shown when the editor is
          the thing on screen. Leaving it live over the source textarea or the
          preview was the confusing part: the buttons worked, just not on what
          the user was looking at. */}
      {mode === "editor" && (
        <>
      <button type="button" onClick={() => editor.chain().focus().undo().run()} className={btn(false)} title="Undo">↶</button>
      <button type="button" onClick={() => editor.chain().focus().redo().run()} className={btn(false)} title="Redo">↷</button>
      <Divider />

      <select
        value={
          editor.isActive("heading", { level: 1 })
            ? "1"
            : editor.isActive("heading", { level: 2 })
              ? "2"
              : editor.isActive("heading", { level: 3 })
                ? "3"
                : "p"
        }
        onChange={(e) => {
          const v = e.target.value;
          if (v === "p") editor.chain().focus().setParagraph().run();
          else
            editor
              .chain()
              .focus()
              .toggleHeading({ level: Number(v) as 1 | 2 | 3 })
              .run();
        }}
        className="rounded border border-slate-300 px-1 py-0.5 text-xs"
      >
        <option value="p">Paragraph</option>
        <option value="1">Heading 1</option>
        <option value="2">Heading 2</option>
        <option value="3">Heading 3</option>
      </select>
      <Divider />

      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive("bold"))}><b>B</b></button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive("italic"))}><i>I</i></button>
      <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive("underline"))}><u>U</u></button>
      <button type="button" onClick={() => editor.chain().focus().toggleCode().run()} className={btn(editor.isActive("code"))}>{"</>"}</button>
      <Divider />

      <input
        type="color"
        title="Text colour"
        onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        className="h-6 w-6 cursor-pointer rounded border border-slate-300"
      />
      <button type="button" onClick={() => editor.chain().focus().toggleHighlight().run()} className={btn(editor.isActive("highlight"))} title="Highlight">🖍</button>
      <Divider />

      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive("bulletList"))} title="Bullet list">•</button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive("orderedList"))} title="Numbered list">1.</button>
      <button type="button" onClick={() => editor.chain().focus().toggleTaskList().run()} className={btn(editor.isActive("taskList"))} title="Checklist">☑</button>
      <Divider />

      <button type="button" onClick={() => editor.chain().focus().sinkListItem("listItem").run()} className={btn(false)} title="Indent">⇥</button>
      <button type="button" onClick={() => editor.chain().focus().liftListItem("listItem").run()} className={btn(false)} title="Outdent">⇤</button>
      <Divider />

      <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btn(editor.isActive("blockquote"))} title="Quote">❝</button>
      <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btn(false)} title="Divider">―</button>
      <button type="button" onClick={addLink} className={btn(editor.isActive("link"))} title="Link">🔗</button>
      <button type="button" onClick={addImage} className={btn(false)} title="Image">🖼</button>
      <Divider />

      <button type="button" onClick={() => editor.chain().focus().setTextAlign("left").run()} className={btn(editor.isActive({ textAlign: "left" }))} title="Align left">⯇</button>
      <button type="button" onClick={() => editor.chain().focus().setTextAlign("center").run()} className={btn(editor.isActive({ textAlign: "center" }))} title="Align centre">≡</button>
      <button type="button" onClick={() => editor.chain().focus().setTextAlign("right").run()} className={btn(editor.isActive({ textAlign: "right" }))} title="Align right">⯈</button>
      <Divider />

      <select
        value=""
        onChange={(e) => {
          if (e.target.value) insertToken(e.target.value);
          e.target.value = "";
        }}
        className="rounded border border-slate-300 px-1 py-0.5 text-xs"
      >
        <option value="">Custom values…</option>
        {CUSTOM_VALUES.map((v) => (
          <option key={v.token} value={v.token}>
            {v.label}
          </option>
        ))}
      </select>
        </>
      )}

      <div className="ml-auto flex items-center gap-0.5 rounded bg-slate-100 p-0.5">
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            onClick={() => onMode(m.mode)}
            title={m.title}
            className={`rounded px-2 py-1 text-xs transition ${
              mode === m.mode
                ? "bg-white font-medium text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const MODES: { mode: Mode; label: string; title: string }[] = [
  { mode: "editor", label: "Editor", title: "Write and format" },
  { mode: "html", label: "HTML", title: "Edit the raw HTML" },
  { mode: "preview", label: "Preview", title: "See it as the recipient will" },
];

function Divider() {
  return <span className="mx-1 h-4 w-px bg-slate-200" />;
}
