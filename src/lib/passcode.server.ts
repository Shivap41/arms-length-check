/** Constant-time comparison against RESEARCH_PASSCODE. Server only. */
export function sameSecret(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a), right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}
/** null when the passcode is right; otherwise the message to show. */
export function passcodeError(passcode: string): string | null {
  const expected = process.env["RESEARCH_PASSCODE"];
  if (!expected) return "The research passcode has not been set up yet.";
  return sameSecret(passcode, expected) ? null : "Incorrect passcode.";
}
