"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { formatBRL } from "../data/products";

export type OrderSummary = { id:string; number:string; customer:string; value:number; paidCents:number; status:string; time:string };
type OrderDetail = {
  customer_snapshot: Record<string, string> | null;
  shipping_address_snapshot: Record<string, string> | null;
  notes: string | null;
  order_items: Array<{ id:string; product_name:string; variant_name:string; sku:string; quantity:number; total_cents:number }>;
  payments: Array<{ status:string; amount_cents:number }>;
  shipments: Array<{ id:string; provider:string; tracking_code:string|null; status:string }>;
};

const statusLabels: Record<string,string> = { pending:"Pendente", confirmed:"Confirmado", processing:"Separando", shipped:"Enviado", delivered:"Entregue", cancelled:"Cancelado" };
const nextStatus: Record<string,string> = { confirmed:"processing", processing:"shipped", shipped:"delivered" };

export function AdminOrders({ orders, organizationId, canManageOrders, reload }:{ orders:OrderSummary[]; organizationId:string|null; canManageOrders:boolean; reload:()=>Promise<void> }) {
  const [selected,setSelected]=useState<OrderSummary|null>(null);
  const [detail,setDetail]=useState<OrderDetail|null>(null);
  const [tracking,setTracking]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  async function open(order:OrderSummary) {
    setSelected(order);setDetail(null);setError("");setMessage("");
    if(!organizationId){setError("Pedidos de demonstração não podem ser alterados.");return}
    const client=createSupabaseBrowserClient();if(!client)return;
    const {data,error:readError}=await client.from("orders")
      .select("customer_snapshot,shipping_address_snapshot,notes,order_items(id,product_name,variant_name,sku,quantity,total_cents),payments(status,amount_cents),shipments(id,provider,tracking_code,status)")
      .eq("organization_id",organizationId).eq("id",order.id).single();
    if(readError||!data){setError("Não foi possível abrir este pedido.");return}
    setDetail(data as OrderDetail);setTracking(data.shipments?.find((shipment)=>shipment.provider==="correios")?.tracking_code||"");
  }

  const paid=Boolean(detail) && (detail?.payments.filter((payment)=>payment.status==="paid").reduce((sum,payment)=>sum+Number(payment.amount_cents),0)||0)>=Math.round((selected?.value||0)*100);
  async function advance() {
    if(!selected||!organizationId||!canManageOrders||!paid||!nextStatus[selected.status])return;
    if(selected.status==="processing" && detail?.shipments.some((shipment)=>shipment.provider==="correios") && !tracking.trim()){setError("Informe o rastreio antes de marcar o envio pelos Correios.");return}
    const client=createSupabaseBrowserClient();if(!client)return;
    setBusy(true);setError("");setMessage("");
    const {data,error:updateError}=await client.from("orders").update({status:nextStatus[selected.status]}).eq("organization_id",organizationId).eq("id",selected.id).eq("status",selected.status).select("id").maybeSingle();
    if(updateError||!data)setError("Não foi possível atualizar o pedido. Recarregue os dados e tente novamente.");
    else {const updated={...selected,status:nextStatus[selected.status]};setSelected(updated);setMessage("Status atualizado.");await reload()}
    setBusy(false);
  }

  async function saveTracking() {
    if(!selected||!organizationId||!detail||!canManageOrders||!paid)return;
    const code=tracking.trim().toUpperCase();
    if(!/^[A-Z0-9]{8,35}$/.test(code)){setError("Confira o código de rastreio (8 a 35 letras ou números).");return}
    const client=createSupabaseBrowserClient();if(!client)return;
    setBusy(true);setError("");setMessage("");
    const shipment=detail.shipments.find((item)=>item.provider==="correios");
    const result=shipment
      ? await client.from("shipments").update({tracking_code:code}).eq("organization_id",organizationId).eq("order_id",selected.id).eq("id",shipment.id).select("id").maybeSingle()
      : await client.from("shipments").insert({organization_id:organizationId,order_id:selected.id,provider:"correios",tracking_code:code,status:"pending"}).select("id").maybeSingle();
    if(result.error||!result.data)setError("Não foi possível salvar o rastreio.");
    else {setMessage("Rastreio salvo.");await open(selected)}
    setBusy(false);
  }

  return <><section className="admin-card table-card"><div className="card-title"><h2>Pedidos recentes</h2><span>{orders.length} registros</span></div><div className="table-scroll"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Valor</th><th>Status</th><th>Data</th><th>Ação</th></tr></thead><tbody>{orders.length?orders.map((order)=><tr key={order.id}><td><strong>{order.number}</strong></td><td>{order.customer}</td><td>{formatBRL(order.value)}</td><td>{statusLabels[order.status]||order.status}</td><td>{order.time}</td><td><button className="table-action" onClick={()=>void open(order)}>Ver pedido</button></td></tr>):<tr><td colSpan={6}>Nenhum pedido encontrado.</td></tr>}</tbody></table></div></section>
  {selected&&<section className="admin-card order-detail"><div className="card-title"><h2>{selected.number} · {selected.customer}</h2><button className="table-action" onClick={()=>{setSelected(null);setDetail(null)}}>Fechar</button></div>{error&&<p className="form-error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}{!detail&&!error&&<p>Carregando pedido…</p>}{detail&&<>
    <p><strong>Status:</strong> {statusLabels[selected.status]||selected.status} · <strong>Pagamento:</strong> {paid?"Aprovado":"Ainda não aprovado"}</p>
    <p><strong>Contato:</strong> {detail.customer_snapshot?.name||"—"} · {detail.customer_snapshot?.email||"—"} · {detail.customer_snapshot?.phone||"—"}</p>
    <p><strong>Entrega:</strong> {Object.values(detail.shipping_address_snapshot||{}).filter((value)=>typeof value==="string"&&value.trim()).join(", ")||"Retirada / endereço não informado"}</p>
    {detail.notes&&<p><strong>Observações:</strong> {detail.notes}</p>}
    <h3>Itens</h3><ul>{detail.order_items.map((item)=><li key={item.id}>{item.quantity}× {item.product_name} · {item.variant_name} · {item.sku} — {formatBRL(item.total_cents/100)}</li>)}</ul>
    <p><strong>Total:</strong> {formatBRL(selected.value)}</p>
    {detail.shipments.map((shipment)=><p key={shipment.id}><strong>Envio {shipment.provider}:</strong> {shipment.tracking_code||"Sem rastreio"}</p>)}
    {canManageOrders&&paid&&<div className="order-actions"><label htmlFor="order-tracking">Rastreio dos Correios</label><input id="order-tracking" value={tracking} onChange={(event)=>setTracking(event.target.value)} placeholder="Código informado após a postagem" maxLength={35}/><button className="table-action" disabled={busy||!organizationId} onClick={()=>void saveTracking()}>Salvar rastreio</button>{nextStatus[selected.status]&&<button className="admin-primary" disabled={busy||!organizationId} onClick={()=>void advance()}>Marcar como {statusLabels[nextStatus[selected.status]].toLowerCase()}</button>}</div>}
  </>}</section>}</>;
}
