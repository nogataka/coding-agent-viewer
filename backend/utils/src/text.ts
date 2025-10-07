// Text processing utilities - equivalent to Rust's utils/src/text.rs

/**
 * Converts a string to a valid git branch ID
 * 1. lowercase
 * 2. replace non-alphanumerics with hyphens
 * 3. trim extra hyphens
 * 4. take up to 10 chars, then trim trailing hyphens again
 */
export function gitBranchId(input: string): string {
  // 1. lowercase
  const lower = input.toLowerCase();

  // 2. replace non-alphanumerics with hyphens
  const slug = lower.replace(/[^a-z0-9]+/g, '-');

  // 3. trim extra hyphens
  const trimmed = slug.replace(/^-+|-+$/g, '');

  // 4. take up to 10 chars, then trim trailing hyphens again
  const cut = trimmed.substring(0, 10);
  return cut.replace(/-+$/, '');
}

/**
 * Generates a short UUID (first 4 characters of hex representation)
 */
export function shortUuid(uuid: string): string {
  // Remove hyphens to get 32-char hex string, then take first 4 chars
  const simpleUuid = uuid.replace(/-/g, '');
  return simpleUuid.substring(0, 4);
}

/**
 * Combines a prompt with an optional append string
 */
export function combinePrompt(append: string | undefined, prompt: string): string {
  if (append !== undefined && append !== null) {
    return `${prompt}${append}`;
  }
  return prompt;
}

/**
 * Sanitizes a string for use as a filename
 */
export function sanitizeFileName(input: string): string {
  // Replace invalid filename characters with underscores
  return input
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .toLowerCase();
}

/**
 * Truncates text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Capitalizes the first letter of a string
 */
export function capitalize(input: string): string {
  if (!input) return input;
  return input.charAt(0).toUpperCase() + input.slice(1);
}

/**
 * Converts camelCase to kebab-case
 */
export function camelToKebab(input: string): string {
  return input.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Converts kebab-case to camelCase
 */
export function kebabToCamel(input: string): string {
  return input.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Extracts words from a string for search/indexing
 */
export function extractWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0);
}
