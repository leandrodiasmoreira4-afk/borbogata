"use client";
import { useMemo, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { todayInBrazil } from "../../lib/admin/period";
import { formatBRL } from "../data/products";
import type { AdminProductRecord } from "./admin-product-editor";

export type AdminCollectionRecord = { id: string; name: string; slug: string; description: string; status: string; isFeatured: boolean; launchedAt: string; coverPath: string | null; productCount: number; productIds: string[] };

export function AdminCollectionEditor({ organizationId, products, collection, onSaved }: { organizationId: string; products: AdminProductRecord[]; collection: AdminCollectionRecord | null; onSaved: () => Promise<void> }) {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [name, setName] = useState(collection?.name || ""), [description, setDescription] = useState(collection?.description || "");
  const [launchedAt, setLaunchedAt] = useState(collection?.launchedAt || todayInBrazil());
  const [selected, setSelected] = useState<string[]>(collection?.productIds || []);
  const [cover, setCover] = useState<File | null>(null), [featured, setFeatured] = useState(collection?.isFeatured ?? false);
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const choices = products.filter(product => product.status === "active" || selected.includes(product.id));
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!client) return; setError("");
    if (!selected.length) { setError("Selecione pelo menos um produto."); return; }
    if (!cover && !collection?.coverPath) { setError("Escolha uma imagem de capa."); return; }
    if (cover && (!["image/jpeg", "image/png", "image/webp"].includes(cover.type) || cover.size > 8 * 1024 * 1024)) { setError("Use JPG, PNG ou WebP de até 8 MB."); return; }
    setSaving(true); let uploaded: string | null = null;
    try {
      let coverPath = collection?.coverPath || "";
      if (cover) {
        const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[cover.type];
        coverPath = `${organizationId}/collections/${crypto.randomUUID()}.${extension}`;
        const { error: failure } = await client.storage.from("collection-covers").upload(coverPath, cover, { contentType: cover.type, cacheControl: "31536000", upsert: false });
        if (failure) throw new Error("Não foi possível enviar a capa. Tente novamente.");
        uploaded = coverPath;
      }
      const common = { target_organization_id: organizationId, collection_name: name.trim(), collection_description: description.trim(), collection_cover_storage_path: coverPath, collection_launched_at: launchedAt, product_ids: selected, make_featured: featured };
      const { error: failure } = collection
        ? await client.rpc("update_collection_with_products", { ...common, target_collection_id: collection.id })
        : await client.rpc("create_collection_with_products", { ...common, collection_slug: name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") });
      if (failure) throw new Error("Não foi possível salvar a coleção. Confira o nome, os produtos e sua permissão.");
      uploaded = null; // The persisted collection now owns this file; never delete it on reload failure.
      await onSaved();
    } catch (failure) {
      if (uploaded) await client.storage.from("collection-covers").remove([uploaded]);
      setError(failure instanceof Error ? failure.message : "Falha ao salvar coleção.");
    } finally { setSaving(false); }
  }
  return <form className="admin-card collection-form" onSubmit={submit}><h2>{collection ? "Editar coleção" : "Nova coleção"}</h2>
    {collection && <p>O endereço /colecao/{collection.slug} será preservado.</p>}
    <div className="collection-form-grid">
      <label>Nome da coleção<input required minLength={2} maxLength={80} value={name} onChange={event => setName(event.target.value)}/></label>
      <label>Data de lançamento<input type="date" required value={launchedAt} onChange={event => setLaunchedAt(event.target.value)}/></label>
      <label className="wide">Texto da coleção<textarea maxLength={2000} value={description} onChange={event => setDescription(event.target.value)}/></label>
      <label className="wide">Imagem principal<input type="file" accept="image/jpeg,image/png,image/webp" required={!collection?.coverPath} onChange={event => setCover(event.target.files?.[0] || null)}/><small>{collection?.coverPath ? "Opcional: envie outra imagem para substituir a capa." : "JPG, PNG ou WebP, até 8 MB."}</small></label>
    </div>
    <fieldset className="collection-product-picker"><legend>Produtos da coleção</legend>{choices.map(product => <label key={product.id}><input type="checkbox" checked={selected.includes(product.id)} onChange={() => setSelected(value => value.includes(product.id) ? value.filter(id => id !== product.id) : [...value, product.id])}/><span><strong>{product.name}</strong><small>{product.sku} · {formatBRL(product.price)}{product.status !== "active" ? " · Não publicado" : ""}</small></span></label>)}{!choices.length && <p>Publique um produto para adicioná-lo à coleção.</p>}</fieldset>
    <label className="featured-check"><input type="checkbox" checked={featured} disabled={collection?.status === "archived"} onChange={event => setFeatured(event.target.checked)}/> Usar como coleção principal</label>
    {collection?.status === "archived" && <p>A edição mantém a coleção arquivada. Reative-a na listagem quando desejar.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}<button className="admin-primary" disabled={saving || !choices.length}>{saving ? "Salvando…" : "Salvar coleção"}</button>
  </form>;
}
