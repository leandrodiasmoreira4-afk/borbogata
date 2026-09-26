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
  const heroCollectionName = publishedCollection?.name || "Borbo Maré Azul";
  const featuredProducts = publishedCollection ? publishedCollection.products : catalog.products;
  const olderCollections = collectionResult.collections.filter((collection) => collection.id !== featured?.id);

  return <>
    <StoreHeader />
    <main>
      <section className="collection-hero" aria-labelledby="collection-launch-title">
        <div className="collection-hero-copy">
          <p className="collection-hero-kicker">Nova coleção</p>
          <h1 id="collection-launch-title">{heroCollectionName}</h1>
          <p className="collection-hero-description">
            {publishedCollection?.description ||
              "Conheça os primeiros looks da nova coleção nas fotos oficiais da Borbogata."}
          </p>
          <Link
            href={publishedCollection ? `/colecao/${publishedCollection.slug}` : "#colecao-atual"}
            className="collection-hero-cta"
          >
            Ver coleção <ArrowRight size={17} aria-hidden="true" />
          </Link>
          {!publishedCollection && (
            <small>Prévia visual · peças e valores serão cadastrados em breve</small>
          )}
        </div>

        <div className="collection-hero-gallery" aria-label={`Editorial ${heroCollectionName}`}>
          <figure className="collection-hero-main">
            <Image
              src={publishedCollection?.coverImage || "/campaign/borbo-mare-azul-look-2.webp"}
              alt={publishedCollection
                ? `Look da coleção ${heroCollectionName}`
                : "Look jeans azul da coleção Borbo Maré Azul"}
              fill
              priority
              sizes={publishedCollection
                ? "(max-width: 680px) 74vw, (max-width: 900px) 58vw, 64vw"
                : "(max-width: 680px) 74vw, (max-width: 900px) 58vw, 25vw"}
            />
          </figure>
          {!publishedCollection && (
            <div className="collection-hero-pair">
              <figure>
                <Image
                  src="/campaign/borbo-mare-azul-look-1.webp"
                  alt="Conjunto azul estampado da coleção Borbo Maré Azul"
                  fill
                  priority
                  sizes="(max-width: 680px) 74vw, 19vw"
                />
              </figure>
              <figure>
                <Image
                  src="/campaign/borbo-mare-azul-look-3.webp"
                  alt="Look azul sem mangas da coleção Borbo Maré Azul"
                  fill
                  sizes="(max-width: 680px) 74vw, 19vw"
                />
              </figure>
            </div>
          )}
        </div>
      </section>

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
