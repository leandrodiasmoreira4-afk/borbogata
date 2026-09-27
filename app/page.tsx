import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "./components/product-card";
import { StoreHeader } from "./components/store-header";
import { BrandHero } from "./components/brand-hero";
import { storeConfig } from "./config/store";
import { getCatalog, getCollections } from "../lib/catalog/repository";
import "./home.css";

const categories = [
  { name: "Vestidos", image: "/campaign/borbo-mare-azul-campanha.webp" },
  { name: "Conjuntos", image: "/campaign/borbo-mare-azul-look-2.webp" },
  { name: "Acessórios", image: "/campaign/borbo-mare-azul-look-1.webp" },
];

export default async function Home() {
  const catalog = await getCatalog();
  const collections = await getCollections(catalog);
  const featured = collections.source === "database" ? collections.featured : null;
  const products = catalog.source === "database" ? (featured?.products.length ? featured.products : catalog.products).slice(0, 8) : [];
  return <div className="borbogata-home">
    <StoreHeader overlay />
    <main id="conteudo">
      <BrandHero />
      <section className="brand-introduction" aria-label="Sobre a Borbogata"><p className="home-eyebrow">Seu estilo, nossa história</p><p>A Borbogata celebra mulheres que vestem sua personalidade com confiança. Peças escolhidas para acompanhar diferentes estilos, momentos e histórias.</p></section>
      <section className="home-featured home-section" id="novidades" aria-labelledby="featured-title">
        <div className="home-section-heading"><h2 id="featured-title">Escolhas que são você.</h2><Link href="/produtos">Explorar a loja</Link></div>
        {products.length > 0 ? <div className="product-grid">{products.map(product => <ProductCard key={product.slug} product={product} />)}</div>
          : <div className="home-catalog-empty"><p>{catalog.error ? "As novidades estão indisponíveis no momento." : "Encontre sua próxima escolha com a Borbogata."}</p><a href={storeConfig.whatsappUrl} target="_blank" rel="noreferrer">Consulte as peças disponíveis pelo WhatsApp</a></div>}
      </section>
      <section className="home-section" aria-labelledby="category-title"><div className="home-section-heading"><h2 id="category-title">Para cada versão sua.</h2></div><div className="home-category-grid">{categories.map(category => <Link key={category.name} href={`/produtos?categoria=${encodeURIComponent(category.name)}`} className="home-category"><Image src={category.image} alt={`Editorial Borbogata — ${category.name}`} fill sizes="(max-width: 680px) 100vw, 33vw" /><span>{category.name}</span></Link>)}</div></section>
      <section className="home-campaign" aria-labelledby="campaign-title">
        <div className="home-campaign-image"><Image src={featured?.coverImage || "/campaign/borbo-mare-azul-campanha.webp"} alt={featured ? `Editorial ${featured.name}` : "Modelos na campanha Borbo Maré Azul"} fill sizes="(max-width: 680px) 100vw, 60vw" /></div>
        <div className="home-campaign-copy"><p className="home-eyebrow">O universo Borbogata</p><h2 id="campaign-title">{featured?.name || "Borbo Maré Azul"}</h2><p>{featured?.description || "Novos encontros entre cor, movimento e personalidade."}</p>{featured ? <Link href={`/colecao/${featured.slug}`} className="home-text-link">Conheça a coleção</Link> : <a href={storeConfig.instagramUrl} target="_blank" rel="noreferrer" className="home-text-link">Veja a campanha no Instagram</a>}</div>
      </section>
      <section className="home-service home-section" aria-label="Atendimento e entrega">
        <div><h3>Até você</h3><p>Entrega pelos Correios. Consulte prazos e valores no atendimento.</p></div><div><h3>Perto de você</h3><p>Retirada ou entrega em Salvador, conforme disponibilidade.</p></div><div><h3>Conte com a gente</h3><a href={storeConfig.whatsappUrl} target="_blank" rel="noreferrer">Atendimento pelo WhatsApp</a><a href={storeConfig.instagramUrl} target="_blank" rel="noreferrer">{storeConfig.instagram}</a></div>
      </section>
    </main>
    <footer className="home-footer">
      <div className="home-footer-brand"><Image src="/brand/borbogata-logo-white.svg" alt="Borbogata — ousada e sem limites" width={220} height={56} /><p>Você, ousada e sem limites.</p></div>
      <nav aria-label="Links da loja"><h2>Explore</h2><Link href="/produtos">Novidades</Link>{categories.map(c => <Link key={c.name} href={`/produtos?categoria=${encodeURIComponent(c.name)}`}>{c.name}</Link>)}<Link href="/carrinho">Minha sacola</Link></nav>
      <div><h2>Vamos conversar</h2><a href={storeConfig.whatsappUrl} target="_blank" rel="noreferrer">WhatsApp · {storeConfig.support}</a><a href={storeConfig.instagramUrl} target="_blank" rel="noreferrer">Instagram · {storeConfig.instagram}</a><p>Salvador, Bahia</p></div>
      <small>© 2026 Borbogata <span>Tecnologia L7 Developer</span></small>
    </footer>
  </div>;
}
