import '@xyflow/react/dist/base.css';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  type Connection,
  ConnectionMode,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
} from '@xyflow/react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useServices, useSession } from '../../app/services';
import { Button } from '../../ui/Button';
import {
  type ActionResult,
  addItemAt,
  connectDevices,
  type DraggedNode,
  deleteSelection,
  dropNodes,
  duplicateSelection,
} from './actions';
import { GRID } from './geometry';
import { type CanvasNode, type LinkEdgeData, toFlowEdges, toFlowNodes } from './graph';
import { itemLabel, Library } from './Library';
import { DRAG_MIME, type LibraryItem } from './library';
import { DeviceNode } from './nodes/DeviceNode';
import { LocationNode } from './nodes/LocationNode';
import { useSelection } from './selection';

const nodeTypes = { device: DeviceNode, location: LocationNode };

/** V-01 canvas (docs/05 § 4): library + React Flow; the project store stays the source of truth. */
export function CanvasWorkspace() {
  return (
    <ReactFlowProvider>
      <Workspace />
    </ReactFlowProvider>
  );
}

function Workspace() {
  const { t } = useTranslation('canvas');
  const { session } = useServices();
  const project = useSession((s) => s.project);
  const flow = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState<{
    code: string;
    params?: Record<string, string | number>;
  } | null>(null);
  const selection = useSelection();

  const derivedNodes = useMemo(() => (project ? toFlowNodes(project) : []), [project]);
  const derivedEdges = useMemo(
    () => (project ? toFlowEdges(project, derivedNodes) : []),
    [project, derivedNodes],
  );
  const [nodes, setNodes] = useState<CanvasNode[]>(derivedNodes);
  const [edges, setEdges] = useState<Edge<LinkEdgeData>[]>(derivedEdges);

  // Re-derive whenever the project changes (or a gesture was rejected), keeping the selection.
  const resync = useCallback(() => {
    const { nodeIds, edgeIds } = useSelection.getState();
    setNodes(derivedNodes.map((n) => ({ ...n, selected: nodeIds.includes(n.id) }) as CanvasNode));
    setEdges(derivedEdges.map((e) => ({ ...e, selected: edgeIds.includes(e.id) })));
  }, [derivedNodes, derivedEdges]);
  useEffect(resync, [resync]);

  const report = useCallback(
    (result: ActionResult) => {
      if (result.ok) {
        if (result.selectId) {
          const isEdge =
            derivedEdges.some((e) => e.id === result.selectId) ||
            project?.links[result.selectId] !== undefined;
          useSelection
            .getState()
            .set(isEdge ? [] : [result.selectId], isEdge ? [result.selectId] : []);
        }
        return;
      }
      setMessage({ code: result.code, ...(result.params ? { params: result.params } : {}) });
      resync();
    },
    [derivedEdges, project, resync],
  );

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
    const selects = changes.filter((c) => c.type === 'select');
    if (selects.length === 0) return;
    const { nodeIds, edgeIds, set } = useSelection.getState();
    const next = new Set(nodeIds);
    for (const c of selects) {
      if (c.selected) next.add(c.id);
      else next.delete(c.id);
    }
    set([...next], edgeIds);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<Edge<LinkEdgeData>>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
    const selects = changes.filter((c) => c.type === 'select');
    if (selects.length === 0) return;
    const { nodeIds, edgeIds, set } = useSelection.getState();
    const next = new Set(edgeIds);
    for (const c of selects) {
      if (c.selected) next.add(c.id);
      else next.delete(c.id);
    }
    set(nodeIds, [...next]);
  }, []);

  const onNodeDragStop = useCallback(
    (_event: unknown, _node: Node, dragged: Node[]) => {
      const items: DraggedNode[] = dragged.map((n) => {
        const internal = flow.getInternalNode(n.id);
        const abs = internal?.internals.positionAbsolute ?? n.position;
        const size = (n.data as { size: { w: number; h: number } }).size;
        return {
          id: n.id,
          type: n.type === 'location' ? 'location' : 'device',
          x: abs.x,
          y: abs.y,
          relative: n.position,
          w: size.w,
          h: size.h,
        };
      });
      report(dropNodes(session, items));
    },
    [flow, report, session],
  );

  const defaultName = useCallback((item: LibraryItem) => itemLabel(t, item), [t]);

  const viewportCenter = useCallback(() => {
    const box = wrapper.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return flow.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  }, [flow]);

  const addAtCenter = useCallback(
    (item: LibraryItem) => report(addItemAt(session, item, viewportCenter(), defaultName)),
    [defaultName, report, session, viewportCenter],
  );

  const onDrop = useCallback(
    (event: DragEvent) => {
      const raw = event.dataTransfer.getData(DRAG_MIME);
      if (!raw) return;
      event.preventDefault();
      const item = JSON.parse(raw) as LibraryItem;
      const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      report(addItemAt(session, item, point, defaultName));
    },
    [defaultName, flow, report, session],
  );

  const onConnect = useCallback(
    (connection: Connection) =>
      report(connectDevices(session, connection.source, connection.target)),
    [report, session],
  );

  // Keyboard: Delete, Ctrl+D / Ctrl+C+V (duplicate), Ctrl+A, Escape (docs/05 § 4.6).
  const clipboard = useRef<string[]>([]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [role="dialog"], [contenteditable="true"]'))
        return;
      const { nodeIds, edgeIds } = useSelection.getState();
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        report(deleteSelection(session, nodeIds, edgeIds));
        useSelection.getState().clear();
      } else if (mod && key === 'd') {
        event.preventDefault();
        report(duplicateSelection(session, nodeIds));
      } else if (mod && key === 'c') {
        clipboard.current = nodeIds;
      } else if (mod && key === 'v' && clipboard.current.length > 0) {
        event.preventDefault();
        report(duplicateSelection(session, clipboard.current));
      } else if (mod && key === 'a') {
        event.preventDefault();
        useSelection.getState().set(
          derivedNodes.map((n) => n.id),
          derivedEdges.map((e) => e.id),
        );
        resync();
      } else if (event.key === 'Escape') {
        useSelection.getState().clear();
        resync();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [derivedEdges, derivedNodes, report, resync, session]);

  // Selections made elsewhere (inspector, URL) are pushed into React Flow without touching positions.
  useEffect(() => {
    const nodeSet = new Set(selection.nodeIds);
    const edgeSet = new Set(selection.edgeIds);
    setNodes((current) =>
      current.some((n) => !!n.selected !== nodeSet.has(n.id))
        ? (current.map((n) => ({ ...n, selected: nodeSet.has(n.id) })) as CanvasNode[])
        : current,
    );
    setEdges((current) =>
      current.some((e) => !!e.selected !== edgeSet.has(e.id))
        ? current.map((e) => ({ ...e, selected: edgeSet.has(e.id) }))
        : current,
    );
  }, [selection.nodeIds, selection.edgeIds]);

  if (!project) return null;
  const empty =
    Object.keys(project.devices).length === 0 && Object.keys(project.locations).length === 0;

  return (
    <div className="flex min-h-0 flex-1">
      <Library onAdd={addAtCenter} />
      <section
        ref={wrapper}
        aria-label={t('canvas')}
        className="relative min-w-0 flex-1 bg-canvas"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DRAG_MIME)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={onDrop}
      >
        <ReactFlow<CanvasNode, Edge<LinkEdgeData>>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          isValidConnection={(c) =>
            c.source !== c.target &&
            project.devices[c.source] !== undefined &&
            project.devices[c.target] !== undefined
          }
          connectionMode={ConnectionMode.Loose}
          // Layers from graph.ts: locations 0 < links 1 < devices 2 (docs/04 § 6.6), also inside racks.
          zIndexMode="manual"
          snapToGrid
          snapGrid={[GRID, GRID]}
          minZoom={0.1}
          maxZoom={2}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          deleteKeyCode={null}
          selectionKeyCode="Shift"
          multiSelectionKeyCode="Shift"
          proOptions={{ hideAttribution: true }}
          className="sp-canvas"
        >
          <Background
            id="minor"
            variant={BackgroundVariant.Lines}
            gap={GRID * 2}
            color="var(--sp-canvas-grid)"
          />
        </ReactFlow>

        {empty ? <EmptyCanvas onAdd={addAtCenter} /> : null}
        <ZoomControls />
        {message ? (
          <div
            role="status"
            className="absolute bottom-4 left-4 max-w-120 rounded-md border border-error-border bg-error-bg px-3 py-2 text-body text-text-primary"
          >
            {t(`errors.${message.code}`, {
              defaultValue: t('errors.generic', { code: message.code }),
              ...message.params,
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function EmptyCanvas({ onAdd }: { onAdd: (item: LibraryItem) => void }) {
  const { t } = useTranslation('canvas');
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div className="pointer-events-auto flex max-w-100 flex-col items-center gap-3.5 text-center">
        <h2 className="m-0 text-title-lg font-semibold">{t('empty.title')}</h2>
        <p className="m-0 leading-normal text-text-secondary">{t('empty.description')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => onAdd({ type: 'location', kind: 'room', meta: '' })}>
            {t('empty.addRoom')}
          </Button>
          <Button onClick={() => onAdd({ type: 'location', kind: 'rack', meta: '12U' })}>
            {t('empty.addRack')}
          </Button>
          <Button
            variant="primary"
            onClick={() => onAdd({ type: 'device', kind: 'mini-pc', meta: '' })}
          >
            {t('empty.addDevice')}
          </Button>
        </div>
      </div>
    </div>
  );
}

const zoomSelector = (s: { transform: [number, number, number] }) => s.transform[2];

function ZoomControls() {
  const { t } = useTranslation('canvas');
  const flow = useReactFlow();
  const zoom = useStore(zoomSelector);
  const button = 'flex size-7.5 items-center justify-center text-text-primary hover:bg-tile-header';
  return (
    <div className="absolute right-4 bottom-4 flex overflow-hidden rounded-md border border-border-default bg-raised">
      <button
        type="button"
        aria-label={t('zoom.out')}
        className={button}
        onClick={() => void flow.zoomOut()}
      >
        <Minus size={14} aria-hidden="true" />
      </button>
      <span className="flex w-12 items-center justify-center border-x border-border-default font-mono text-data-sm text-text-secondary">
        {`${Math.round(zoom * 100)}%`}
      </span>
      <button
        type="button"
        aria-label={t('zoom.in')}
        className={button}
        onClick={() => void flow.zoomIn()}
      >
        <Plus size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={t('zoom.fit')}
        className={`${button} border-l border-border-default`}
        onClick={() => void flow.fitView({ padding: 0.2, maxZoom: 1 })}
      >
        <Maximize size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
