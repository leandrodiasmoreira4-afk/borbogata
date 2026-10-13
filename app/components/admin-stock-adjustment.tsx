"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import type { AdminProductRecord } from "./admin-product-editor";

export function AdminStockAdjustment({ products, organizationId, reload }:{ products:AdminProductRecord[]; organizationId:string|null; reload:()=>Promise<void> }) {
  const [variantId,setVariantId]=useState("");
  const [kind,setKind]=useState("sale");
  const [quantity,setQuantity]=useState(1);
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const selected=products.flatMap((product)=>product.variants).find((variant)=>variant.id===variantId);

  async function submit(event:FormEvent) {
    event.preventDefault();setError("");setSuccess("");
    if(!organizationId||!selected||!Number.isSafeInteger(quantity)||quantity<1||quantity>100000 || (kind!=="restock" && quantity>selected.stock-(selected.reserved||0))){setError("Escolha uma variação e informe uma quantidade válida.");return}
    const client=createSupabaseBrowserClient();if(!client)return;
    setBusy(true);
    const {error:rpcError}=await client.rpc("adjust_inventory",{
      target_organization_id:organizationId,target_variant_id:variantId,quantity_change:kind==="restock"?quantity:-quantity,
      movement_reason:kind==="restock"?"restock":"adjustment",movement_note:`${kind==="restock"?"Reposição":kind==="sale"?"Venda na loja física":"Saída por ajuste"}${note.trim()?`: ${note.trim().slice(0,180)}`:""}`,
    });
    if(rpcError)setError("Não foi possível movimentar o estoque. Confira a quantidade e as reservas de pedidos.");
    else {setSuccess(`${quantity} unidade(s) registradas. Estoque atualizado.`);setQuantity(1);setNote("");await reload()}
    setBusy(false);
  }

  return <form className="admin-card order-detail" onSubmit={(event)=>void submit(event)}><h2>Movimentar estoque</h2><p>Registre reposições, saídas ou vendas presenciais por tamanho e cor. Este registro atualiza somente o estoque; vendas presenciais não entram no faturamento dos pedidos online.</p>
    <div className="order-actions"><label htmlFor="stock-kind">Tipo de movimentação</label><select id="stock-kind" value={kind} onChange={event=>setKind(event.target.value)}><option value="sale">Venda na loja física</option><option value="restock">Reposição / entrada</option><option value="adjustment">Ajuste / saída</option></select><label htmlFor="stock-variant">Produto e variação</label><select id="stock-variant" required value={variantId} onChange={(event)=>setVariantId(event.target.value)}><option value="">Selecione</option>{products.flatMap((product)=>product.variants.map((variant)=><option key={variant.id} value={variant.id}>{product.name} · {variant.name} · {variant.color} {variant.size} · {variant.sku} ({variant.stock-(variant.reserved||0)} disponíveis)</option>))}</select>
    <label htmlFor="stock-quantity">Quantidade de unidades</label><input id="stock-quantity" type="number" min={1} max={kind==="restock"?100000:Math.max(1,(selected?.stock||0)-(selected?.reserved||0))} required value={quantity} onChange={(event)=>setQuantity(Number(event.target.value))}/>
    <label htmlFor="stock-note">Observação (opcional)</label><input id="stock-note" maxLength={180} value={note} onChange={(event)=>setNote(event.target.value)} placeholder="Ex.: venda no balcão"/>
    <button className="admin-primary" disabled={busy||!organizationId||!selected}>{busy?"Registrando…":"Registrar movimentação"}</button></div>
    {error&&<p className="form-error" role="alert">{error}</p>}{success&&<p role="status">{success}</p>}
  </form>;
}
