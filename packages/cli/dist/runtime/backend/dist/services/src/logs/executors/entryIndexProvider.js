/**
 * Thread-safe provider for monotonically increasing entry indexes
 * Matches Rust's EntryIndexProvider implementation
 */
export class EntryIndexProvider {
    currentIndex;
    constructor(startIndex = 0) {
        this.currentIndex = startIndex;
    }
    /**
     * Get the next available index
     */
    next() {
        const index = this.currentIndex;
        this.currentIndex++;
        return index;
    }
    /**
     * Get the current index without incrementing
     */
    current() {
        return this.currentIndex;
    }
    /**
     * Reset the index to 0
     */
    reset() {
        this.currentIndex = 0;
    }
    /**
     * IEntryIndexProvider implementation - get current index
     */
    getCurrentEntryIndex() {
        return this.currentIndex;
    }
    /**
     * IEntryIndexProvider implementation - increment and return new index
     */
    incrementEntryIndex() {
        this.currentIndex++;
    }
    /**
     * Create a provider starting from the maximum existing normalized-entry index
     * observed in prior JSON patches in MsgStore
     */
    static startFrom(msgStore) {
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
    static new() {
        return new EntryIndexProvider(0);
    }
}
//# sourceMappingURL=entryIndexProvider.js.map