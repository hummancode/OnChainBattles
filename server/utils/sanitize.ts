// ============================================================
// sanitize.ts
// Input sanitization for user-provided strings.
// Strips HTML tags and trims to max length.
// ============================================================

/** Strip HTML tags and trim to maxLen. */
export function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, '')   // strip HTML tags
    .replace(/[<>&"']/g, '')   // strip remaining dangerous chars
    .trim()
    .slice(0, maxLen);
}
