"use client";

import { useState, useCallback } from "react";

interface Product {
  id: string;
  title: string;
  brand: string | null;
  category: string | null;
}

interface Props {
  initial: Product[];
  onSaved: () => void;
}

export function ProductsPanel({ initial, onSaved }: Props) {
  const [items, setItems] = useState<Product[]>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", brand: "", category: "" });
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState({ title: "", brand: "", category: "" });

  const reload = useCallback(async () => {
    const res = await fetch("/api/products");
    if (res.ok) setItems(await res.json());
  }, []);

  async function handleAdd() {
    if (!addDraft.title.trim()) return;
    await fetch("/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(addDraft),
    });
    setAdding(false);
    setAddDraft({ title: "", brand: "", category: "" });
    await reload();
    onSaved();
  }

  async function handleSave(id: string) {
    await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    setEditing(null);
    await reload();
    onSaved();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    await reload();
    onSaved();
  }

  function startEdit(p: Product) {
    setEditing(p.id);
    setDraft({ title: p.title, brand: p.brand ?? "", category: p.category ?? "" });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Products</h2>
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
            placeholder="Title *"
            value={addDraft.title}
            onChange={(e) => setAddDraft((d) => ({ ...d, title: e.target.value }))}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            placeholder="Brand"
            value={addDraft.brand}
            onChange={(e) => setAddDraft((d) => ({ ...d, brand: e.target.value }))}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            placeholder="Category"
            value={addDraft.category}
            onChange={(e) => setAddDraft((d) => ({ ...d, category: e.target.value }))}
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
        {items.map((p) =>
          editing === p.id ? (
            <li key={p.id} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <input
                autoFocus
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <input
                placeholder="Brand"
                value={draft.brand}
                onChange={(e) => setDraft((d) => ({ ...d, brand: e.target.value }))}
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleSave(p.id)}
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
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <span>
                {p.title}
                {p.brand && <span className="ml-1 text-zinc-400">· {p.brand}</span>}
              </span>
              <div className="flex gap-2">
                <button onClick={() => startEdit(p)} className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
                  Edit
                </button>
                <button onClick={() => handleDelete(p.id)} className="text-xs text-red-500 hover:text-red-700">
                  Delete
                </button>
              </div>
            </li>
          ),
        )}
        {items.length === 0 && !adding && (
          <li className="py-4 text-center text-sm text-zinc-400">No products yet.</li>
        )}
      </ul>
    </section>
  );
}
