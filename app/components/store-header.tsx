"use client";

import Link from "next/link";
import { Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { storeConfig } from "../config/store";
import { BrandLogo } from "./brand-logo";

function readCartCount() {
  try {
    const cart = JSON.parse(localStorage.getItem("l7-commerce-cart") || "[]") as Array<{ quantity:number }>;
    return cart.reduce((sum,item) => sum + item.quantity, 0);
  } catch { return 0; }
}

export function StoreHeader() {
  const [open,setOpen] = useState(false);
  const [count,setCount] = useState(0);
  useEffect(() => { const update=()=>setCount(readCartCount()); update(); window.addEventListener("cart-updated",update); window.addEventListener("storage",update); return()=>{window.removeEventListener("cart-updated",update);window.removeEventListener("storage",update)}; },[]);
  return <>
    {storeConfig.demoMode&&<div className="demo-banner">Demonstração L7 · produtos, valores e frete ilustrativos</div>}
    <div className="announcement">Frete calculado pelo CEP · Enviamos para todo o Brasil</div>
    <header className="store-header">
      <button className="icon-button mobile-only" aria-label="Abrir menu" onClick={()=>setOpen(true)}><Menu size={21}/></button>
      <Link href="/" className="brand" aria-label={`${storeConfig.name} — início`}><BrandLogo className="brand-logo" priority/></Link>
      <nav className="desktop-nav" aria-label="Navegação principal"><Link href="/produtos">Novidades</Link><Link href="/produtos">Vestidos</Link><Link href="/produtos">Conjuntos</Link><Link href="/produtos">Acessórios</Link></nav>
      <div className="header-actions"><Link href="/produtos" className="icon-button" aria-label="Buscar"><Search size={20}/></Link><Link href="/admin" className="icon-button desktop-icon" aria-label="Painel administrativo"><UserRound size={20}/></Link><Link href="/carrinho" className="icon-button cart-link" aria-label={`Carrinho com ${count} itens`}><ShoppingBag size={20}/>{count>0&&<span className="cart-count">{count}</span>}</Link></div>
    </header>
    {open&&<div className="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu"><div className="mobile-menu-top"><BrandLogo className="mobile-brand-logo"/><button className="icon-button" onClick={()=>setOpen(false)} aria-label="Fechar menu"><X/></button></div><nav><Link href="/produtos" onClick={()=>setOpen(false)}>Novidades</Link><Link href="/produtos" onClick={()=>setOpen(false)}>Vestidos</Link><Link href="/produtos" onClick={()=>setOpen(false)}>Conjuntos</Link><Link href="/produtos" onClick={()=>setOpen(false)}>Acessórios</Link><a href={storeConfig.instagramUrl} target="_blank" rel="noreferrer">Instagram</a><Link href="/admin" onClick={()=>setOpen(false)}>Painel administrativo</Link></nav></div>}
  </>;
}
