/** Group a pairing code for scanning while preserving the server value for copy. */
export function formatPairingCodeForDisplay(code: string): string {
  const compact = code.replace(/[\s-]/g, '');
  if (compact.length <= 4) return code;
  return compact.match(/.{1,4}/g)?.join(' ') || code;
}
