import Image from "next/image";
import Link from "next/link";
import { formatBRL, type Product } from "../data/products";

export function ProductCard({ product }:{ product:Product }) {
  return <article className="product-card"><Link href={`/produto/${product.slug}`} className="product-image-wrap">{product.badge&&<span className="product-badge">{product.badge}</span>}<Image src={product.image} alt={product.name} fill sizes="(max-width: 720px) 50vw, 33vw" className="product-image"/></Link><div className="product-info"><p>{product.category}</p><Link href={`/produto/${product.slug}`}><h3>{product.name}</h3></Link><div className="price-line"><strong>{formatBRL(product.price)}</strong>{product.compareAt&&<s>{formatBRL(product.compareAt)}</s>}</div><small>ou 3x de {formatBRL(product.price/3)} sem juros</small></div></article>;
}
