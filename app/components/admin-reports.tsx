"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { periodRange, todayInBrazil, validateRange, type Period } from "../../lib/admin/period";
import { formatBRL } from "../data/products";

type Totals = { orders: number; order_cents: number; pending: number; review: number; paid_orders: number; approved_cents: number; refunded_cents: number; net_cents: number };
type SalesReport = Totals & { days: (Totals & { day: string })[] };
const labels: Record<Period, string> = { day: "Dia", week: "Semana", month: "Mês", year: "Ano", custom: "Personalizado" };
const money = (cents: number) => formatBRL(cents / 100);

export function AdminReports({ organizationId, compact = false }: { organizationId: string | null; compact?: boolean }) {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [period, setPeriod] = useState<Period>("month");
  const [reference, setReference] = useState(todayInBrazil);
  const initial = periodRange("month", reference);
  const [start, setStart] = useState(initial.start), [end, setEnd] = useState(initial.end);
  const [environment, setEnvironment] = useState("production");
  const [query, setQuery] = useState({ ...initial, environment: "production", revision: 0 });
  const [report, setReport] = useState<SalesReport | null>(null);
  const [busy, setBusy] = useState(Boolean(organizationId)), [error, setError] = useState("");
  useEffect(() => {
    if (!client || !organizationId) return;
    let cancelled = false;
    void client.rpc("admin_sales_report", { target_organization_id: organizationId, first_day: query.start, last_day: query.end, environment: query.environment })
      .then(({ data, error: failure }) => {
        if (cancelled) return;
        setReport(failure ? null : data as SalesReport);
        setError(failure ? "Não foi possível consultar o faturamento. Verifique sua conexão e a atualização do banco." : "");
        setBusy(false);
      });
    return () => { cancelled = true; };
  }, [client, organizationId, query]);

  function selectPeriod(value: Period, day = reference) {
    setPeriod(value);
    if (value !== "custom" && day) {
      try { const range = periodRange(value, day); setStart(range.start); setEnd(range.end); } catch { /* Invalid date remains editable. */ }
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      validateRange(start, end); setError(""); setReport(null); setBusy(Boolean(organizationId));
      setQuery({ start, end, environment, revision: query.revision + 1 });
    } catch (failure) { setError((failure as Error).message); }
  }
  function exportCsv() {
    if (!report) return;
    const rows = [["Data", "Pedidos criados", "Valor dos pedidos (R$)", "Pagamentos aprovados (R$)", "Estornos atuais (R$)", "Após estornos (R$)"],
      ...report.days.map(day => [day.day, day.orders, (day.order_cents / 100).toFixed(2), (day.approved_cents / 100).toFixed(2), (day.refunded_cents / 100).toFixed(2), (day.net_cents / 100).toFixed(2)])];
    const url = URL.createObjectURL(new Blob(["\uFEFF", rows.map(row => row.join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `vendas-${query.environment}-${query.start}-${query.end}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <section className="admin-card product-editor" aria-busy={busy}>
    {compact ? <h2>Faturamento e pedidos</h2> : <h1>Relatórios</h1>}
    <form onSubmit={submit}>
      <div className="table-actions admin-periods" role="group" aria-label="Período do relatório">{(Object.keys(labels) as Period[]).map(value => <button key={value} type="button" className="table-action" aria-pressed={period === value} onClick={() => selectPeriod(value)}>{labels[value]}</button>)}</div>
      <div className="product-editor-grid">
        {period !== "custom" && <label>Data de referência<input type="date" value={reference} required onChange={event => { setReference(event.target.value); selectPeriod(period, event.target.value); }}/></label>}
        <label>Início<input type="date" value={start} required onChange={event => { setStart(event.target.value); setPeriod("custom"); }}/></label>
        <label>Fim<input type="date" value={end} required onChange={event => { setEnd(event.target.value); setPeriod("custom"); }}/></label>
        <label>Origem das vendas<select value={environment} onChange={event => setEnvironment(event.target.value)}><option value="production">Vendas reais</option><option value="sandbox">Compras de teste</option><option value="legacy">Pedidos antigos sem classificação</option></select></label>
      </div><button className="admin-primary" disabled={busy || !organizationId}>{busy ? "Consultando…" : "Consultar período"}</button>
    </form>
    <p>Horário de Brasília. A semana vai de segunda a domingo. Pagamentos pela data da aprovação; pedidos pela data de criação. Estornos atualizam o período da venda original. Os valores incluem frete e não descontam taxas, custos ou impostos; não representam lucro nem saldo bancário.</p>
    {!organizationId && <p>Conecte o ambiente da loja para consultar valores reais. Os filtros estão disponíveis para conhecer o painel.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {report && <>
      <p role="status">Período consultado: {query.start.split("-").reverse().join("/")} a {query.end.split("-").reverse().join("/")} · {query.environment === "sandbox" ? "Compras de teste" : query.environment === "production" ? "Vendas reais" : "Sem classificação"}</p>
      <div className="metric-grid">{[
        ["Pagamentos aprovados", money(report.approved_cents)], ["Estornos / contestações", money(report.refunded_cents)],
        ["Após estornos", money(report.net_cents)], ["Ticket após estornos", money(report.paid_orders ? report.net_cents / report.paid_orders : 0)],
        ["Pedidos criados", String(report.orders)], ["Pedidos pendentes", String(report.pending)], ["Exigem revisão", String(report.review)],
      ].map(([label, value]) => <article className="metric-card" key={label}><p>{label}</p><h2>{value}</h2></article>)}</div>
      {!compact && <><button className="table-action" onClick={exportCsv}>Exportar CSV</button><div className="table-scroll"><table><thead><tr><th>Dia</th><th>Pedidos</th><th>Aprovado</th><th>Estornos</th><th>Após estornos</th></tr></thead><tbody>{report.days.map(day => <tr key={day.day}><td>{day.day.split("-").reverse().join("/")}</td><td>{day.orders}</td><td>{money(day.approved_cents)}</td><td>{money(day.refunded_cents)}</td><td>{money(day.net_cents)}</td></tr>)}</tbody></table></div></>}
    </>}
  </section>;
}
