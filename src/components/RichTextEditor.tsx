"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { editorExtensions } from "./editorExtensions";

const CUSTOM_VALUES = [
  { label: "Contact name", token: "{{name}}" },
  { label: "Phone", token: "{{phone}}" },
  { label: "Email", token: "{{email}}" },
  { label: "Pipeline name", token: "{{pipelineName}}" },
];

interface Props {
  value: string;
  onChange: (html: string) => void;
}

export function RichTextEditor({ value, onChange }: Props) {
  const [showSource, setShowSource] = useState(false);
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
    setShowSource(false);
  }

  return (
    <div className="rounded-lg border border-slate-300 bg-white">
      <Toolbar
        editor={editor}
        showSource={showSource}
        onToggleSource={() => {
          if (!showSource) setSource(editor.getHTML());
          else applySource();
          setShowSource((s) => !s);
        }}
      />

      {showSource ? (
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onBlur={applySource}
          spellCheck={false}
          className="min-h-[280px] w-full resize-y px-3 py-2 font-mono text-xs outline-none"
        />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
}

function Toolbar({
  editor,
  showSource,
  onToggleSource,
}: {
  editor: Editor;
  showSource: boolean;
  onToggleSource: () => void;
}) {
  const btn = (active: boolean) =>
    `rounded px-2 py-1 text-xs transition ${
      active ? "bg-slate-900 text-white" : "hover:bg-slate-200"
    }`;

  function addLink() {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function addImage() {
    const url = window.prompt("Image URL");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  }

  function insertToken(token: string) {
    // Insert at the cursor so tokens can be dropped mid-sentence.
    editor.chain().focus().insertContent(token).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 p-1.5">
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

      <button
        type="button"
        onClick={onToggleSource}
        className={`ml-auto ${btn(showSource)}`}
        title="Toggle HTML source"
      >
        {showSource ? "Editor" : "HTML"}
      </button>
    </div>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-slate-200" />;
}
