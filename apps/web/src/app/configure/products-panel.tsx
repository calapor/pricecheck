"use client";

import { useState, useCallback } from "react";

interface Alias {
  id: string;
  alias: string;
}

interface Product {
  id: string;
  title: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  aliases: Alias[];
}

interface Props {
  initial: Product[];
  onSaved: () => void;
}

function Thumb({ url, alt }: { url: string | null; alt: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} className="h-8 w-8 shrink-0 rounded object-cover" />;
  }
  return <div className="h-8 w-8 shrink-0 rounded bg-zinc-100 dark:bg-zinc-800" aria-hidden />;
}

/** Alias CRUD for a product, shown inside the edit view. */
function AliasEditor({ product, onChanged }: { product: Product; onChanged: () => void }) {
  const [newAlias, setNewAlias] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  async function add() {
    const alias = newAlias.trim();
    if (!alias) return;
    await fetch(`/api/products/${product.id}/aliases`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alias }),
    });
    setNewAlias("");
    onChanged();
  }

  async function save(aliasId: string) {
    const alias = editValue.trim();
    if (!alias) return;
    await fetch(`/api/products/${product.id}/aliases/${aliasId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alias }),
    });
    setEditingId(null);
    onChanged();
  }

  async function remove(aliasId: string) {
    await fetch(`/api/products/${product.id}/aliases/${aliasId}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-zinc-100 pt-2 dark:border-zinc-800">
      <div className="text-xs font-medium text-zinc-500">
        Alternative names <span className="font-normal">(matched at shops when the main name finds nothing)</span>
      </div>
      {product.aliases.map((a) =>
        editingId === a.id ? (
          <div key={a.id} className="flex gap-1">
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save(a.id)}
              className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button onClick={() => save(a.id)} className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
              Save
            </button>
            <button onClick={() => setEditingId(null)} className="text-xs text-zinc-400 hover:text-zinc-700">
              Cancel
            </button>
          </div>
        ) : (
          <div key={a.id} className="flex items-center justify-between rounded bg-zinc-50 px-2 py-1 text-sm dark:bg-zinc-900">
            <span>{a.alias}</span>
            <div className="flex gap-2">
              <button
                onClick={() => { setEditingId(a.id); setEditValue(a.alias); }}
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              >
                Edit
              </button>
              <button onClick={() => remove(a.id)} className="text-xs text-red-500 hover:text-red-700">
                Delete
              </button>
            </div>
          </div>
        ),
      )}
      <div className="flex gap-1">
        <input
          placeholder="+ Add name"
          value={newAlias}
          onChange={(e) => setNewAlias(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button onClick={add} className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900">
          Add
        </button>
      </div>
    </div>
  );
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

  const editingProduct = items.find((p) => p.id === editing) ?? null;

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
          <p className="text-xs text-zinc-400">Add alternative shop names after saving, via Edit.</p>
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
          editing === p.id && editingProduct ? (
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
              <AliasEditor product={editingProduct} onChanged={reload} />
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
              <span className="flex items-center gap-2">
                <Thumb url={p.imageUrl} alt={p.title} />
                <span className="flex flex-col">
                  <span>
                    {p.title}
                    {p.brand && <span className="ml-1 text-zinc-400">· {p.brand}</span>}
                  </span>
                  {p.aliases.length > 0 && (
                    <span className="text-xs text-zinc-400">
                      also: {p.aliases.map((a) => a.alias).join(", ")}
                    </span>
                  )}
                </span>
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
