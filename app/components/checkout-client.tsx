"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { parseStoredCart, type CartItem } from "../../lib/cart/model";
import { formatBRL } from "../data/products";

type Quote = {
  lines: { variantId: string; name: string; color: string; size: string; quantity: number; totalCents: number }[];
  subtotalCents: number;
  source: "database" | "demo";
};

export function CheckoutClient() {
  const [items, setItems] = useState<CartItem[] | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [delivery, setDelivery] = useState("pickup");

  useEffect(() => {
    const timer = window.setTimeout(() => setItems(parseStoredCart(localStorage.getItem("l7-commerce-cart"))), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!items?.length) return;
    const controller = new AbortController();
    void fetch("/api/checkout/quote", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }), signal: controller.signal,
    }).then(async (response) => {
      const result = await response.json() as Quote & { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível conferir o carrinho.");
      setQuote(result);
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Não foi possível conferir o carrinho.");
    });
    return () => controller.abort();
  }, [items]);

  if (items === null) return <p>Conferindo seu carrinho…</p>;
  if (!items.length) return <div className="empty-cart"><h2>Seu carrinho está vazio</h2><Link href="/produtos" className="primary-button">Ver produtos</Link></div>;
  if (error) return <div className="cart-warning"><p>{error}</p><Link href="/carrinho">Revisar carrinho</Link></div>;
  if (!quote) return <p>Conferindo preços e disponibilidade…</p>;

  return <div className="cart-grid">
    <section className="checkout-form">
      <h2>Seus dados</h2>
      <div className="checkout-fields">
        <label>Nome completo<input autoComplete="name" name="name" placeholder="Seu nome"/></label>
        <label>E-mail<input autoComplete="email" type="email" name="email" placeholder="voce@exemplo.com"/></label>
        <label>Celular<input autoComplete="tel" type="tel" name="phone" placeholder="(71) 99999-9999"/></label>
      </div>
      <h2>Como deseja receber?</h2>
      <fieldset className="checkout-delivery"><legend>Escolha uma opção de entrega</legend>
        <label><input type="radio" name="delivery" value="pickup" checked={delivery==="pickup"} onChange={event=>setDelivery(event.target.value)}/> Retirar na loja <span>Sem frete</span></label>
        <label><input type="radio" name="delivery" value="courier" checked={delivery==="courier"} onChange={event=>setDelivery(event.target.value)}/> Motoboy em Salvador <span>Valor a confirmar</span></label>
        <label><input type="radio" name="delivery" value="correios" checked={delivery==="correios"} onChange={event=>setDelivery(event.target.value)}/> Correios <span>Valor e prazo a confirmar</span></label>
      </fieldset>
      <p className="checkout-muted">Esta etapa é uma prévia. Seus dados não são enviados nem salvos; pedido e pagamento ainda não são criados.</p>
    </section>
    <aside className="order-summary">
      <h2>Confira suas peças</h2>
      {quote.lines.map((line, index) => <div className="summary-line" key={`${line.variantId}-${index}`}><span>{line.quantity}× {line.name}<small className="checkout-detail">{line.color} · Tam. {line.size}</small></span><strong>{formatBRL(line.totalCents/100)}</strong></div>)}
      <div className="summary-line"><span>Subtotal</span><strong>{formatBRL(quote.subtotalCents/100)}</strong></div>
      <div className="summary-line"><span>Entrega</span><strong>{delivery==="pickup"?"Grátis":"A confirmar"}</strong></div>
      <div className="summary-total"><span>{delivery==="pickup"?"Total estimado":"Subtotal sem frete"}</span><strong>{formatBRL(quote.subtotalCents/100)}</strong></div>
      <button type="button" className="primary-button full" disabled>Pagamento em preparação</button>
      <small className="demo-note">{quote.source==="demo"?"Catálogo demonstrativo · ":""}Nenhum pedido ou cobrança será gerado.</small>
    </aside>
  </div>;
}
