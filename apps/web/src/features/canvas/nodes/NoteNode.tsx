import { updateNote } from '@server-planner/model';
import { type Node, type NodeProps, NodeResizer } from '@xyflow/react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useServices } from '../../../app/services';
import { GRID, toGrid } from '../geometry';
import type { NoteNodeData } from '../graph';

/** CAN-07 sticky note: double-click (or Enter) edits, Ctrl+Enter / blur saves, Esc cancels. */
export const NoteNode = memo(function NoteNode({
  data,
  selected,
}: NodeProps<Node<NoteNodeData, 'note'>>) {
  const { t } = useTranslation('canvas');
  const { session } = useServices();
  const { note } = data;
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    if (draft !== null && draft !== note.text)
      session.dispatch(updateNote, { id: note.id, changes: { text: draft } });
    setDraft(null);
  };
  return (
    <div
      className={`flex h-full flex-col overflow-hidden rounded-md bg-note text-text-primary shadow-raised ${selected ? 'outline-2 outline-selection' : ''}`}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={GRID * 6}
        minHeight={GRID * 3}
        lineClassName="border-selection!"
        handleClassName="size-2! bg-selection! border-0!"
        onResizeEnd={(_event, p) =>
          session.dispatch(updateNote, {
            id: note.id,
            changes: {
              rect: {
                x: toGrid(p.x),
                y: toGrid(p.y),
                w: Math.max(6, toGrid(p.width)),
                h: Math.max(3, toGrid(p.height)),
              },
            },
          })
        }
      />
      {draft !== null ? (
        <textarea
          // biome-ignore lint/a11y/noAutofocus: editing starts on an explicit double-click
          autoFocus
          aria-label={t('note.edit')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') setDraft(null);
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
          }}
          className="nodrag nowheel h-full w-full resize-none bg-transparent p-2.5 text-body outline-none"
        />
      ) : (
        <button
          type="button"
          aria-label={t('note.label', { text: note.text || t('note.empty') })}
          onDoubleClick={() => setDraft(note.text)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              setDraft(note.text);
            }
          }}
          className="flex h-full w-full cursor-grab flex-col justify-start overflow-hidden p-2.5 text-left text-body whitespace-pre-wrap"
        >
          {note.text || <span className="text-text-muted">{t('note.placeholder')}</span>}
        </button>
      )}
    </div>
  );
});
