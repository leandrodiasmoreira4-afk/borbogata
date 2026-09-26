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
      {publishedCollection ? <section className="hero collection-hero">
        <div className="hero-image">
          <Image src={publishedCollection.coverImage} alt={publishedCollection.name} fill priority sizes="100vw" />
        </div>
        <div className="hero-overlay" />
        <div className="hero-content">
          <p>Nova coleção</p>
          <h1>{publishedCollection.name}</h1>
          <span>{publishedCollection.description}</span>
          <Link href="#colecao-atual" className="light-button">Ver a coleção <ArrowRight size={18} /></Link>
        </div>
      </section> : <section className="collection-launch" aria-labelledby="collection-launch-title">
        <div className="collection-launch-frames" aria-label="Sequência de três imagens de lançamento da coleção Borbo Maré Azul">
          <div><Image src="/campaign/borbo-mare-azul-abertura-17.webp" alt="Primeira imagem: detalhe do rosto da modelo" fill priority sizes="(max-width: 680px) 82vw, 33vw" /></div>
          <div><Image src="/campaign/borbo-mare-azul-abertura-18.webp" alt="Segunda imagem: detalhe do cabelo e acessórios dourados" fill priority sizes="(max-width: 680px) 82vw, 33vw" /></div>
          <div><Image src="/campaign/borbo-mare-azul-abertura-19.webp" alt="Terceira imagem: anúncio Borbo Maré Azul" fill priority sizes="(max-width: 680px) 82vw, 33vw" /></div>
        </div>
        <div className="collection-launch-caption"><div><p>Nova coleção</p><h1 id="collection-launch-title">Borbo Maré Azul</h1></div><Link href="#colecao-fotos" className="light-button">Conhecer a coleção <ArrowRight size={18} /></Link></div>
      </section>}

      {!publishedCollection && <section className="campaign-section" id="colecao-fotos" aria-labelledby="collection-photos-title">
        <div className="section-heading"><div><p>Nova coleção</p><h2 id="collection-photos-title">Borbo Maré Azul</h2></div><span>Fotos da coleção · peças a cadastrar</span></div>
        <div className="campaign-grid">
          <div><Image src="/campaign/borbo-mare-azul-look-1.webp" alt="Look azul da coleção, visto de frente" fill sizes="(max-width: 680px) 90vw, 33vw" /></div>
          <div><Image src="/campaign/borbo-mare-azul-look-2.webp" alt="Look azul da coleção em ambiente externo" fill sizes="(max-width: 680px) 90vw, 33vw" /></div>
          <div><Image src="/campaign/borbo-mare-azul-look-3.webp" alt="Look azul da coleção com conjunto sem mangas" fill sizes="(max-width: 680px) 90vw, 33vw" /></div>
        </div>
      </section>}

      <section className="benefits">
        <div><Truck /><span><strong>Enviamos para todo Brasil</strong><small>Frete calculado pelo CEP</small></span></div>
        <div><ShieldCheck /><span><strong>Compra segura</strong><small>Seus dados sempre protegidos</small></span></div>
        <div><RotateCcw /><span><strong>Troca descomplicada</strong><small>Até 7 dias após o recebimento</small></span></div>
      </section>

      <section className="collection-section" id="colecao-atual">
        <div className="section-heading">
          <div><p>{publishedCollection ? "Coleção atual" : "Teste a vitrine"}</p><h2>{publishedCollection?.name || "Vitrine de demonstração"}</h2></div>
          {publishedCollection
            ? <Link href={`/colecao/${publishedCollection.slug}`}>Ver coleção completa <ArrowRight size={17} /></Link>
            : <Link href="/produtos">Ver catálogo completo <ArrowRight size={17} /></Link>}
        </div>
        {!publishedCollection && <p className="demo-catalog-note">Estes produtos e preços são exemplos para testar variações, carrinho e a prévia do checkout. As peças da coleção Borbo Maré Azul serão cadastradas com dados reais.</p>}
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
        <div className="editorial-image"><Image src="/campaign/borbo-mare-azul-campanha.webp" alt="Três modelos com looks da coleção Borbo Maré Azul" fill sizes="(max-width: 800px) 100vw, 50vw" /></div>
        <div className="editorial-copy"><p>Borbo Maré Azul</p><h2>Uma coleção,<br />muitos jeitos de vestir.</h2><span>Veja mais registros da coleção no Instagram da Borbogata.</span><a href={storeConfig.instagramUrl} target="_blank" rel="noreferrer" className="outline-button">Ver no Instagram</a></div>
      </section>
    </main>
    <footer className="store-footer"><div className="footer-brand"><BrandLogo variant="lime" className="footer-logo" /></div><p>Moda feminina para quem é ousada, autêntica e sem limites.</p><div><Link href="/produtos">Coleções</Link><Link href="/carrinho">Meu carrinho</Link><a href={storeConfig.instagramUrl} target="_blank" rel="noreferrer">Instagram</a><Link href="/admin">Painel da loja</Link></div><small>© 2026 {storeConfig.name}. Tecnologia {storeConfig.platform}.</small></footer>
  </>;
}

function formatCollectionDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
