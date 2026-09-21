"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, ShieldCheck, ShoppingBag, Trash2, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatBRL, products } from "../data/products";
type CartItem={slug:string;size:string;color:string;quantity:number};

export function CartClient(){
  const [items,setItems]=useState<CartItem[]>([]);const [cep,setCep]=useState("");const [shipping,setShipping]=useState<number|null>(null);const [loading,setLoading]=useState(false);
  useEffect(()=>{const timer=window.setTimeout(()=>{try{setItems(JSON.parse(localStorage.getItem("l7-commerce-cart")||"[]"))}catch{setItems([])}},0);return()=>window.clearTimeout(timer)},[]);
  function save(next:CartItem[]){setItems(next);localStorage.setItem("l7-commerce-cart",JSON.stringify(next));window.dispatchEvent(new Event("cart-updated"))}
  const subtotal=useMemo(()=>items.reduce((sum,item)=>sum+(products.find(p=>p.slug===item.slug)?.price||0)*item.quantity,0),[items]);
  function calculateShipping(){if(cep.replace(/\D/g,"").length!==8)return;setLoading(true);window.setTimeout(()=>{setShipping(18.9);setLoading(false)},650)}
  if(!items.length)return <div className="empty-cart"><span className="empty-icon"><ShoppingBag/></span><h2>Seu carrinho está vazio</h2><p>Escolha suas peças favoritas e volte aqui para finalizar.</p><Link className="primary-button" href="/produtos">Ver coleção</Link></div>;
  return <div className="cart-grid"><section className="cart-items">{items.map((item,index)=>{const product=products.find(p=>p.slug===item.slug);if(!product)return null;return <article className="cart-item" key={`${item.slug}-${item.size}-${item.color}`}><Image src={product.image} alt={product.name} width={132} height={164} className="cart-thumb"/><div className="cart-item-main"><div><h3>{product.name}</h3><p>{item.color} · Tam. {item.size}</p></div><strong>{formatBRL(product.price*item.quantity)}</strong><div className="quantity"><button aria-label="Diminuir" onClick={()=>save(items.map((it,i)=>i===index?{...it,quantity:Math.max(1,it.quantity-1)}:it))}><Minus size={15}/></button><span>{item.quantity}</span><button aria-label="Aumentar" onClick={()=>save(items.map((it,i)=>i===index?{...it,quantity:it.quantity+1}:it))}><Plus size={15}/></button></div></div><button className="remove" aria-label={`Remover ${product.name}`} onClick={()=>save(items.filter((_,i)=>i!==index))}><Trash2 size={18}/></button></article>})}</section><aside className="order-summary"><h2>Resumo do pedido</h2><div className="summary-line"><span>Subtotal</span><strong>{formatBRL(subtotal)}</strong></div><div className="shipping-box"><label htmlFor="cep">Calcular entrega</label><div><input id="cep" inputMode="numeric" placeholder="00000-000" value={cep} onChange={e=>setCep(e.target.value)}/><button onClick={calculateShipping}>{loading?"...":"Calcular"}</button></div>{shipping!==null&&<p><Truck size={16}/> PAC · 5 a 8 dias úteis <strong>{formatBRL(shipping)}</strong></p>}</div><div className="summary-total"><span>Total</span><strong>{formatBRL(subtotal+(shipping||0))}</strong></div><button className="primary-button full" disabled={shipping===null}>Ir para o checkout</button><small className="secure"><ShieldCheck size={15}/> Ambiente seguro · pagamento protegido</small><small className="demo-note">Frete e checkout em modo demonstração</small></aside></div>;
}
