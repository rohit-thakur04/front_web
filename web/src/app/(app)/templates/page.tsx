"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { EmailTemplate, Pipeline, Stage } from "@/lib/types";

type Tab = "templates" | "archived";

export default function TemplatesPage() {
  // Read once on mount: it seeds the stage selection and must not fight the
  // user's later choice from the dropdown.
  const searchParams = useSearchParams();
  const [wantedStageId] = useState(() => searchParams.get("stageId") ?? "");

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [stageId, setStageId] = useState("");

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [tab, setTab] = useState<Tab>("templates");
  const [search, setSearch] = useState("");
  const [sortLatestFirst, setSortLatestFirst] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Pipeline[]>("/pipelines")
      .then((list) => {
        setPipelines(list);
        if (list[0]) setPipelineId(list[0]._id);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!pipelineId) return;
    api<Stage[]>(`/pipelines/${pipelineId}/stages`)
      .then((list) => {
        setStages(list);
        // Honour ?stageId= when it belongs to this pipeline, so coming back from
        // the editor lands on the stage that was just saved into rather than on
        // whichever stage happens to be first.
        const wanted = wantedStageId;
        setStageId(
          wanted && list.some((s) => s._id === wanted) ? wanted : (list[0]?._id ?? ""),
        );
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId]);

  /*
   * Every template for this tab is fetched once and filtered in the browser.
   *
   * It used to refetch per stage, with the stage defaulting to the first one in
   * the first pipeline. So a template saved into any other stage was simply not
   * in the response, the list said "No templates here yet", and the obvious
   * conclusion was that the save had failed — a QA pass produced two identical
   * templates that way before noticing. Holding the whole set also means the
   * empty state can say where the others actually are, instead of implying
   * there are none.
   */
  async function loadTemplates() {
    try {
      setTemplates(
        await api<EmailTemplate[]>(`/templates?archived=${tab === "archived"}`),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load templates");
    }
  }

  useEffect(() => {
    async function run() {
      await loadTemplates();
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Templates in the selected stage, before the search box is applied.
  const inStage = useMemo(
    () => (stageId ? templates.filter((t) => t.stageId === stageId) : templates),
    [templates, stageId],
  );
  // How many sit in a stage other than the selected one, so an empty list can
  // distinguish "you have none" from "none here".
  const elsewhere = templates.length - inStage.length;

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? inStage.filter(
          (t) =>
            t.name.toLowerCase().includes(term) ||
            t.subject.toLowerCase().includes(term),
        )
      : inStage;

    return [...filtered].sort((a, b) => {
      const cmp =
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      return sortLatestFirst ? cmp : -cmp;
    });
  }, [inStage, search, sortLatestFirst]);

  const stageName = stages.find((s) => s._id === stageId)?.name ?? "";

  async function act(t: EmailTemplate, action: string) {
    setMenuFor(null);
    try {
      switch (action) {
        case "duplicate":
          await api(`/templates/${t._id}/duplicate`, { method: "POST" });
          break;
        case "archive":
          await api(`/templates/${t._id}`, {
            method: "PUT",
            body: { isArchived: !t.isArchived },
          });
          break;
        case "toggle":
          await api(`/templates/${t._id}`, {
            method: "PUT",
            body: { isActive: !t.isActive },
          });
          break;
        case "delete":
          if (!window.confirm(`Delete "${t.name}"?`)) return;
          await api(`/templates/${t._id}`, { method: "DELETE" });
          break;
      }
      await loadTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Email Templates</h1>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={sortLatestFirst ? "latest" : "oldest"}
            onChange={(e) => setSortLatestFirst(e.target.value === "latest")}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="latest">Latest First</option>
            <option value="oldest">Oldest First</option>
          </select>

          <input
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />

          <button
            disabled
            title="Folders are not available yet"
            className="cursor-not-allowed rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-400"
          >
            Folders
          </button>

          {stageId && (
            <Link
              href={`/templates/new?stageId=${stageId}`}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              + New
            </Link>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={pipelineId}
          onChange={(e) => setPipelineId(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          {pipelines.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>

        <select
          value={stageId}
          onChange={(e) => setStageId(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          {stages.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3 flex gap-1 border-b border-slate-200">
        {(["templates", "archived"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm capitalize transition ${
              tab === t
                ? "border-slate-900 font-medium"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <p className="mb-3 text-xs text-slate-500">
        All Templates {stageName && <>&gt; {stageName}</>}
      </p>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={visible.length > 0 && selected.size === visible.length}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? new Set(visible.map((t) => t._id)) : new Set(),
                    )
                  }
                />
              </th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Last Updated</th>
              <th className="px-3 py-2">Details</th>
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center">
                  {templates.length === 0 ? (
                    <div className="text-slate-500">
                      <p className="font-medium text-slate-700">
                        No {tab === "archived" ? "archived " : ""}templates yet
                      </p>
                      <p className="mt-1 text-sm">
                        A template is one email in a stage&apos;s follow-up
                        sequence, sent on the day number you give it.
                      </p>
                      {tab === "templates" && stageId && (
                        <Link
                          href={`/templates/new?stageId=${stageId}`}
                          className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                        >
                          Create your first template
                        </Link>
                      )}
                    </div>
                  ) : search.trim() ? (
                    <p className="text-sm text-slate-500">
                      Nothing matches &ldquo;{search.trim()}&rdquo; in this stage.
                    </p>
                  ) : (
                    <div className="text-slate-500">
                      <p className="text-sm">
                        No templates in this stage.
                      </p>
                      {elsewhere > 0 && (
                        // The point of the fix: a stage-scoped list that says
                        // "none yet" reads as a failed save.
                        <p className="mt-1 text-sm">
                          You have {elsewhere} in other stages — pick a different
                          stage above.
                        </p>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            )}

            {visible.map((t) => (
              <tr
                key={t._id}
                className={`border-b border-slate-100 last:border-0 ${
                  t.isActive ? "" : "bg-slate-50 text-slate-400"
                }`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(t._id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(t._id);
                      else next.delete(t._id);
                      setSelected(next);
                    }}
                  />
                </td>

                <td className="px-3 py-2">
                  <Link href={`/templates/${t._id}`} className="font-medium hover:underline">
                    {t.name}
                  </Link>
                  <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[11px] text-slate-700">
                    Day {t.dayNumber}
                  </span>
                  {!t.isActive && (
                    <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[11px]">
                      Inactive
                    </span>
                  )}
                </td>

                <td className="px-3 py-2 text-slate-500">
                  {new Date(t.updatedAt).toLocaleDateString()}
                </td>

                <td className="px-3 py-2">
                  <div>{t.subject}</div>
                  <div className="text-xs text-slate-400">
                    From: {t.fromName || "—"} &nbsp; Reply: {t.replyTo || "—"}
                  </div>
                </td>

                <td className="relative px-3 py-2">
                  <button
                    onClick={() => setMenuFor(menuFor === t._id ? null : t._id)}
                    className="rounded px-2 hover:bg-slate-100"
                  >
                    ⋯
                  </button>

                  {menuFor === t._id && (
                    <div className="absolute right-3 top-9 z-10 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-900 shadow-lg">
                      <Link
                        href={`/templates/${t._id}`}
                        className="block px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                      >
                        Edit
                      </Link>
                      {[
                        ["duplicate", "Duplicate"],
                        ["archive", t.isArchived ? "Unarchive" : "Archive"],
                        ["toggle", t.isActive ? "Set inactive" : "Set active"],
                      ].map(([action, label]) => (
                        <button
                          key={action}
                          onClick={() => act(t, action)}
                          className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        onClick={() => act(t, "delete")}
                        className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
