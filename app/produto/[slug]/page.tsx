import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCart } from "../../components/add-to-cart";
import { StoreHeader } from "../../components/store-header";
import { formatBRL } from "../../data/products";
import { getCatalogProduct } from "../../../lib/catalog/repository";

export default async function ProductPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const {product,error}=await getCatalogProduct(slug);
  if(error)throw new Error(error);
  if(!product)notFound();

  return <>
    <StoreHeader/>
    <main className="product-page">
      <div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><Link href="/produtos">{product.category}</Link><span>/</span><strong>{product.name}</strong></div>
      <div className="product-detail">
        <div className="detail-gallery">{product.images.map((image,index)=><div className="detail-image" key={`${image.url}-${image.sortOrder}`}><Image src={image.url} alt={image.alt} fill priority={index===0} sizes="(max-width: 800px) 100vw, 55vw"/></div>)}</div>
        <section className="detail-info">
          {product.badge&&<span className="detail-badge">{product.badge}</span>}
          <p>{product.category}</p>
          <h1>{product.name}</h1>
          <div className="detail-price"><strong>{formatBRL(product.price)}</strong>{product.compareAt&&<s>{formatBRL(product.compareAt)}</s>}</div>
          <small>3x de {formatBRL(product.price/3)} sem juros</small>
          <p className="description">{product.description}</p>
          <AddToCart product={product}/>
          <div className="detail-notes"><p><strong>Envio:</strong> cálculo pelo CEP no carrinho</p><p><strong>Estoque:</strong> {product.stock} unidades disponíveis</p></div>
        </section>
      </div>
    </main>
  </>;
}
