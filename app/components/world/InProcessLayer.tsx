/* Public entry point for the In Process layer. The implementation lives in
 * ./in-process/ — import from HERE, never from a leaf, so the three mount
 * points (world tab, project orbit page, dashboard mirror) stay decoupled
 * from the file layout. */
export { default } from './in-process/Layer';
export type { EraView, EraMilestoneView, EraPostView, ProjectOption } from './in-process/types';
