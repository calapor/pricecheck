"use client";

import { useState, useCallback } from "react";

interface Retailer {
  id: string;
  slug: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
}

interface Props {
  initial: Retailer[];
  onSaved: () => void;
}

export function ShopsPanel({ initial, onSaved }: Props) {
  const [items, setItems] = useState<Retailer[]>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", baseUrl: "" });
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState({ name: "", baseUrl: "" });

  const reload = useCallback(async () => {
    const res = await fetch("/api/retailers");
    if (res.ok) setItems(await res.json());
  }, []);

  async function handleAdd() {
    if (!addDraft.name.trim() || !addDraft.baseUrl.trim()) return;
    await fetch("/api/retailers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(addDraft),
    });
    setAdding(false);
    setAddDraft({ name: "", baseUrl: "" });
    await reload();
    onSaved();
  }

  async function handleSave(id: string) {
    await fetch(`/api/retailers/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    setEditing(null);
    await reload();
    onSaved();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/retailers/${id}`, { method: "DELETE" });
    await reload();
    onSaved();
  }

  function startEdit(r: Retailer) {
    setEditing(r.id);
    setDraft({ name: r.name, baseUrl: r.baseUrl });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Shops</h2>
        <button
          onClick={() => setAdding(true)}
          className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          + Add
        </button>
      </div>

      {adding && (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <input
            autoFocus
            placeholder="Name *"
            value={addDraft.name}
            onChange={(e) => setAddDraft((d) => ({ ...d, name: e.target.value }))}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            placeholder="Base URL *"
            value={addDraft.baseUrl}
            onChange={(e) => setAddDraft((d) => ({ ...d, baseUrl: e.target.value }))}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Save
            </button>
            <button
              onClick={() => setAdding(false)}
              className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-1">
        {items.map((r) =>
          editing === r.id ? (
            <li key={r.id} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <input
                autoFocus
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <input
                value={draft.baseUrl}
                onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))}
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleSave(r.id)}
                  className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700"
                >
                  Cancel
                </button>
              </div>
            </li>
          ) : (
            <li
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <span>
                {r.name}
                <span className="ml-1 text-xs text-zinc-400">{r.slug}</span>
              </span>
              <div className="flex gap-2">
                <button onClick={() => startEdit(r)} className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
                  Edit
                </button>
                <button onClick={() => handleDelete(r.id)} className="text-xs text-red-500 hover:text-red-700">
                  Delete
                </button>
              </div>
            </li>
          ),
        )}
        {items.length === 0 && !adding && (
          <li className="py-4 text-center text-sm text-zinc-400">No shops yet.</li>
        )}
      </ul>
    </section>
  );
}
