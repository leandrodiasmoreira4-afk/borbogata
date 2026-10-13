"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { AdminOrderHistory } from "./admin-order-history";

type Customer = { id: string; name: string; email: string | null; phone: string | null };
export function AdminCustomers({ organizationId, search = "" }: { organizationId: string | null; search?: string }) {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [draft, setDraft] = useState(search), [query, setQuery] = useState({ search, page: 0, revision: 0 });
  const [rows, setRows] = useState<Customer[]>([]), [total, setTotal] = useState(0);
  const [editing, setEditing] = useState<Customer | "new" | null>(null), [history, setHistory] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(Boolean(organizationId)), [saving, setSaving] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  useEffect(() => {
    if (!client || !organizationId) return;
    let cancelled = false;
    void client.rpc("admin_customers_page", { target_organization_id: organizationId, search_text: query.search, page_number: query.page })
      .then(({ data, error: failure }) => {
        if (cancelled) return;
        setError(failure ? "Não foi possível carregar os clientes." : ""); setRows(data?.rows || []); setTotal(data?.total || 0); setBusy(false);
      });
    return () => { cancelled = true; };
  }, [client, organizationId, query]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client || !organizationId || !editing) return;
    const form = new FormData(event.currentTarget); setSaving(true); setError(""); setMessage("");
    try {
      const { error: failure } = await client.rpc("admin_save_customer", { target_organization_id: organizationId, target_customer_id: editing === "new" ? null : editing.id,
        customer_name: String(form.get("name") || "").trim(), customer_email: String(form.get("email") || "").trim(), customer_phone: String(form.get("phone") || "").trim() });
      if (failure) throw new Error("Não foi possível salvar. Confira os dados e sua permissão.");
      setEditing(null); setMessage("Cliente salvo. Os dados registrados nos pedidos anteriores foram preservados."); setBusy(true); setQuery(value => ({ ...value, revision: value.revision + 1 }));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao salvar o cliente."); }
    finally { setSaving(false); }
  }
  function loadPage(page: number, searchText = query.search) { setBusy(Boolean(organizationId)); setRows([]); setQuery(value => ({ page, search: searchText, revision: value.revision + 1 })); }
  const current = editing && editing !== "new" ? editing : null;
  return <>
    <div className="admin-heading"><h1>Clientes</h1><button className="admin-primary" disabled={!organizationId || saving} onClick={() => setEditing("new")}>Novo cliente</button></div>
    {!organizationId && <p>Conecte o ambiente da loja para gerenciar clientes.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {editing && <form className="admin-card product-editor" key={current?.id || "new"} onSubmit={save}><h2>{current ? "Editar cliente" : "Cadastrar cliente"}</h2><div className="product-editor-grid">
      <label>Nome do cliente<input name="name" required minLength={2} maxLength={120} defaultValue={current?.name || ""}/></label>
      <label>E-mail do cliente<input name="email" type="email" maxLength={254} defaultValue={current?.email || ""}/></label>
      <label>Telefone do cliente<input name="phone" type="tel" maxLength={25} defaultValue={current?.phone || ""}/></label>
    </div><button className="admin-primary" disabled={saving}>{saving ? "Salvando…" : "Salvar cliente"}</button><button type="button" className="table-action" disabled={saving} onClick={() => setEditing(null)}>Cancelar edição</button></form>}
    <form className="admin-card product-editor" onSubmit={event => { event.preventDefault(); loadPage(0, draft.trim()); }}><label>Buscar cliente<input value={draft} maxLength={100} onChange={event => setDraft(event.target.value)} placeholder="Nome, e-mail ou telefone"/></label><button className="admin-primary" disabled={busy}>Buscar clientes</button></form>
    <section className="admin-card table-card"><div className="table-scroll"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Telefone</th><th>Ações</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.email || "—"}</td><td>{row.phone || "—"}</td><td><button className="table-action" disabled={saving} onClick={() => setEditing(row)}>Editar cliente</button><button className="table-action" onClick={() => setHistory(row)}>Ver compras</button></td></tr>)}{!rows.length && <tr><td colSpan={4}>{busy ? "Carregando clientes…" : "Nenhum cliente encontrado."}</td></tr>}</tbody></table></div></section>
    <div className="admin-pagination"><button className="table-action" disabled={busy || !query.page} onClick={() => loadPage(query.page - 1)}>Anterior</button><span>Página {query.page + 1} · {total} clientes</span><button className="table-action" disabled={busy || (query.page + 1) * 25 >= total} onClick={() => loadPage(query.page + 1)}>Próxima</button></div>
    {history && <section><div className="admin-heading"><h2>Compras de {history.name}</h2><button className="table-action" onClick={() => setHistory(null)}>Fechar compras</button></div><AdminOrderHistory key={history.id} organizationId={organizationId} customerId={history.id}/></section>}
  </>;
}
