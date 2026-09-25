"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import type { AdminProductRecord } from "./admin-product-editor";

export function AdminStockAdjustment({ products, organizationId, reload }:{ products:AdminProductRecord[]; organizationId:string|null; reload:()=>Promise<void> }) {
  const [variantId,setVariantId]=useState("");
  const [quantity,setQuantity]=useState(1);
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const selected=products.flatMap((product)=>product.variants).find((variant)=>variant.id===variantId);

  async function submit(event:FormEvent) {
    event.preventDefault();setError("");setSuccess("");
    if(!organizationId||!selected||!Number.isSafeInteger(quantity)||quantity<1||quantity>selected.stock){setError("Escolha uma variação e informe uma quantidade válida.");return}
    const client=createSupabaseBrowserClient();if(!client)return;
    setBusy(true);
    const {error:rpcError}=await client.rpc("adjust_inventory",{
      target_organization_id:organizationId,target_variant_id:variantId,quantity_change:-quantity,
      movement_reason:"adjustment",movement_note:`Venda na loja física${note.trim()?`: ${note.trim().slice(0,180)}`:""}`,
    });
    if(rpcError)setError("Não foi possível registrar a saída. Confira se há unidades disponíveis (sem reservas de pedidos).");
    else {setSuccess(`${quantity} unidade(s) registradas como venda na loja física.`);setQuantity(1);setNote("");await reload()}
    setBusy(false);
  }

  return <form className="admin-card order-detail" onSubmit={(event)=>void submit(event)}><h2>Venda na loja física</h2><p>Registre peças vendidas presencialmente para atualizar o estoque do site. Escolha o tamanho e a cor corretos.</p>
    <div className="order-actions"><label htmlFor="stock-variant">Produto e variação</label><select id="stock-variant" required value={variantId} onChange={(event)=>setVariantId(event.target.value)}><option value="">Selecione</option>{products.flatMap((product)=>product.variants.map((variant)=><option key={variant.id} value={variant.id}>{product.name} · {variant.name} · {variant.color} {variant.size} · {variant.sku} ({variant.stock} em estoque)</option>))}</select>
    <label htmlFor="stock-quantity">Quantidade vendida</label><input id="stock-quantity" type="number" min={1} max={selected?.stock||1} required value={quantity} onChange={(event)=>setQuantity(Number(event.target.value))}/>
    <label htmlFor="stock-note">Observação (opcional)</label><input id="stock-note" maxLength={180} value={note} onChange={(event)=>setNote(event.target.value)} placeholder="Ex.: venda no balcão"/>
    <button className="admin-primary" disabled={busy||!organizationId||!selected}>{busy?"Registrando…":"Registrar saída"}</button></div>
    {error&&<p className="form-error" role="alert">{error}</p>}{success&&<p role="status">{success}</p>}
  </form>;
}
