/**
 * Converts a string to a valid git branch ID
 * 1. lowercase
 * 2. replace non-alphanumerics with hyphens
 * 3. trim extra hyphens
 * 4. take up to 10 chars, then trim trailing hyphens again
 */
export declare function gitBranchId(input: string): string;
/**
 * Generates a short UUID (first 4 characters of hex representation)
 */
export declare function shortUuid(uuid: string): string;
/**
 * Combines a prompt with an optional append string
 */
export declare function combinePrompt(append: string | undefined, prompt: string): string;
/**
 * Sanitizes a string for use as a filename
 */
export declare function sanitizeFileName(input: string): string;
/**
 * Truncates text to a maximum length with ellipsis
 */
export declare function truncateText(text: string, maxLength: number): string;
/**
 * Capitalizes the first letter of a string
 */
export declare function capitalize(input: string): string;
/**
 * Converts camelCase to kebab-case
 */
export declare function camelToKebab(input: string): string;
/**
 * Converts kebab-case to camelCase
 */
export declare function kebabToCamel(input: string): string;
/**
 * Extracts words from a string for search/indexing
 */
export declare function extractWords(text: string): string[];
//# sourceMappingURL=text.d.ts.map