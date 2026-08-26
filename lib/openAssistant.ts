/* The global assistant takeover — any surface opens it with one event, the
 * same decoupling idiom the Messages modal uses (lib/openMessages.ts). */

export const OPEN_ASSISTANT_EVENT = 'topia:open-assistant';

export function openAssistant() {
  window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT));
}
