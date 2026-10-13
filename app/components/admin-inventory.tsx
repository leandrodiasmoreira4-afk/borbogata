"use client";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import type { AdminProductRecord } from "./admin-product-editor";

type Movement = { id: string; quantity_delta: number; reason: string; note: string | null; created_at: string };
export function AdminInventory({ products, organizationId }: { products: AdminProductRecord[]; organizationId: string | null }) {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [lowOnly, setLowOnly] = useState(false), [selected, setSelected] = useState("");
  const [page, setPage] = useState(0), [movements, setMovements] = useState<Movement[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    if (!client || !organizationId || !selected) return;
    let cancelled = false;
    void client.from("inventory_movements").select("id,quantity_delta,reason,note,created_at").eq("organization_id", organizationId).eq("variant_id", selected).order("created_at", { ascending: false }).order("id").range(page * 25, page * 25 + 24)
      .then(({ data, error: failure }) => {
        if (cancelled) return;
        setMovements(data || []); setError(failure ? "Não foi possível consultar as movimentações." : ""); setBusy(false);
      });
    return () => { cancelled = true; };
  }, [client, organizationId, selected, page]);
  function open(id: string) { if (id === selected && page === 0) return; setSelected(id); setPage(0); setMovements([]); setBusy(true); }
  const variants = products.flatMap(product => product.variants.map(variant => ({ ...variant, productName: product.name, available: Math.max(0, variant.stock - (variant.reserved || 0)) }))).filter(variant => !lowOnly || variant.available <= 3);
  return <section className="admin-card table-card"><h2>Estoque por tamanho e cor</h2><label><input type="checkbox" checked={lowOnly} onChange={event => setLowOnly(event.target.checked)}/> Somente estoque baixo (até 3 disponíveis)</label>
    <div className="table-scroll"><table><thead><tr><th>Produto / SKU</th><th>Cor / tamanho</th><th>Físico</th><th>Reservado</th><th>Disponível</th><th>Histórico</th></tr></thead><tbody>{variants.map(variant => <tr key={variant.id}><td>{variant.productName}<small className="table-subtitle">{variant.sku}</small></td><td>{variant.color} / {variant.size}</td><td>{variant.stock}</td><td>{variant.reserved || 0}</td><td>{variant.available}</td><td><button className="table-action" disabled={!organizationId} onClick={() => open(variant.id)}>Ver movimentações</button></td></tr>)}{!variants.length && <tr><td colSpan={6}>Nenhuma variação encontrada.</td></tr>}</tbody></table></div>
    {selected && <div><h3>Movimentações de {variants.find(variant => variant.id === selected)?.sku || "variação selecionada"}</h3><button className="table-action" onClick={() => setSelected("")}>Fechar histórico</button>{error && <p role="alert">{error}</p>}{busy ? <p role="status">Carregando movimentações…</p> : <><ul>{movements.map(row => <li key={row.id}>{new Date(row.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {row.quantity_delta > 0 ? "+" : ""}{row.quantity_delta} un. · {({ initial: "Estoque inicial", sale: "Venda", cancellation: "Cancelamento", return: "Devolução", adjustment: "Ajuste", restock: "Reposição" } as Record<string, string>)[row.reason] || row.reason} · {row.note || "Sem observação"}</li>)}</ul>{!movements.length && <p>Nenhuma movimentação nesta página.</p>}</>}
      <div className="admin-pagination"><button className="table-action" disabled={busy || !page} onClick={() => { setPage(page - 1); setBusy(true); }}>Anterior</button><span>Página {page + 1}</span><button className="table-action" disabled={busy || movements.length < 25} onClick={() => { setPage(page + 1); setBusy(true); }}>Próxima</button></div>
    </div>}
  </section>;
}
