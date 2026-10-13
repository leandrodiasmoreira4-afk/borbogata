"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { AdminOrders, type OrderSummary } from "./admin-orders";

type OrderRow = { id: string; order_number: number; total_cents: number; status: string; created_at: string; customer_snapshot: { name?: string } | null; payment_environment: string | null; payment_review_required: boolean };

export function AdminOrderHistory({ organizationId, search = "", customerId = null, demoOrders = [] }: { organizationId: string | null; search?: string; customerId?: string | null; demoOrders?: OrderSummary[] }) {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [draft, setDraft] = useState(search), [status, setStatus] = useState("");
  const [start, setStart] = useState(""), [end, setEnd] = useState("");
  const [query, setQuery] = useState({ search, status: "", start: "", end: "", page: 0, revision: 0 });
  const [orders, setOrders] = useState<OrderSummary[]>([]), [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(Boolean(organizationId)), [error, setError] = useState("");
  useEffect(() => {
    if (!client || !organizationId) return;
    let cancelled = false;
    void client.rpc("admin_orders_page", { target_organization_id: organizationId, search_text: query.search, status_filter: query.status, first_day: query.start || null, last_day: query.end || null, page_number: query.page, customer_filter: customerId })
      .then(({ data, error: failure }) => {
        if (cancelled) return;
        setError(failure ? "Não foi possível consultar os pedidos. Tente novamente." : "");
        setTotal(data?.total || 0);
        setOrders(((data?.rows || []) as OrderRow[]).map(row => ({ id: row.id, number: `#${row.order_number}`, customer: row.customer_snapshot?.name || "Cliente", value: row.total_cents / 100, paidCents: 0, status: row.status,
          time: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(row.created_at)), environment: row.payment_environment, reviewRequired: row.payment_review_required })));
        setBusy(false);
      });
    return () => { cancelled = true; };
  }, [client, organizationId, customerId, query]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (start && end && end < start) { setError("A data final deve ser igual ou posterior à inicial."); return; }
    setError(""); setBusy(Boolean(organizationId)); setOrders([]);
    setQuery({ search: draft.trim(), status, start, end, page: 0, revision: query.revision + 1 });
  }
  async function reload() { setBusy(true); setQuery(value => ({ ...value, revision: value.revision + 1 })); }
  function pageTo(page: number) { setBusy(true); setOrders([]); setQuery(value => ({ ...value, page })); }
  const visibleOrders = organizationId ? orders : demoOrders.filter(order => `${order.number} ${order.customer}`.toLowerCase().includes(query.search.toLowerCase()) && (!query.status || order.status === query.status));
  return <>
    <form className="admin-card product-editor" onSubmit={submit}><div className="product-editor-grid">
      <label>Buscar pedido ou cliente<input value={draft} maxLength={100} onChange={event => setDraft(event.target.value)} placeholder="Número, nome ou e-mail"/></label>
      <label>Status do pedido<select value={status} onChange={event => setStatus(event.target.value)}><option value="">Todos</option>{Object.entries({ pending: "Pendente", confirmed: "Confirmado", processing: "Separando", shipped: "Enviado", delivered: "Entregue", cancelled: "Cancelado" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Pedidos desde<input type="date" value={start} onChange={event => setStart(event.target.value)}/></label>
      <label>Pedidos até<input type="date" value={end} onChange={event => setEnd(event.target.value)}/></label>
    </div><button className="admin-primary" disabled={busy}>Filtrar pedidos</button></form>
    {error && <p className="form-error" role="alert">{error}</p>}
    {busy ? <p role="status">Consultando pedidos…</p> : <AdminOrders key={`${query.search}:${query.status}:${query.page}:${query.start}:${query.end}`} orders={visibleOrders} organizationId={organizationId} canManageOrders={Boolean(organizationId)} reload={reload}/>}
    {organizationId && <div className="admin-pagination"><button className="table-action" disabled={busy || !query.page} onClick={() => pageTo(query.page - 1)}>Anterior</button><span>Página {query.page + 1} · {total} pedidos encontrados</span><button className="table-action" disabled={busy || (query.page + 1) * 25 >= total} onClick={() => pageTo(query.page + 1)}>Próxima</button></div>}
  </>;
}
