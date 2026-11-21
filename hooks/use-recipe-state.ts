"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { z } from "zod";
import { EMPTY_EDITS, RecipeEdits, revertQuantity, setQuantity } from "@/lib/recipe/edits";
import type { Quantity } from "@/lib/recipe/schema";

/**
 * Per-recipe state that lives only in this browser (no accounts in the MVP):
 * the user's quantity corrections, checked-off ingredients, and Cook Mode position.
 * Validated on read so a corrupted or outdated entry resets instead of crashing.
 */
const StoredState = z.object({
  edits: RecipeEdits,
  checked: z.array(z.string()),
  step: z.number().int().nonnegative(),
  finished: z.boolean(),
});
export type StoredState = z.infer<typeof StoredState>;

const DEFAULT_STATE: StoredState = { edits: EMPTY_EDITS, checked: [], step: 0, finished: false };
const EVENT = "reelish:state";
const storageKey = (recipeId: string) => `reelish:v1:recipe:${recipeId}`;

// Fallback when localStorage is unavailable (e.g. some private-browsing modes).
const memory = new Map<string, string>();
const snapshots = new Map<string, { raw: string | null; value: StoredState }>();

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function read(recipeId: string): StoredState {
  const key = storageKey(recipeId);
  const raw = readRaw(key);
  const cached = snapshots.get(key);
  if (cached && cached.raw === raw) return cached.value; // stable reference for useSyncExternalStore
  let value = DEFAULT_STATE;
  if (raw) {
    try {
      const parsed = StoredState.safeParse(JSON.parse(raw));
      if (parsed.success) value = parsed.data;
    } catch {
      // ignore corrupt JSON and fall back to defaults
    }
  }
  snapshots.set(key, { raw, value });
  return value;
}

function write(recipeId: string, next: StoredState) {
  const key = storageKey(recipeId);
  const raw = JSON.stringify(next);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    memory.set(key, raw);
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange); // other tabs
  window.addEventListener(EVENT, onChange); // this tab
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function useRecipeState(recipeId: string) {
  const state = useSyncExternalStore(
    subscribe,
    () => read(recipeId),
    () => DEFAULT_STATE,
  );

  const update = useCallback((fn: (s: StoredState) => StoredState) => write(recipeId, fn(read(recipeId))), [recipeId]);

  const actions = useMemo(
    () => ({
      setQuantity: (ingredientId: string, quantity: Quantity) =>
        update((s) => ({ ...s, edits: setQuantity(s.edits, ingredientId, quantity) })),
      revertQuantity: (ingredientId: string) => update((s) => ({ ...s, edits: revertQuantity(s.edits, ingredientId) })),
      toggleChecked: (ingredientId: string, checked: boolean) =>
        update((s) => ({
          ...s,
          checked: checked ? [...new Set([...s.checked, ingredientId])] : s.checked.filter((id) => id !== ingredientId),
        })),
      clearChecked: () => update((s) => ({ ...s, checked: [] })),
      setStep: (step: number) => update((s) => ({ ...s, step: Math.max(0, step), finished: false })),
      finish: () => update((s) => ({ ...s, finished: true })),
      restartCooking: () => update((s) => ({ ...s, step: 0, finished: false })),
    }),
    [update],
  );

  return { state, ...actions };
}
