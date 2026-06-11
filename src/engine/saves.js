const STORAGE_KEY = "vn-saves";
export const SLOT_COUNT = 6;

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

export function listSaves() {
  const all = readAll();
  return Array.from({ length: SLOT_COUNT }, (_, i) => all[i] ?? null);
}

export function saveToSlot(slot, snapshot) {
  const all = readAll();
  all[slot] = { ...snapshot, savedAt: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function loadFromSlot(slot) {
  return readAll()[slot] ?? null;
}

export function deleteSlot(slot) {
  const all = readAll();
  delete all[slot];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
