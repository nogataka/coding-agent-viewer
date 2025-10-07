// Log processing types and interfaces
export var ToolResultValueType;
(function (ToolResultValueType) {
    ToolResultValueType["MARKDOWN"] = "markdown";
    ToolResultValueType["JSON"] = "json";
})(ToolResultValueType || (ToolResultValueType = {}));
export var CommandExitStatusType;
(function (CommandExitStatusType) {
    CommandExitStatusType["EXIT_CODE"] = "exit_code";
    CommandExitStatusType["SUCCESS"] = "success";
})(CommandExitStatusType || (CommandExitStatusType = {}));
export var MessageBoundary;
(function (MessageBoundary) {
    MessageBoundary["SPLIT"] = "split";
    MessageBoundary["INCOMPLETE_CONTENT"] = "incomplete_content";
})(MessageBoundary || (MessageBoundary = {}));
export function hasEntryIndex(metadata) {
    if (typeof metadata !== 'object' || metadata === null) {
        return false;
    }
    if (!('entry_index' in metadata)) {
        return false;
    }
    const value = metadata.entry_index;
    return typeof value === 'number';
}
//# sourceMappingURL=types.js.map