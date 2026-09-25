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
  const publishedCollection = collectionResult.source === "database" ? featured : null;
  const featuredProducts = featured?.products.length ? featured.products : catalog.products;
  const olderCollections = collectionResult.collections.filter((collection) => collection.id !== featured?.id);

  return <>
    <StoreHeader />
    <main>
      <section className="hero collection-hero">
        <div className="hero-image">
          <Image src={publishedCollection?.coverImage || "/campaign/borbo-mare-azul-mar.webp"} alt={publishedCollection?.name || "Campanha Borbo Maré Azul, com modelo à beira-mar"} fill priority sizes="100vw" />
        </div>
        <div className="hero-overlay" />
        <div className="hero-content">
          <p>{publishedCollection ? "Nova coleção" : "Borbogata · Campanha"}</p>
          <h1>{publishedCollection?.name || <>Borbo<br /><em>Maré Azul.</em></>}</h1>
          <span>{publishedCollection?.description || "Conheça as imagens da campanha."}</span>
          <Link href={publishedCollection ? "#colecao-atual" : "#campanha"} className="light-button">{publishedCollection ? "Ver a coleção" : "Ver campanha"} <ArrowRight size={18} /></Link>
        </div>
      </section>

      <section className="campaign-section" id="campanha" aria-labelledby="campaign-title">
        <div className="section-heading"><div><p>Editorial Borbogata</p><h2 id="campaign-title">Borbo Maré Azul</h2></div><span>Imagens da campanha · produtos a cadastrar</span></div>
        <div className="campaign-grid">
          <div><Image src="/campaign/borbo-mare-azul-look-1.webp" alt="Look azul da campanha, visto de frente" fill sizes="(max-width: 680px) 90vw, 33vw" /></div>
          <div><Image src="/campaign/borbo-mare-azul-look-2.webp" alt="Look azul da campanha em ambiente externo" fill sizes="(max-width: 680px) 90vw, 33vw" /></div>
          <div><Image src="/campaign/borbo-mare-azul-look-3.webp" alt="Look azul da campanha com conjunto sem mangas" fill sizes="(max-width: 680px) 90vw, 33vw" /></div>
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
        <div className="editorial-image"><Image src="/campaign/borbo-mare-azul-campanha.webp" alt="Três modelos com looks da campanha Borbo Maré Azul" fill sizes="(max-width: 800px) 100vw, 50vw" /></div>
        <div className="editorial-copy"><p>Borbo Maré Azul</p><h2>Uma campanha,<br />muitos jeitos de vestir.</h2><span>Veja mais registros da campanha no Instagram da Borbogata.</span><a href={storeConfig.instagramUrl} target="_blank" rel="noreferrer" className="outline-button">Ver no Instagram</a></div>
      </section>
    </main>
    <footer className="store-footer"><div className="footer-brand"><BrandLogo variant="lime" className="footer-logo" /></div><p>Moda feminina para quem é ousada, autêntica e sem limites.</p><div><Link href="/produtos">Coleções</Link><Link href="/carrinho">Meu carrinho</Link><a href={storeConfig.instagramUrl} target="_blank" rel="noreferrer">Instagram</a><Link href="/admin">Painel da loja</Link></div><small>© 2026 {storeConfig.name}. Tecnologia {storeConfig.platform}.</small></footer>
  </>;
}

function formatCollectionDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
