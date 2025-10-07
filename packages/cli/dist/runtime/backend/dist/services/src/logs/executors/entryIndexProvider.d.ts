import { MsgStore } from '../../../../utils/src/msgStore';
import { IEntryIndexProvider } from './types';
/**
 * Thread-safe provider for monotonically increasing entry indexes
 * Matches Rust's EntryIndexProvider implementation
 */
export declare class EntryIndexProvider implements IEntryIndexProvider {
    private currentIndex;
    private constructor();
    /**
     * Get the next available index
     */
    next(): number;
    /**
     * Get the current index without incrementing
     */
    current(): number;
    /**
     * Reset the index to 0
     */
    reset(): void;
    /**
     * IEntryIndexProvider implementation - get current index
     */
    getCurrentEntryIndex(): number;
    /**
     * IEntryIndexProvider implementation - increment and return new index
     */
    incrementEntryIndex(): void;
    /**
     * Create a provider starting from the maximum existing normalized-entry index
     * observed in prior JSON patches in MsgStore
     */
    static startFrom(msgStore: MsgStore): EntryIndexProvider;
    /**
     * Create a new provider starting from 0
     */
    static new(): EntryIndexProvider;
}
//# sourceMappingURL=entryIndexProvider.d.ts.map