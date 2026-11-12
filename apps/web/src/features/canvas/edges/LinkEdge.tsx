import { setLinkWaypoints } from '@server-planner/model';
import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
  getStraightPath,
  useReactFlow,
} from '@xyflow/react';
import { type KeyboardEvent, memo, type PointerEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useServices, useSession } from '../../../app/services';
import { toGrid, toPx } from '../geometry';
import type { LinkEdgeData } from '../graph';
import { cablePath, insertionIndex, type Point } from '../waypoints';

/**
 * CAN-08 cable: orthogonal or straight, optionally through bend points (stored in grid units).
 * Double-click the cable adds a bend point; a selected cable shows its points — drag or arrow keys
 * move one, double-click or Delete removes it.
 */
export const LinkEdge = memo(function LinkEdge(props: EdgeProps<Edge<LinkEdgeData>>) {
  const { t } = useTranslation('canvas');
  const { session } = useServices();
  const readOnly = useSession((s) => s.readOnly);
  const flow = useReactFlow();
  const { id, data, selected, style, sourceX, sourceY, targetX, targetY } = props;
  const routing = data?.routing ?? 'orthogonal';
  const stored = data?.waypoints ?? [];
  // While a point is dragged the cable follows locally; the command runs on release.
  const [dragging, setDragging] = useState<{ index: number; at: Point } | null>(null);
  const waypoints = stored.map((p, i) =>
    dragging?.index === i ? dragging.at : { x: toPx(p.x), y: toPx(p.y) },
  );
  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };
  const points = [source, ...waypoints, target];

  const path =
    waypoints.length > 0
      ? cablePath(points, routing, props.sourcePosition, props.targetPosition)
      : routing === 'straight'
        ? getStraightPath(props)[0]
        : getSmoothStepPath({ ...props, borderRadius: 0 })[0];

  const save = (next: Point[]) =>
    session.dispatch(setLinkWaypoints, {
      id,
      waypoints: next.map((p) => ({ x: toGrid(p.x), y: toGrid(p.y) })),
    });
  const flowPoint = (event: { clientX: number; clientY: number }) =>
    flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });

  const addAt = (at: Point) => {
    if (readOnly) return;
    const next = [...waypoints];
    next.splice(insertionIndex(points, at), 0, at);
    save(next);
  };
  const remove = (index: number) => save(waypoints.filter((_, i) => i !== index));

  const onPointerDown = (index: number) => (event: PointerEvent<HTMLButtonElement>) => {
    if (readOnly || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging({ index, at: flowPoint(event) });
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragging) setDragging({ index: dragging.index, at: flowPoint(event) });
  };
  const onPointerUp = () => {
    if (!dragging) return;
    save(waypoints);
    setDragging(null);
  };
  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
      event.key
    ];
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      event.stopPropagation();
      remove(index);
    } else if (step) {
      event.preventDefault();
      event.stopPropagation();
      save(
        waypoints.map((p, i) =>
          i === index ? { x: p.x + toPx(step[0] ?? 0), y: p.y + toPx(step[1] ?? 0) } : p,
        ),
      );
    }
  };

  return (
    <>
      <BaseEdge id={id} path={path} {...(style ? { style } : {})} interactionWidth={16} />
      {readOnly ? null : (
        // A wider invisible stroke catches the double-click that adds a bend point; the keyboard
        // path is the link inspector (routing, remove bend points) and the point buttons below.
        // biome-ignore lint/a11y/noStaticElementInteractions: pointer shortcut on an SVG stroke
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={16}
          onDoubleClick={(event) => {
            event.stopPropagation();
            addAt(flowPoint(event));
          }}
        />
      )}
      {selected && !readOnly ? (
        <EdgeLabelRenderer>
          {waypoints.map((p, i) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: bend points have no identity but their order
              key={i}
              type="button"
              aria-label={t('link.waypoint', { index: i + 1, count: waypoints.length })}
              className="nodrag nopan pointer-events-auto absolute size-3 cursor-move rounded-xs border-2 border-selection bg-raised focus-visible:outline-2 focus-visible:outline-focus"
              style={{ transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)` }}
              onPointerDown={onPointerDown(i)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onDoubleClick={(event) => {
                event.stopPropagation();
                remove(i);
              }}
              onKeyDown={onKeyDown(i)}
            />
          ))}
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});
