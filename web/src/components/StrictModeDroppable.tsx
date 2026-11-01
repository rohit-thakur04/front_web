"use client";

import { useEffect, useState } from "react";
import { Droppable, type DroppableProps } from "@hello-pangea/dnd";

// @hello-pangea/dnd (the react-beautiful-dnd fork) registers each droppable in a
// mount effect. Under React StrictMode in development the effect runs
// mount → unmount → mount, and with React 19's stricter double-invocation that
// can leave the droppable unregistered — so cards refuse to lift at all.
//
// Delaying the real <Droppable> by one animation frame lets that double-mount
// settle before registration. This is the community-standard workaround. In
// production there is no StrictMode double-invoke, so this is effectively a
// no-op (one frame's delay before the board becomes draggable).
export function StrictModeDroppable({ children, ...props }: DroppableProps) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEnabled(true));
    return () => {
      cancelAnimationFrame(raf);
      setEnabled(false);
    };
  }, []);

  if (!enabled) return null;
  return <Droppable {...props}>{children}</Droppable>;
}
