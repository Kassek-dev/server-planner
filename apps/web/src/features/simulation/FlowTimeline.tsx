import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Led } from '../../ui/Led';
import { verdictLed } from './Steps';
import { useSimulation } from './store';

/** Milliseconds a hop stays highlighted while playing (docs/04 § 6.10: 1 s per segment). */
const HOP_MS = 1200;

/** O-10 Flow timeline: hops at the bottom of the canvas with ⏮ ⏯ ⏭; a blocked hop stops playback. */
export function FlowTimeline() {
  const { t } = useTranslation('simulation');
  const flow = useSimulation((s) => s.flow);
  const showHop = useSimulation((s) => s.showHop);

  useEffect(() => {
    if (!flow?.playing) return;
    const hop = flow.run.hops[flow.index];
    if (hop?.result.verdict !== 'reachable' || flow.index >= flow.run.hops.length - 1) {
      showHop(flow.index, false);
      return;
    }
    const timer = setTimeout(() => showHop(flow.index + 1), HOP_MS);
    return () => clearTimeout(timer);
  }, [flow, showHop]);

  if (!flow || flow.run.hops.length === 0) return null;
  const last = flow.run.hops.length - 1;
  const button =
    'flex size-8 items-center justify-center rounded-md text-text-primary hover:bg-tile-header disabled:opacity-45';
  return (
    <section
      aria-label={t('flows.timeline')}
      className="absolute right-4 bottom-16 left-4 flex items-center gap-3 rounded-md border border-border-default bg-raised px-3 py-2"
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t('flows.first')}
          className={button}
          disabled={flow.index === 0}
          onClick={() => showHop(0, false)}
        >
          <SkipBack size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={flow.playing ? t('flows.pause') : t('flows.play')}
          className={button}
          onClick={() =>
            showHop(
              flow.playing || flow.index >= last ? (flow.playing ? flow.index : 0) : flow.index,
              !flow.playing,
            )
          }
        >
          {flow.playing ? (
            <Pause size={16} aria-hidden="true" />
          ) : (
            <Play size={16} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          aria-label={t('flows.next')}
          className={button}
          disabled={flow.index >= last}
          onClick={() => showHop(flow.index + 1, false)}
        >
          <SkipForward size={16} aria-hidden="true" />
        </button>
      </div>
      <ol className="m-0 flex min-w-0 flex-1 list-none gap-1.5 overflow-x-auto p-0">
        {flow.run.hops.map((hop, i) => (
          <li key={`${hop.step}:${hop.kind}`}>
            <button
              type="button"
              onClick={() => showHop(i, false)}
              aria-current={i === flow.index ? 'step' : undefined}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-data-sm whitespace-nowrap ${i === flow.index ? 'border-accent bg-accent-subtle text-text-primary' : 'border-border-subtle text-text-secondary'}`}
            >
              <Led status={verdictLed[hop.result.verdict]} size={7} />
              {`${i + 1}. ${flow.labels[i]}`}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
