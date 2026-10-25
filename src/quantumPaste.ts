export interface PastePosition { value: string; start: number; end: number; maxLength: number; multiline: boolean }

/** Match native input/textarea newline handling and the available character limit. */
export function pastePayload(text: string, position: PastePosition): string {
  const normalized = position.multiline ? text.replace(/\r\n?/g, '\n') : text.replace(/[\r\n]/g, '');
  const available = Math.max(0, (position.maxLength < 0 ? Infinity : position.maxLength) - (position.value.length - (position.end - position.start)));
  return normalized.slice(0, available);
}

export function insertReceived(position: PastePosition, output: string): string {
  return position.value.slice(0, position.start) + output + position.value.slice(position.end);
}

