"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, ShieldCheck, ShoppingBag, Trash2, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { parseStoredCart, resolveCartItem, type CartItem } from "../../lib/cart/model";
import { formatBRL, products as demoProducts, type Product } from "../data/products";

const CART_STORAGE_KEY = "l7-commerce-cart";

export function CartClient(){
  const [items,setItems]=useState<CartItem[]>([]);
  const [catalogProducts,setCatalogProducts]=useState<Product[]>(demoProducts);
  const [cep,setCep]=useState("");
  const [shipping,setShipping]=useState<number|null>(null);
  const [loading,setLoading]=useState(false);

  useEffect(()=>{
    const timer=window.setTimeout(()=>setItems(parseStoredCart(localStorage.getItem(CART_STORAGE_KEY))),0);
    return()=>window.clearTimeout(timer);
  },[]);

  useEffect(()=>{
    let active=true;
    void fetch("/api/catalog")
      .then(async response=>response.ok?await response.json() as {products?:Product[]}:null)
      .then(result=>{if(active&&result?.products)setCatalogProducts(result.products)})
      .catch(()=>undefined);
    return()=>{active=false};
  },[]);

  function save(next:CartItem[]){
    setItems(next);
    localStorage.setItem(CART_STORAGE_KEY,JSON.stringify(next));
    window.dispatchEvent(new Event("cart-updated"));
  }

  const lines=useMemo(()=>items.flatMap((item,index)=>{
    const resolved=resolveCartItem(item,catalogProducts);
    return resolved?[{...resolved,index}]:[];
  }),[items,catalogProducts]);
  const unavailableCount=items.length-lines.length;
  const subtotal=useMemo(()=>lines.reduce((sum,line)=>sum+line.variant.price*line.item.quantity,0),[lines]);

  function updateQuantity(index:number,quantity:number){
    const resolved=resolveCartItem(items[index],catalogProducts);
    if(!resolved)return;
    const nextQuantity=Math.max(1,Math.min(quantity,resolved.variant.stock));
    save(items.map((item,itemIndex)=>itemIndex===index?{...resolved.item,quantity:nextQuantity}:item));
  }

  function calculateShipping(){
    if(cep.replace(/\D/g,"").length!==8)return;
    setLoading(true);
    window.setTimeout(()=>{setShipping(18.9);setLoading(false)},650);
  }

  if(!items.length)return <div className="empty-cart"><span className="empty-icon"><ShoppingBag/></span><h2>Seu carrinho está vazio</h2><p>Escolha suas peças favoritas e volte aqui para finalizar.</p><Link className="primary-button" href="/produtos">Ver coleção</Link></div>;

  return <div className="cart-grid">
    <section className="cart-items">
      {unavailableCount>0&&<div className="cart-warning"><p>{unavailableCount===1?"Uma peça do carrinho não está mais disponível.":`${unavailableCount} peças do carrinho não estão mais disponíveis.`}</p><button type="button" onClick={()=>save(lines.map(line=>line.item))}>Remover indisponíveis</button></div>}
      {lines.map(({item,product,variant,index})=><article className="cart-item" key={variant.id}>
        <Image src={product.image} alt={product.name} width={132} height={164} className="cart-thumb"/>
        <div className="cart-item-main">
          <div><h3>{product.name}</h3><p>{variant.color} · Tam. {variant.size}</p><small>SKU {variant.sku}</small></div>
          <strong>{formatBRL(variant.price*item.quantity)}</strong>
          <div className="quantity">
            <button type="button" aria-label="Diminuir" onClick={()=>updateQuantity(index,item.quantity-1)}><Minus size={15}/></button>
            <span>{item.quantity}</span>
            <button type="button" aria-label="Aumentar" disabled={item.quantity>=variant.stock} onClick={()=>updateQuantity(index,item.quantity+1)}><Plus size={15}/></button>
          </div>
        </div>
        <button type="button" className="remove" aria-label={`Remover ${product.name}`} onClick={()=>save(items.filter((_,itemIndex)=>itemIndex!==index))}><Trash2 size={18}/></button>
      </article>)}
    </section>
    <aside className="order-summary">
      <h2>Resumo do pedido</h2>
      <div className="summary-line"><span>Subtotal</span><strong>{formatBRL(subtotal)}</strong></div>
      <div className="shipping-box">
        <label htmlFor="cep">Calcular entrega</label>
        <div><input id="cep" inputMode="numeric" placeholder="00000-000" value={cep} onChange={event=>setCep(event.target.value)}/><button type="button" onClick={calculateShipping}>{loading?"...":"Calcular"}</button></div>
        {shipping!==null&&<p><Truck size={16}/> PAC · 5 a 8 dias úteis <strong>{formatBRL(shipping)}</strong></p>}
      </div>
      <div className="summary-total"><span>Total</span><strong>{formatBRL(subtotal+(shipping||0))}</strong></div>
      <button type="button" className="primary-button full" disabled={shipping===null||unavailableCount>0||!lines.length}>Ir para o checkout</button>
      <small className="secure"><ShieldCheck size={15}/> Ambiente seguro · pagamento protegido</small>
      <small className="demo-note">Frete e checkout em modo demonstração</small>
    </aside>
  </div>;
}
