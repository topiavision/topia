/* Shared view types for the In Process layer — one shape per concept so
 * every leaf component types off the same definitions. */

export interface EraMilestoneView { id: string; title: string; description: string | null; startDate: string | null; endDate: string | null; startPrecision: string | null; endPrecision: string | null; dateLabel: string | null; status: string; imageUrl: string | null; }
export interface EraPostView { id: string; kind: string; title: string; body: string | null; imageUrl: string | null; linkUrl: string | null; mintedUrl: string | null; milestoneId?: string | null; createdAt: string; }

/* One process-log card's data, whether it's a native post or a synced
 * In Process moment — what the PostModal renders. */
export interface LogEntry {
  id: string; postId: string | null; kind: string | null; glyph: string;
  title: string; body: string | null; imageUrl: string | null;
  date: string | null; linkUrl: string | null; mintedUrl: string | null;
  milestoneId: string | null;
}
export interface EraView { id: string; title: string; description: string | null; projectId?: string | null; projectName?: string | null; projectSlug?: string | null; startDate: string | null; endDate: string | null; startPrecision: string | null; endPrecision: string | null; startLabel: string | null; endLabel: string | null; status: string; inProcessUrl: string | null; milestones: EraMilestoneView[]; posts: EraPostView[]; }
export interface ProjectOption { id: string; name: string; slug: string; }
export interface Moment { id: string; name: string | null; imageUrl: string | null; mime: string | null; createdAt: string | null; collectUrl: string | null; }
