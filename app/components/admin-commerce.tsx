"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { formatBRL } from "../data/products";
import type { AdminProductRecord } from "./admin-product-editor";

export type CommerceTab = "clientes" | "cupons" | "configuracoes" | "relatorios" | "promocoes";
type Row = Record<string, string | number | boolean | string[] | null>;

export function AdminCommerce({ tab, organizationId, products }: { tab: CommerceTab; organizationId: string | null; products: AdminProductRecord[] }) {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<Row | null>(null);
  useEffect(() => {
    if (!client || !organizationId || tab === "relatorios") return;
    let cancelled = false;
    const table = tab === "clientes" ? "customers" : tab === "cupons" ? "coupons" : tab === "promocoes" ? "product_variants" : "commerce_settings";
    const fields = tab === "clientes" ? "id,name,email,phone,created_at" : tab === "promocoes" ? "id,sku,promotion_starts_at,promotion_ends_at" : "*";
    void client.from(table).select(fields).eq("organization_id", organizationId)
      .order(tab === "clientes" ? "created_at" : tab === "cupons" ? "code" : tab === "promocoes" ? "sku" : "organization_id")
      .range(page * 25, page * 25 + 24).then(({ data, error: failure }) => {
        if (cancelled) return;
        setError(failure ? "Não foi possível carregar. Confira permissões e se a migração foi aplicada neste ambiente." : "");
        setRows((data || []) as unknown as Row[]);
      });
    return () => { cancelled = true; };
  }, [client, organizationId, tab, page, revision]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !organizationId) return;
    const form = new FormData(event.currentTarget);
    const field = (key: string) => String(form.get(key) || "").trim();
    const date = (key: string) => new Date(field(key)).toISOString();
    const money = (key: string) => {
      const value = field(key);
      if (!/^\d+(?:[,.]\d{1,2})?$/.test(value)) throw new Error("Informe um valor monetário válido.");
      const cents = Math.round(Number(value.replace(",", ".")) * 100);
      if (!Number.isSafeInteger(cents) || cents > 2147483647) throw new Error("Valor fora do limite.");
      return cents;
    };
    setBusy(true); setError(""); setMessage("");
    try {
      let failure;
      if (tab === "configuracoes") {
        const prefixes = field("prefixes").split(",").map(value => value.replace(/\D/g, "")).filter(Boolean);
        if (prefixes.some(value => value.length < 5 || value.length > 8)) throw new Error("Use prefixos de CEP com 5 a 8 dígitos, separados por vírgulas.");
        const origin = field("origin").replace(/\D/g, "");
        if (origin && !/^\d{8}$/.test(origin)) throw new Error("CEP de origem inválido.");
        ({ error: failure } = await client.from("commerce_settings").upsert({ organization_id: organizationId,
          pickup_enabled: form.has("pickup"), pickup_instructions: field("instructions"),
          courier_enabled: form.has("courier"), courier_fee_cents: field("fee") ? money("fee") : null,
          courier_postal_prefixes: prefixes, origin_postal_code: origin || null, correios_enabled: false,
          updated_at: new Date().toISOString(),
        }));
      } else if (tab === "cupons") {
        const kind = field("kind");
        const value = kind === "percent" ? Number(field("value")) : money("value");
        if (!Number.isInteger(value) || value < 1 || (kind === "percent" && value > 100)) throw new Error("Desconto inválido.");
        const payload = { organization_id: organizationId, code: field("code").toUpperCase(),
          kind, value, minimum_cents: money("minimum"), starts_at: date("start"), ends_at: date("end"), is_active: form.has("active"), allow_promotions: form.has("allowPromotions") };
        ({ error: failure } = editing ? await client.from("coupons").update(payload).eq("id",editing.id).eq("organization_id",organizationId) : await client.from("coupons").insert(payload));
        if (!failure) setEditing(null);
      } else if (tab === "promocoes") {
        ({ error: failure } = await client.rpc("schedule_variant_promotion", { target_organization_id: organizationId,
          target_variant_id: field("variant"), starts_at: form.has("clear") ? null : date("start"), ends_at: form.has("clear") ? null : date("end") }));
      } else if (tab === "relatorios") {
        const since = `${field("start")}T00:00:00-03:00`;
        const until = new Date(`${field("end")}T00:00:00-03:00`);
        until.setUTCDate(until.getUTCDate() + 1);
        const result = await client.rpc("commerce_report", { target_organization_id: organizationId, since_date: since, until_date: until.toISOString() });
        failure = result.error;
        if (!failure) setRows([result.data as Row]);
      }
      if (failure) throw new Error("Não foi possível salvar ou consultar. Confira os campos, permissões e migrações do ambiente.");
      setMessage(tab === "relatorios" ? "Relatório atualizado." : "Alteração salva."); setRevision(value => value + 1);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha na operação."); }
    finally { setBusy(false); }
  }

  async function toggleCoupon(row: Row) {
    if (!client || !organizationId) return;
    setBusy(true); setError("");
    const { error: failure } = await client.from("coupons").update({ is_active: !row.is_active }).eq("id", row.id).eq("organization_id", organizationId);
    if (failure) setError("Não foi possível alterar o cupom."); else setRevision(value => value + 1);
    setBusy(false);
  }
  const titles = { clientes: "Clientes", cupons: "Cupons", configuracoes: "Configurações de entrega", relatorios: "Relatórios", promocoes: "Agendamento de ofertas" };
  const settings = rows[0];
  return <section className="admin-card product-editor"><h1>{titles[tab]}</h1>
    {!organizationId && <p>Conecte um ambiente Supabase para administrar dados reais.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {tab !== "clientes" && <form onSubmit={submit} key={tab === "configuracoes" ? JSON.stringify(settings) : String(editing?.id || tab)}>
      <div className="product-editor-grid">
      {tab === "configuracoes" && <>
        <label>CEP de origem<input name="origin" defaultValue={String(settings?.origin_postal_code || "")} maxLength={9}/></label>
        <label><input type="checkbox" name="pickup" defaultChecked={Boolean(settings?.pickup_enabled)}/> Habilitar retirada</label>
        <label>Endereço e horários de retirada<textarea name="instructions" defaultValue={String(settings?.pickup_instructions || "")} maxLength={2000}/></label>
        <label><input type="checkbox" name="courier" defaultChecked={Boolean(settings?.courier_enabled)}/> Habilitar motoboy em Salvador</label>
        <label>Taxa do motoboy (R$)<input name="fee" inputMode="decimal" defaultValue={settings?.courier_fee_cents == null ? "" : (Number(settings.courier_fee_cents) / 100).toFixed(2)}/></label>
        <label>Prefixos dos CEPs atendidos<input name="prefixes" defaultValue={Array.isArray(settings?.courier_postal_prefixes) ? settings.courier_postal_prefixes.join(", ") : ""}/></label>
        <p>Correios PF: cotação e postagem manual ainda dependem de definição. O checkout não aceita frete desconhecido. Pagamentos são configurados exclusivamente no ambiente do servidor.</p>
      </>}
      {tab === "cupons" && <>
        <label>Código<input name="code" pattern="[A-Za-z0-9_-]{3,40}" defaultValue={String(editing?.code || "")} required/></label>
        <label>Tipo<select name="kind" defaultValue={String(editing?.kind || "percent")}><option value="percent">Percentual</option><option value="fixed">Valor em reais</option></select></label>
        <label>Desconto<input name="value" inputMode="decimal" defaultValue={editing ? String(Number(editing.value) / (editing.kind === "fixed" ? 100 : 1)) : ""} required/></label>
        <label>Compra mínima (R$)<input name="minimum" defaultValue={String(Number(editing?.minimum_cents || 0) / 100)} inputMode="decimal" required/></label>
        <label><input type="checkbox" name="active" defaultChecked={Boolean(editing?.is_active)}/> Ativar cupom</label>
        <label><input type="checkbox" name="allowPromotions" defaultChecked={Boolean(editing?.allow_promotions)}/> Permitir acumular com ofertas</label>
      </>}
      {tab === "promocoes" && <>
        <p>Primeiro salve o preço de venda e o preço anterior no produto. Fora do período, a loja usa o preço anterior. Horários abaixo usam o fuso do seu navegador.</p>
        <label>Variação<select name="variant" required>{products.flatMap(product => product.variants.map(variant => <option key={variant.id} value={variant.id}>{product.name} · {variant.name}</option>))}</select></label>
        <label><input type="checkbox" name="clear"/> Remover agendamento (manter oferta sem prazo)</label>
      </>}
      {["cupons", "promocoes", "relatorios"].includes(tab) && <>
        <label>Início<input name="start" type={tab === "relatorios" ? "date" : "datetime-local"} defaultValue={localDate(editing?.starts_at)} required={tab !== "promocoes"}/></label>
        <label>Fim<input name="end" type={tab === "relatorios" ? "date" : "datetime-local"} defaultValue={localDate(editing?.ends_at)} required={tab !== "promocoes"}/></label>
      </>}
      </div><button className="admin-primary" disabled={busy || !organizationId}>{busy ? "Aguarde…" : tab === "relatorios" ? "Consultar período" : "Salvar"}</button>
    </form>}
    {tab === "clientes" && <><div className="table-scroll"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Telefone</th></tr></thead><tbody>{rows.map(row => <tr key={String(row.id)}><td>{String(row.name || "")}</td><td>{String(row.email || "")}</td><td>{String(row.phone || "")}</td></tr>)}</tbody></table></div><p>{!rows.length && "Nenhum cliente nesta página."}</p></>}
    {tab === "cupons" && <ul>{rows.map(row => <li key={String(row.id)}>{String(row.code)} · {row.kind === "percent" ? `${row.value}%` : formatBRL(Number(row.value) / 100)} · {row.is_active ? "Ativo" : "Inativo"} <button className="table-action" disabled={busy} onClick={() => setEditing(row)}>Editar</button><button className="table-action" disabled={busy} onClick={() => void toggleCoupon(row)}>{row.is_active ? "Desativar" : "Ativar"}</button></li>)}</ul>}
    {tab === "promocoes" && <ul>{rows.map(row => <li key={String(row.id)}>{String(row.sku)}: {row.promotion_starts_at ? `${new Date(String(row.promotion_starts_at)).toLocaleString("pt-BR")} até ${new Date(String(row.promotion_ends_at)).toLocaleString("pt-BR")}` : "Sem agendamento"}</li>)}</ul>}
    {tab === "relatorios" && rows[0] && <p>Pedidos: {String(rows[0].orders)} · Valor dos pedidos: {formatBRL(Number(rows[0].gross_cents) / 100)} · Pagamentos aprovados, descontados estornos parciais: {formatBRL(Number(rows[0].paid_cents) / 100)} · Exigem revisão: {String(rows[0].review_required)}</p>}
    {["clientes", "cupons", "promocoes"].includes(tab) && <div><button disabled={!page} onClick={() => setPage(value => value - 1)}>Anterior</button><span> Página {page + 1} </span><button disabled={rows.length < 25} onClick={() => setPage(value => value + 1)}>Próxima</button></div>}
  </section>;
}

function localDate(value: Row[string] | undefined) {
  if (typeof value !== "string") return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
}
