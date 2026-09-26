import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MapPin, MessageCircle, Truck } from "lucide-react";
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
  const featuredProducts = publishedCollection ? publishedCollection.products : catalog.products;
  const olderCollections = collectionResult.collections.filter((collection) => collection.id !== featured?.id);

  return <>
    <StoreHeader />
    <main>
      <section className="fashion-hero" aria-labelledby="collection-launch-title">
        <div className="fashion-hero-copy">
          <p>Nova coleção</p>
          <h1 id="collection-launch-title">{publishedCollection?.name || "Borbo Maré Azul"}</h1>
          {publishedCollection?.description && <span>{publishedCollection.description}</span>}
          <Link href={publishedCollection ? `/colecao/${publishedCollection.slug}` : "#colecao-fotos"} className="fashion-cta">Explorar coleção <ArrowRight size={18} /></Link>
          {!publishedCollection && <small>Prévia visual · peças da coleção ainda não cadastradas</small>}
        </div>
        <div className="fashion-hero-photos">
          <div className="fashion-photo-main"><Image src={publishedCollection?.coverImage || "/campaign/borbo-mare-azul-look-1.webp"} alt={publishedCollection?.name || "Look completo azul da coleção Borbo Maré Azul"} fill priority sizes="(max-width: 760px) 100vw, 38vw" /></div>
          {!publishedCollection && <div className="fashion-photo-secondary"><Image src="/campaign/borbo-mare-azul-look-3.webp" alt="Segundo look completo da coleção Borbo Maré Azul" fill sizes="24vw" /></div>}
        </div>
      </section>

      {!publishedCollection && <section className="campaign-section" id="colecao-fotos" aria-labelledby="collection-photos-title">
        <div className="section-heading"><div><p>Nova coleção</p><h2 id="collection-photos-title">Borbo Maré Azul</h2></div><span>Fotos da coleção · peças a cadastrar</span></div>
        <div className="campaign-grid">
          <div><Image src="/campaign/borbo-mare-azul-look-1.webp" alt="Look azul da coleção, visto de frente" fill sizes="(max-width: 680px) 90vw, 33vw" /></div>
          <div><Image src="/campaign/borbo-mare-azul-look-2.webp" alt="Look azul da coleção em ambiente externo" fill sizes="(max-width: 680px) 90vw, 33vw" /></div>
          <div><Image src="/campaign/borbo-mare-azul-look-3.webp" alt="Look azul da coleção com conjunto sem mangas" fill sizes="(max-width: 680px) 90vw, 33vw" /></div>
        </div>
      </section>}

      <section className="collection-section" id="colecao-atual">
        <div className="section-heading">
          <div><p>Produtos em destaque</p><h2>{publishedCollection?.name || "Vitrine de demonstração"}</h2></div>
          {publishedCollection
            ? <Link href={`/colecao/${publishedCollection.slug}`}>Ver coleção completa <ArrowRight size={17} /></Link>
            : <Link href="/produtos">Ver catálogo completo <ArrowRight size={17} /></Link>}
        </div>
        {!publishedCollection && <p className="demo-catalog-note">Estes produtos e preços são exemplos para testar variações, carrinho e a prévia do checkout. As peças da coleção Borbo Maré Azul serão cadastradas com dados reais.</p>}
        {catalog.error || collectionResult.error
          ? <p className="catalog-error">{catalog.error || collectionResult.error}</p>
          : featuredProducts.length ? <div className="product-grid">{featuredProducts.map((product) => <ProductCard key={product.slug} product={product} />)}</div> : <p className="catalog-error">As peças desta coleção ainda não foram publicadas. Explore o catálogo para ver outros produtos disponíveis.</p>}
      </section>

      <section className="home-categories" aria-labelledby="categories-title"><div className="section-heading"><div><p>Encontre seu estilo</p><h2 id="categories-title">Explore as peças</h2></div></div><div className="category-links">{["Vestidos", "Conjuntos", "Acessórios"].map(name => <Link key={name} href={`/produtos?categoria=${encodeURIComponent(name)}`}>{name}<ArrowRight size={20}/></Link>)}</div></section>

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
      <section className="benefits" aria-label="Entrega e atendimento">
        <div><Truck /><span><strong>Correios</strong><small>Valor e prazo a confirmar no atendimento</small></span></div>
        <div><MapPin /><span><strong>Retirada na loja ou entrega em Salvador</strong><small>Disponibilidade e valores a confirmar</small></span></div>
        <div><MessageCircle /><span><strong>Fale com a Borbogata</strong><small><a href={storeConfig.instagramUrl} target="_blank" rel="noreferrer">Atendimento pelo Instagram</a></small></span></div>
      </section>
    </main>
    <footer className="store-footer"><div className="footer-brand"><BrandLogo className="footer-logo" /></div><p>Seu estilo, nossa história.</p><div><Link href="/produtos">Produtos</Link><Link href="/carrinho">Minha sacola</Link><a href={storeConfig.instagramUrl} target="_blank" rel="noreferrer">Instagram</a><Link href="/admin">Painel da loja</Link></div><small>© 2026 {storeConfig.name}. Tecnologia {storeConfig.platform}.</small></footer>
  </>;
}

function formatCollectionDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
