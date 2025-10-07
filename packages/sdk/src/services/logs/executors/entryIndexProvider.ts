import { MsgStore } from '../../../utils/msgStore.js';
import { IEntryIndexProvider } from './types.js';

/**
 * Thread-safe provider for monotonically increasing entry indexes
 * Matches Rust's EntryIndexProvider implementation
 */
export class EntryIndexProvider implements IEntryIndexProvider {
  private currentIndex: number;

  private constructor(startIndex: number = 0) {
    this.currentIndex = startIndex;
  }

  /**
   * Get the next available index
   */
  next(): number {
    const index = this.currentIndex;
    this.currentIndex++;
    return index;
  }

  /**
   * Get the current index without incrementing
   */
  current(): number {
    return this.currentIndex;
  }

  /**
   * Reset the index to 0
   */
  reset(): void {
    this.currentIndex = 0;
  }

  /**
   * IEntryIndexProvider implementation - get current index
   */
  getCurrentEntryIndex(): number {
    return this.currentIndex;
  }

  /**
   * IEntryIndexProvider implementation - increment and return new index
   */
  incrementEntryIndex(): void {
    this.currentIndex++;
  }

  /**
   * Create a provider starting from the maximum existing normalized-entry index
   * observed in prior JSON patches in MsgStore
   */
  static startFrom(msgStore: MsgStore): EntryIndexProvider {
    let maxIndex = -1;

    // Look through history for existing patch indices
    const history = msgStore.getHistory();
    for (const msg of history) {
      if (msg.type === 'json_patch' && msg.patches) {
        for (const patch of msg.patches) {
          if (patch.op === 'add' && patch.path) {
            const match = patch.path.match(/^\/entries\/(\d+)$/);
            if (match) {
              const index = parseInt(match[1], 10);
              if (index > maxIndex) {
                maxIndex = index;
              }
            }
          }
        }
      }
    }

    const startAt = maxIndex >= 0 ? maxIndex + 1 : 0;
    return new EntryIndexProvider(startAt);
  }

  /**
   * Create a new provider starting from 0
   */
  static new(): EntryIndexProvider {
    return new EntryIndexProvider(0);
  }
}
