/**
 * Speech Coordinator — prevents mayor and citizen voices from overlapping.
 * Both voice systems clear their own state, then wait, then acquire the lock.
 */

let mayorSpeaking = false;
let citizenSpeaking = false;
let waiters: (() => void)[] = [];

export function setMayorSpeaking(speaking: boolean): void {
  mayorSpeaking = speaking;
  if (!speaking) flushWaiters();
}

export function setCitizenSpeaking(speaking: boolean): void {
  citizenSpeaking = speaking;
  if (!speaking) flushWaiters();
}

export function isMayorSpeaking(): boolean {
  return mayorSpeaking;
}

export function isCitizenSpeaking(): boolean {
  return citizenSpeaking;
}

/** Returns a promise that resolves when neither mayor nor citizen is speaking.
 *  Times out after 10 seconds to prevent permanent deadlocks. */
export function waitForSilence(): Promise<void> {
  if (!mayorSpeaking && !citizenSpeaking) return Promise.resolve();
  return new Promise(resolve => {
    waiters.push(resolve);

    // Failsafe: resolve after 10s even if the other speaker never signals done
    setTimeout(() => {
      const idx = waiters.indexOf(resolve);
      if (idx !== -1) {
        waiters.splice(idx, 1);
        console.warn('[SpeechCoordinator] Timeout — forcing silence');
        mayorSpeaking = false;
        citizenSpeaking = false;
        resolve();
      }
    }, 10000);
  });
}

function flushWaiters(): void {
  if (mayorSpeaking || citizenSpeaking) return;
  const pending = waiters.splice(0);
  pending.forEach(fn => fn());
}
