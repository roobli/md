/**
 * Line ending conversion helpers (Noto-compatible).
 *
 * In-memory edits and dialect render use LF. Restore the document's disk
 * endings only when writing bytes back out.
 */

export type LineEnding = 'lf' | 'crlf' | 'mixed';

export function toLf(text: string): string {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

/** Convert LF text to the target disk ending. `mixed` leaves LF as-is. */
export function fromLf(text: string, lineEnding: LineEnding): string {
  return lineEnding === 'crlf' ? text.replaceAll('\n', '\r\n') : text;
}
