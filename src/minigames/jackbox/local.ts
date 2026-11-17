/**
 * Typed answers from the local player. The HUD's text box pushes here; the module's
 * `readLocalInput` drains it each frame, so typed text reaches the rules core through the same
 * fixed-step input queue as key and touch presses.
 */
let queue: string[] = [];

export function submitAnswer(text: string) {
  queue.push(text);
}

export function drainAnswers(): string[] {
  const q = queue;
  queue = [];
  return q;
}
