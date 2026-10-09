/**
 * Trigger-conflict detection between flows.
 *
 * The runner starts the OLDEST active flow whose trigger matches an
 * inbound message (see findMatchingFlow in engine.ts), so two active
 * flows listening for the same word means the newer one silently never
 * runs. Activation uses this to warn and offer to pause the other flow.
 */

import { matchesKeywordTrigger } from "./engine";
import type { KeywordTriggerConfig } from "./types";

export interface TriggerFlow {
  id: string;
  name: string;
  trigger_type: "keyword" | "first_inbound_message" | "manual";
  trigger_config: Record<string, unknown>;
}

export interface TriggerConflict {
  id: string;
  name: string;
  /** The words both flows react to; empty for first-message overlaps. */
  words: string[];
  reason: "keyword" | "first_inbound_message";
}

function keywordsOf(cfg: Record<string, unknown>): string[] {
  const k = (cfg as { keywords?: unknown }).keywords;
  return Array.isArray(k) ? k.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
}

/**
 * Words that would start BOTH flows: any keyword of one flow that, sent
 * as a message, also matches the other's trigger (respecting each
 * flow's exact/contains + case settings).
 */
export function overlappingKeywords(a: TriggerFlow, b: TriggerFlow): string[] {
  if (a.trigger_type !== "keyword" || b.trigger_type !== "keyword") return [];
  const aCfg = a.trigger_config as unknown as KeywordTriggerConfig;
  const bCfg = b.trigger_config as unknown as KeywordTriggerConfig;
  // Keyed case-insensitively so "hi" and "HI" are reported once.
  const hits = new Map<string, string>();
  const add = (k: string) => {
    if (!hits.has(k.toLowerCase())) hits.set(k.toLowerCase(), k);
  };
  for (const k of keywordsOf(a.trigger_config)) {
    if (matchesKeywordTrigger(k, bCfg)) add(k);
  }
  for (const k of keywordsOf(b.trigger_config)) {
    if (matchesKeywordTrigger(k, aCfg)) add(k);
  }
  return [...hits.values()];
}

export function findTriggerConflicts(
  flow: TriggerFlow,
  activeOthers: TriggerFlow[],
): TriggerConflict[] {
  const out: TriggerConflict[] = [];
  for (const other of activeOthers) {
    if (other.id === flow.id) continue;
    if (
      flow.trigger_type === "first_inbound_message" &&
      other.trigger_type === "first_inbound_message"
    ) {
      out.push({ id: other.id, name: other.name, words: [], reason: "first_inbound_message" });
      continue;
    }
    const words = overlappingKeywords(flow, other);
    if (words.length > 0) {
      out.push({ id: other.id, name: other.name, words, reason: "keyword" });
    }
  }
  return out;
}
