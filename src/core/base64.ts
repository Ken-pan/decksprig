/** Decode binary media without building an intermediate array of characters. */
export function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const native = (Uint8Array as typeof Uint8Array & {fromBase64?: (input: string) => Uint8Array<ArrayBuffer>}).fromBase64;
  if (native) return native.call(Uint8Array, value);
  // Older runtimes retain atob's forgiving Base64 and invalid-input behavior.
  const binary = atob(value), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
