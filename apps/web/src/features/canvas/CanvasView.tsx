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
  MiniMap,
  type Node,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  ViewportPortal,
} from '@xyflow/react';
import { Map as MapIcon, Maximize, Minus, Plus } from 'lucide-react';
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useServices, useSession } from '../../app/services';
import { useResults } from '../../store/results';
import { Button } from '../../ui/Button';
import { useExportDialog } from '../export/store';
import { SimulationCanvasLayer } from '../simulation/CanvasLayer';
import { useSimulation } from '../simulation/store';
import {
  type ActionResult,
  addItemAt,
  connectDevices,
  type DraggedNode,
  deleteSelection,
  dropNodes,
  duplicateSelection,
} from './actions';
import { LinkEdge } from './edges/LinkEdge';
import { GRID } from './geometry';
import { type CanvasNode, type LinkEdgeData, toFlowEdges, toFlowNodes } from './graph';
import { itemLabel, Library } from './Library';
import { DRAG_MIME, type LibraryItem } from './library';
import { DeviceNode } from './nodes/DeviceNode';
import { LocationNode } from './nodes/LocationNode';
import { NoteNode } from './nodes/NoteNode';
import { OverlayControls } from './OverlayControls';
import { decorateEdges, decorateNodes, useCanvasView } from './overlays';
import { useSelection } from './selection';
import { alignmentGuides, type Guide, type Rect } from './waypoints';

const nodeTypes = { device: DeviceNode, location: LocationNode, note: NoteNode };
const edgeTypes = { link: LinkEdge };

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

  // Image export (D-04) reads the rendered nodes while this view is mounted.
  useEffect(() => {
    useExportDialog.setState({
      canvas: { getNodes: () => flow.getNodes(), getNodesBounds: (n) => flow.getNodesBounds(n) },
    });
    return () => useExportDialog.setState({ canvas: null });
  }, [flow]);

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

  // CAN-08 guides: what a single dragged node lines up with (edges and centres of other nodes).
  const [guides, setGuides] = useState<Guide[]>([]);
  const absoluteRect = useCallback(
    (n: Node): Rect => {
      const abs = flow.getInternalNode(n.id)?.internals.positionAbsolute ?? n.position;
      const size = (n.data as { size: { w: number; h: number } }).size;
      return { x: abs.x, y: abs.y, w: size.w, h: size.h };
    },
    [flow],
  );
  const onNodeDrag = useCallback(
    (_event: unknown, node: Node, dragged: Node[]) => {
      if (dragged.length !== 1) return setGuides([]);
      const others = flow
        .getNodes()
        .filter((n) => n.id !== node.id && n.parentId !== node.id)
        .map(absoluteRect);
      setGuides(alignmentGuides(absoluteRect(node), others));
    },
    [absoluteRect, flow],
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, _node: Node, dragged: Node[]) => {
      setGuides([]);
      const items: DraggedNode[] = dragged.map((n) => {
        const internal = flow.getInternalNode(n.id);
        const abs = internal?.internals.positionAbsolute ?? n.position;
        const size = (n.data as { size: { w: number; h: number } }).size;
        return {
          id: n.id,
          type: n.type === 'location' || n.type === 'note' ? n.type : 'device',
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

  // Overlays (CAN-06) and the simulation path decorate what React Flow draws, not the state.
  const linkColoring = useCanvasView((s) => s.links);
  const deviceColoring = useCanvasView((s) => s.devices);
  const capacity = useResults((s) => s.result?.capacity);
  const highlight = useSimulation((s) => s.highlight);
  const minimap = useCanvasView((s) => s.minimap);
  // Phones are view-only (docs/05 § 12): pan, pinch and tap; no dragging or cabling.
  const readOnly = useSession((s) => s.readOnly);
  const shownNodes = useMemo(
    () =>
      project
        ? decorateNodes(nodes, {
            project,
            view: { links: linkColoring, devices: deviceColoring },
            capacity,
            highlight,
          })
        : nodes,
    [nodes, project, linkColoring, deviceColoring, capacity, highlight],
  );
  const shownEdges = useMemo(
    () =>
      project
        ? decorateEdges(edges, {
            project,
            view: { links: linkColoring, devices: deviceColoring },
            highlight,
          })
        : edges,
    [edges, project, linkColoring, deviceColoring, highlight],
  );

  if (!project) return null;
  const empty =
    Object.keys(project.devices).length === 0 && Object.keys(project.locations).length === 0;

  return (
    <div className="flex min-h-0 flex-1">
      {readOnly ? null : (
        <Library
          onAdd={addAtCenter}
          onAddModel={(device, catalogVersion) =>
            report(
              addItemAt(
                session,
                { type: 'device', kind: device.kind, meta: '' },
                viewportCenter(),
                defaultName,
                { device, catalogVersion },
              ),
            )
          }
        />
      )}
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
          nodes={shownNodes}
          edges={shownEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          // A click on an already selected tile leaves a workload/app detail and shows the device.
          onNodeClick={(_event, clicked) => {
            const { detail, nodeIds, set } = useSelection.getState();
            if (detail && nodeIds.length === 1 && nodeIds[0] === clicked.id) set([clicked.id]);
          }}
          onConnect={onConnect}
          isValidConnection={(c) =>
            c.source !== c.target &&
            project.devices[c.source] !== undefined &&
            project.devices[c.target] !== undefined
          }
          connectionMode={ConnectionMode.Loose}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          // Layers from graph.ts: locations 0 < links 1 < devices 2 (docs/04 § 6.6), also inside racks.
          zIndexMode="manual"
          // Double-click belongs to notes and cables (edit, bend point), not to zooming.
          zoomOnDoubleClick={false}
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
          <ViewportPortal>
            {guides.map((g) => (
              <div
                key={g.axis}
                aria-hidden="true"
                className="pointer-events-none absolute bg-selection"
                style={
                  g.axis === 'x'
                    ? { left: g.at, top: g.from, width: 1, height: g.to - g.from }
                    : { left: g.from, top: g.at, width: g.to - g.from, height: 1 }
                }
              />
            ))}
          </ViewportPortal>
          {minimap ? (
            <MiniMap
              ariaLabel={t('minimap')}
              position="bottom-right"
              pannable
              zoomable
              bgColor="var(--sp-bg-raised)"
              nodeColor="var(--sp-bg-tile-header)"
              nodeStrokeColor="var(--sp-border-strong)"
              maskColor="color-mix(in srgb, var(--sp-bg-app) 60%, transparent)"
              className="mb-12! rounded-md border border-border-default"
            />
          ) : null}
        </ReactFlow>

        {empty && !readOnly ? <EmptyCanvas onAdd={addAtCenter} /> : null}
        {empty || readOnly ? null : <OverlayControls />}
        <SimulationCanvasLayer />
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
  const minimap = useCanvasView((s) => s.minimap);
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
      <button
        type="button"
        aria-label={t('zoom.minimap')}
        aria-pressed={minimap}
        className={`${button} border-l border-border-default ${minimap ? 'bg-accent-subtle' : ''}`}
        onClick={() => useCanvasView.setState({ minimap: !minimap })}
      >
        <MapIcon size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
