import type { BuilderCommand, TemplateId } from '@/lib/roadmap-builder/types';

/* The Roadmap Builder's chip vocabulary — one discriminated union, so the
 * orchestrator's handleChip switch stays exhaustiveness-checked. The shared
 * ChatPane only ever reads label/accent (ChipBase). */
export type Chip =
  | { label: string; t: 'project'; id: string; name: string }
  | { label: string; t: 'new_project' }
  | { label: string; t: 'world_wide' }
  | { label: string; t: 'template'; id: TemplateId }
  | { label: string; t: 'skip_name' }
  | { label: string; t: 'months'; n: number }
  | { label: string; t: 'pick_date' }
  | { label: string; t: 'skip_timeframe' }
  | { label: string; t: 'add' }
  | { label: string; t: 'timeline' }
  | { label: string; t: 'mark_done' }
  | { label: string; t: 'rename' }
  | { label: string; t: 'fund' }
  | { label: string; t: 'pick_ms'; index: number; rename?: boolean; goal?: boolean; cmd?: BuilderCommand }
  | { label: string; t: 'save'; accent?: boolean }
  | { label: string; t: 'finish_partial' }
  | { label: string; t: 'try_again' }
  | { label: string; t: 'keep_editing' }
  | { label: string; t: 'cancel' };
