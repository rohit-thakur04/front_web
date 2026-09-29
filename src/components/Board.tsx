"use client";

import { useMemo, useState } from "react";
import {
  DragDropContext,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { StrictModeDroppable as Droppable } from "./StrictModeDroppable";
import { api } from "@/lib/api";
import { RowAction, RowActions } from "@/components/RowActions";
import type {
  BoardAutomation,
  BoardResponse,
  Card,
  CardStageProgress,
  Stage,
} from "@/lib/types";
import { AutomationBadge } from "./AutomationBadge";
import { CardDialog } from "./CardDialog";
import { type ContactFilter, matchesFilter } from "@/lib/contactFilters";
import { runningCardIds } from "@/lib/boardRows";

interface Props {
  board: BoardResponse;
  setBoard: React.Dispatch<React.SetStateAction<BoardResponse | null>>;
  reload: () => Promise<void>;
  onError: (message: string) => void;
  /** Automation state, owned by the page so its toolbar can filter on it too. */
  automation: BoardAutomation | null;
  reloadAutomation: () => void;
  /** The toolbar's filter. Cards that fail it are hidden, stage by stage. */
  filter: ContactFilter;
  /** True when any part of the filter is on — see the drag note below. */
  filtering: boolean;
}

export function Board({
  board,
  setBoard,
  reload,
  onError,
  automation,
  reloadAutomation,
  filter,
  filtering,
}: Props) {
  const [editing, setEditing] = useState<{ stageId: string; card?: Card } | null>(
    null,
  );

  const pipelineId = board.pipeline._id;

  const progressFor = (cardId: string, stageId: string): CardStageProgress | undefined =>
    automation?.progress.find((p) => p.cardId === cardId && p.stageId === stageId);

  const running = useMemo(() => runningCardIds(automation), [automation]);

  /**
   * The cards each stage shows, after the filter.
   *
   * Computed once for the whole board rather than inside the render of each
   * column, because the header count and the list below it must be the same
   * number — deriving them separately is how those two drift.
   */
  const visible = useMemo(() => {
    const byStage = new Map<string, Card[]>();
    for (const stage of board.stages) {
      const cards = stage.cards ?? [];
      byStage.set(
        stage._id,
        filtering
          ? cards.filter((card) =>
              matchesFilter({ ...card, hasAutomation: running.has(card._id) }, filter),
            )
          : cards,
      );
    }
    return byStage;
  }, [board.stages, filter, filtering, running]);

  async function onDragEnd(result: DropResult) {
    const { source, destination, draggableId, type } = result;
    if (!destination) return;

    /*
     * Dragging is disabled while a filter is on, and this is the backstop.
     *
     * The move endpoint takes the full ordered list of card ids for the target
     * stage. Under a filter the column shows a subset, so sending what is on
     * screen would delete the hidden cards' positions — the drop index means
     * nothing in the real order either. Rather than guess a mapping back, the
     * filter has to be cleared before cards can be rearranged.
     */
    if (filtering) return;

    const samePlace =
      source.droppableId === destination.droppableId &&
      source.index === destination.index;
    if (samePlace) return;

    // Snapshot for rollback: every drag applies optimistically first.
    const snapshot = board;

    if (type === "COLUMN") {
      const stages = [...board.stages];
      const [moved] = stages.splice(source.index, 1);
      stages.splice(destination.index, 0, moved);
      setBoard({ ...board, stages });

      try {
        await api("/stages/reorder", {
          method: "PUT",
          body: { stageIds: stages.map((s) => s._id) },
        });
      } catch (err) {
        setBoard(snapshot); // Revert on failure.
        onError(err instanceof Error ? err.message : "Could not reorder columns");
      }
      return;
    }

    // type === "CARD"
    const stages = board.stages.map((s) => ({ ...s, cards: [...(s.cards ?? [])] }));
    const from = stages.find((s) => s._id === source.droppableId);
    const to = stages.find((s) => s._id === destination.droppableId);
    if (!from || !to) return;

    const [moved] = from.cards.splice(source.index, 1);
    if (!moved) return;
    moved.stageId = to._id;
    to.cards.splice(destination.index, 0, moved);
    setBoard({ ...board, stages });

    try {
      await api(`/cards/${draggableId}/move`, {
        method: "PUT",
        body: {
          stageId: to._id,
          cardIds: to.cards.map((c) => c._id),
        },
      });
      // A cross-stage move stops one sequence and starts another, so the badges
      // are stale the moment it lands. A same-stage reorder changes nothing.
      if (source.droppableId !== destination.droppableId) {
        reloadAutomation();
      }
    } catch (err) {
      setBoard(snapshot);
      onError(err instanceof Error ? err.message : "Could not move card");
    }
  }

  async function addStage() {
    const name = window.prompt("Column name");
    if (!name?.trim()) return;
    try {
      await api<Stage>(`/pipelines/${pipelineId}/stages`, {
        method: "POST",
        body: { name: name.trim() },
      });
      await reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not add column");
    }
  }

  async function deleteStage(stage: Stage) {
    if (
      !window.confirm(`Delete "${stage.name}"? Its cards will be deleted too.`)
    )
      return;
    try {
      await api(`/stages/${stage._id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not delete column");
    }
  }

  async function deleteCard(card: Card) {
    if (!window.confirm(`Delete "${card.name}"?`)) return;
    try {
      await api(`/cards/${card._id}`, { method: "DELETE" });
      await reload();
      reloadAutomation();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not delete card");
    }
  }

  return (
    <>
      {/* One DragDropContext drives both column reorder and card movement. */}
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="board" direction="horizontal" type="COLUMN">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="flex flex-1 items-start gap-3 overflow-x-auto p-4"
            >
              {board.stages.map((stage, index) => {
                const shown = visible.get(stage._id) ?? [];
                return (
                <Draggable
                  key={stage._id}
                  draggableId={stage._id}
                  index={index}
                  isDragDisabled={filtering}
                >
                  {(dragProvided, dragSnapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      className={`flex w-72 shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-100 ${
                        dragSnapshot.isDragging ? "shadow-lg" : ""
                      }`}
                    >
                      <div
                        {...dragProvided.dragHandleProps}
                        className="flex items-center gap-2 rounded-t-xl px-3 py-2"
                        style={{ borderTop: `3px solid ${stage.color}` }}
                      >
                        <span className="flex-1 text-sm font-semibold">
                          {stage.name}
                        </span>
                        <span
                          className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-500"
                          title={filtering ? "Matching cards in this stage" : undefined}
                        >
                          {filtering
                            ? `${shown.length} of ${stage.cards?.length ?? 0}`
                            : (stage.cards?.length ?? 0)}
                        </span>
                        <button
                          onClick={() => deleteStage(stage)}
                          title="Delete column"
                          className="text-slate-400 hover:text-red-600"
                        >
                          ×
                        </button>
                      </div>

                      <Droppable
                        droppableId={stage._id}
                        type="CARD"
                        isDropDisabled={filtering}
                      >
                        {(cardsProvided, cardsSnapshot) => (
                          <div
                            ref={cardsProvided.innerRef}
                            {...cardsProvided.droppableProps}
                            // min-h is about two cards so an empty column is
                            // still an easy drop target; max-h lets a long column
                            // scroll inside itself, keeping the board header and
                            // every stage header on screen.
                            className={`min-h-[120px] max-h-[calc(100vh-18rem)] space-y-2 overflow-y-auto px-2 pb-2 ${
                              cardsSnapshot.isDraggingOver ? "bg-slate-200" : ""
                            }`}
                          >
                            {shown.length === 0 && filtering && (
                              <p className="px-1 py-3 text-center text-xs text-slate-400">
                                No matches
                              </p>
                            )}
                            {shown.map((card, cardIndex) => (
                              <Draggable
                                key={card._id}
                                draggableId={card._id}
                                index={cardIndex}
                                isDragDisabled={filtering}
                              >
                                {(cardProvided, cardSnapshot) => (
                                  <div
                                    ref={cardProvided.innerRef}
                                    {...cardProvided.draggableProps}
                                    {...cardProvided.dragHandleProps}
                                    className={`rounded-lg border border-slate-200 bg-white p-2.5 text-sm ${
                                      cardSnapshot.isDragging ? "shadow-lg" : ""
                                    }`}
                                  >
                                    <div className="flex items-start gap-2">
                                      <span className="flex-1 font-medium">
                                        {card.name}
                                      </span>
                                      <RowActions>
                                        <RowAction
                                          action="edit"
                                          label="Edit"
                                          onClick={() => setEditing({ stageId: stage._id, card })}
                                        />
                                        {/* Was a bare "×", which reads as "close"
                                            rather than "remove". A trash icon says
                                            what it does. */}
                                        <RowAction
                                          action="delete"
                                          label="Delete"
                                          onClick={() => deleteCard(card)}
                                        />
                                      </RowActions>
                                    </div>

                                    {card.email && (
                                      <p className="mt-0.5 truncate text-xs text-slate-500">
                                        {card.email}
                                      </p>
                                    )}
                                    {card.value > 0 && (
                                      <p className="mt-0.5 text-xs font-medium text-slate-700">
                                        ₹{card.value.toLocaleString("en-IN")}
                                      </p>
                                    )}

                                    <div className="mt-1.5">
                                      <AutomationBadge
                                        progress={progressFor(card._id, stage._id)}
                                        templateCount={
                                          automation?.stageTemplateCounts[stage._id] ?? 0
                                        }
                                        intervalHours={automation?.intervalHours ?? 24}
                                      />
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {cardsProvided.placeholder}
                          </div>
                        )}
                      </Droppable>

                      <button
                        onClick={() => setEditing({ stageId: stage._id })}
                        className="mx-2 mb-2 rounded-lg py-1.5 text-sm text-slate-500 hover:bg-slate-200"
                      >
                        + Add card
                      </button>
                    </div>
                  )}
                </Draggable>
                );
              })}
              {provided.placeholder}

              <button
                onClick={addStage}
                className="w-40 shrink-0 rounded-xl border border-dashed border-slate-300 py-2 text-sm text-slate-500 hover:bg-slate-100"
              >
                + Add column
              </button>
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {editing && (
        <CardDialog
          stageId={editing.stageId}
          card={editing.card}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
            reloadAutomation();
          }}
          onError={onError}
        />
      )}
    </>
  );
}
