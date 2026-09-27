"use client";
import Image from "next/image";
import Link from "next/link";
import { MessageCircle, Search, ShoppingBag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { storeConfig } from "../config/store";
import "./store-navigation.css";

const links = [{ label: "Novidades", href: "/produtos" }, ...["Vestidos", "Conjuntos", "Acessórios"].map(label => ({ label, href: `/produtos?categoria=${encodeURIComponent(label)}` }))];
function readCartCount() { try { const cart = JSON.parse(localStorage.getItem("l7-commerce-cart") || "[]") as Array<{ quantity: number }>; return cart.reduce((sum, item) => sum + item.quantity, 0); } catch { return 0; } }

export function StoreHeader({ overlay = false }: { overlay?: boolean }) {
  const [count, setCount] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const update = () => setCount(readCartCount());
    const scroll = () => setScrolled(window.scrollY > 24);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && menu.current?.open) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } };
    update(); scroll(); window.addEventListener("cart-updated", update); window.addEventListener("storage", update); window.addEventListener("scroll", scroll, { passive: true }); window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("cart-updated", update); window.removeEventListener("storage", update); window.removeEventListener("scroll", scroll); window.removeEventListener("keydown", escape); };
  }, []);
  const closeMenu = () => { if (menu.current) menu.current.open = false; };
  return <>
    <noscript><style>{".boutique-header.over-film{position:absolute;background:#5a2b5b;color:white}"}</style></noscript>
    {overlay && <a className="store-skip" href="#conteudo">Ir para o conteúdo</a>}
    <header className={`boutique-header ${overlay ? "over-film" : ""} ${scrolled ? "is-scrolled" : ""}`}>
      <details className="boutique-menu" ref={menu}><summary aria-label="Menu da loja"><span /><span /><span /></summary><nav aria-label="Menu da loja">{links.map(link => <Link key={link.label} href={link.href} onClick={closeMenu}>{link.label}</Link>)}<a href={storeConfig.whatsappUrl} target="_blank" rel="noreferrer">WhatsApp</a><a href={storeConfig.instagramUrl} target="_blank" rel="noreferrer">Instagram</a></nav></details>
      <nav className="boutique-desktop" aria-label="Navegação principal">{links.map(link => <Link key={link.label} href={link.href}>{link.label}</Link>)}</nav>
      <Link href="/" className="boutique-logo" aria-label="Borbogata — início"><Image src="/brand/borbogata-logo-purple.svg" alt="Borbogata" width={200} height={51} priority /></Link>
      <div className="boutique-actions"><Link href="/produtos" aria-label="Buscar produtos"><Search size={21} /></Link><Link href="/carrinho" aria-label={`Sacola com ${count} itens`}><ShoppingBag size={21} />{count > 0 && <span>{count}</span>}</Link></div>
    </header>
    <a className="whatsapp-contact boutique-contact" href={storeConfig.whatsappUrl} target="_blank" rel="noreferrer" aria-label={`Falar com a Borbogata pelo WhatsApp no número ${storeConfig.support}`}><MessageCircle size={22} aria-hidden="true" /><span>Fale conosco</span></a>
  </>;
}
