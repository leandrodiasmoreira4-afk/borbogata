"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { parseStoredCart, type CartItem } from "../../lib/cart/model";
import { validateCheckoutDetails, type CheckoutDetails } from "../../lib/checkout/details";
import type { DeliveryMethod } from "../../lib/checkout/quote";
import { formatBRL } from "../data/products";

type Quote = {
  lines: { variantId: string; name: string; color: string; size: string; quantity: number; totalCents: number }[];
  subtotalCents: number;
  source: "database" | "demo";
  delivery: DeliveryMethod;
  deliveryFeeCents: number | null;
};

export function CheckoutClient() {
  const [items, setItems] = useState<CartItem[] | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [delivery, setDelivery] = useState<DeliveryMethod>("pickup");
  const [detailsError, setDetailsError] = useState("");
  const [reviewed, setReviewed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setItems(parseStoredCart(localStorage.getItem("l7-commerce-cart"))), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!items?.length) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch("/api/checkout/quote", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, delivery }), signal: controller.signal,
      }).then(async (response) => {
      const result = await response.json() as Quote & { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível conferir o carrinho.");
      setQuote(result);
      }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Não foi possível conferir o carrinho.");
      });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [items, delivery]);

  function reviewDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) || "").trim();
    const details: CheckoutDetails = {
      name: field("name"), email: field("email"), phone: field("phone"), delivery,
      ...(delivery === "pickup" ? {} : {
        postalCode: field("postalCode"), street: field("street"), number: field("number"),
        complement: field("complement"), district: field("district"), city: field("city"), state: field("state"),
      }),
    };
    const validationError = validateCheckoutDetails(details);
    setDetailsError(validationError || "");
    setReviewed(!validationError);
  }

  if (items === null) return <p>Conferindo seu carrinho…</p>;
  if (!items.length) return <div className="empty-cart"><h2>Seu carrinho está vazio</h2><Link href="/produtos" className="primary-button">Ver produtos</Link></div>;
  if (error) return <div className="cart-warning"><p>{error}</p><Link href="/carrinho">Revisar carrinho</Link></div>;
  if (!quote) return <p>Conferindo preços e disponibilidade…</p>;
  const quotePending = quote.delivery !== delivery;

  return <div className="cart-grid">
    <form className="checkout-form" onSubmit={reviewDetails} onChange={() => { setReviewed(false); setDetailsError(""); }}>
      <h2>Seus dados</h2>
      <div className="checkout-fields">
        <label>Nome completo<input autoComplete="name" name="name" placeholder="Seu nome" required/></label>
        <label>E-mail<input autoComplete="email" type="email" name="email" placeholder="voce@exemplo.com" required/></label>
        <label>Celular<input autoComplete="tel" type="tel" name="phone" placeholder="(71) 99999-9999" required/></label>
      </div>
      <h2>Como deseja receber?</h2>
      <fieldset className="checkout-delivery"><legend>Escolha uma opção de entrega</legend>
        <label><input type="radio" name="delivery" value="pickup" checked={delivery==="pickup"} onChange={event=>{setError("");setDelivery(event.target.value as DeliveryMethod)}}/> Retirar na loja <span>Sem frete</span></label>
        <label><input type="radio" name="delivery" value="courier" checked={delivery==="courier"} onChange={event=>{setError("");setDelivery(event.target.value as DeliveryMethod)}}/> Motoboy em Salvador <span>Valor a confirmar</span></label>
        <label><input type="radio" name="delivery" value="correios" checked={delivery==="correios"} onChange={event=>{setError("");setDelivery(event.target.value as DeliveryMethod)}}/> Correios <span>Valor e prazo a confirmar</span></label>
      </fieldset>
      {delivery !== "pickup" && <>
        <h2>Endereço de entrega</h2>
        <div className="checkout-fields">
          <label>CEP<input name="postalCode" autoComplete="postal-code" inputMode="numeric" placeholder="00000-000" required/></label>
          <label>Rua / avenida<input name="street" autoComplete="address-line1" required/></label>
          <label>Número<input name="number" required/></label>
          <label>Complemento<input name="complement" autoComplete="address-line2"/></label>
          <label>Bairro<input name="district" required/></label>
          <label>Cidade<input name="city" autoComplete="address-level2" required/></label>
          <label>UF<input name="state" autoComplete="address-level1" maxLength={2} placeholder="BA" required/></label>
        </div>
      </>}
      {detailsError && <p className="form-error" role="alert">{detailsError}</p>}
      {reviewed && <p className="checkout-reviewed" role="status">Dados conferidos nesta prévia. O envio do pedido ficará disponível após a integração do pagamento.</p>}
      <button type="submit" className="primary-button">Conferir dados</button>
      <p className="checkout-muted">Esta etapa é uma prévia. Seus dados não são enviados nem salvos; pedido e pagamento ainda não são criados.</p>
    </form>
    <aside className="order-summary">
      <h2>Confira suas peças</h2>
      {quote.lines.map((line, index) => <div className="summary-line" key={`${line.variantId}-${index}`}><span>{line.quantity}× {line.name}<small className="checkout-detail">{line.color} · Tam. {line.size}</small></span><strong>{formatBRL(line.totalCents/100)}</strong></div>)}
      <div className="summary-line"><span>Subtotal</span><strong>{formatBRL(quote.subtotalCents/100)}</strong></div>
      <div className="summary-line"><span>Entrega</span><strong>{quotePending?"Conferindo…":quote.deliveryFeeCents===0?"Grátis":"A confirmar"}</strong></div>
      <div className="summary-total"><span>{!quotePending&&quote.deliveryFeeCents===0?"Total estimado":"Subtotal sem frete"}</span><strong>{formatBRL(quote.subtotalCents/100)}</strong></div>
      <button type="button" className="primary-button full" disabled>Pagamento em preparação</button>
      <small className="demo-note">{quote.source==="demo"?"Catálogo demonstrativo · ":""}Nenhum pedido ou cobrança será gerado.</small>
    </aside>
  </div>;
}
