/**
 * Lynx has no queued-message store: the composer does not hold submissions
 * back while a turn runs. Upstream's timeline logic only carries this type on
 * its `queued-message` rows, which Lynx never produces, so the Web store and
 * the Web composer draft types it snapshots stay out of the Lynx program.
 */
export interface QueuedComposerMessage {
  id: string;
  prompt: string;
  createdAt: string;
}
