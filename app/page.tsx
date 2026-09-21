import Image from "next/image";
import Link from "next/link";
import { ArrowRight, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { ProductCard } from "./components/product-card";
import { StoreHeader } from "./components/store-header";
import { BrandLogo } from "./components/brand-logo";
import { storeConfig } from "./config/store";
import { getCatalog, getCollections } from "../lib/catalog/repository";

export default async function Home() {
  const catalog = await getCatalog();
  const collectionResult = await getCollections(catalog);
  const featured = collectionResult.featured;
  const featuredProducts = featured?.products.length ? featured.products : catalog.products;
  const olderCollections = collectionResult.collections.filter((collection) => collection.id !== featured?.id);

  return <>
    <StoreHeader />
    <main>
      <section className="hero collection-hero">
        <div className="hero-image">
          <Image src={featured?.coverImage || "/products/macacao-noir.png"} alt={featured?.name || "Coleção Borbogata"} fill priority sizes="100vw" />
        </div>
        <div className="hero-overlay" />
        <div className="hero-content">
          <p>{featured ? "Nova coleção" : "Borbogata · Moda feminina"}</p>
          <h1>{featured?.name || <>Ousada.<br /><em>Sem limites.</em></>}</h1>
          <span>{featured?.description || "Moda para quem vive intensamente, acompanha as tendências e não tem medo de se destacar."}</span>
          <Link href="#colecao-atual" className="light-button">Ver a coleção <ArrowRight size={18} /></Link>
        </div>
      </section>

      <section className="benefits">
        <div><Truck /><span><strong>Enviamos para todo Brasil</strong><small>Frete calculado pelo CEP</small></span></div>
        <div><ShieldCheck /><span><strong>Compra segura</strong><small>Seus dados sempre protegidos</small></span></div>
        <div><RotateCcw /><span><strong>Troca descomplicada</strong><small>Até 7 dias após o recebimento</small></span></div>
      </section>

      <section className="collection-section" id="colecao-atual">
        <div className="section-heading">
          <div><p>Coleção atual</p><h2>{featured?.name || "Peças que você vai amar"}</h2></div>
          {featured
            ? <Link href={`/colecao/${featured.slug}`}>Ver coleção completa <ArrowRight size={17} /></Link>
            : <Link href="/produtos">Ver catálogo completo <ArrowRight size={17} /></Link>}
        </div>
        {catalog.error || collectionResult.error
          ? <p className="catalog-error">{catalog.error || collectionResult.error}</p>
          : <div className="product-grid">{featuredProducts.map((product) => <ProductCard key={product.slug} product={product} />)}</div>}
      </section>

      {olderCollections.length > 0 && <section className="collection-archive">
        <div className="section-heading"><div><p>Arquivo Borbogata</p><h2>Coleções anteriores</h2></div></div>
        <div className="collection-archive-grid">
          {olderCollections.map((collection) => <Link className="collection-story" href={`/colecao/${collection.slug}`} key={collection.id}>
            <div><Image src={collection.coverImage} alt={collection.name} fill sizes="(max-width: 680px) 100vw, 33vw" /></div>
            <small>{formatCollectionDate(collection.launchedAt)}</small>
            <h3>{collection.name}</h3>
            <span>Ver coleção <ArrowRight size={15} /></span>
          </Link>)}
        </div>
      </section>}

      <section className="editorial">
        <div className="editorial-image"><Image src="/products/bolsa-aurora.png" alt="Acessórios Borbogata" fill sizes="(max-width: 800px) 100vw, 50vw" /></div>
        <div className="editorial-copy"><p>Acessórios</p><h2>Seu estilo cria<br />o próprio caminho.</h2><span>Detalhes marcantes e combinações feitas para mulheres autênticas, confiantes e prontas para brilhar.</span><Link href="/produtos" className="outline-button">Explorar acessórios</Link></div>
      </section>
    </main>
    <footer className="store-footer"><div className="footer-brand"><BrandLogo variant="lime" className="footer-logo" /></div><p>Moda feminina para quem é ousada, autêntica e sem limites.</p><div><Link href="/produtos">Coleções</Link><Link href="/carrinho">Meu carrinho</Link><a href={storeConfig.instagramUrl} target="_blank" rel="noreferrer">Instagram</a><Link href="/admin">Painel da loja</Link></div><small>© 2026 {storeConfig.name}. Tecnologia {storeConfig.platform}.</small></footer>
  </>;
}

function formatCollectionDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
