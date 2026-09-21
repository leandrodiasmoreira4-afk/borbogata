import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { ProductCard } from "../../components/product-card";
import { StoreHeader } from "../../components/store-header";
import { getCollectionBySlug } from "../../../lib/catalog/repository";

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { collection } = await getCollectionBySlug(slug);
  if (!collection) notFound();

  return <>
    <StoreHeader />
    <main>
      <section className="collection-detail-hero">
        <Image src={collection.coverImage} alt={collection.name} fill priority sizes="100vw" />
        <div className="hero-overlay" />
        <div className="collection-detail-copy">
          <p>{collection.isFeatured ? "Coleção atual" : "Coleção Borbogata"}</p>
          <h1>{collection.name}</h1>
          {collection.description && <span>{collection.description}</span>}
        </div>
      </section>
      <section className="collection-section">
        <Link href="/" className="back-link"><ArrowLeft size={16} /> Voltar para a loja</Link>
        <div className="section-heading"><div><p>Conheça as peças</p><h2>{collection.products.length} {collection.products.length === 1 ? "peça" : "peças"}</h2></div></div>
        {collection.products.length
          ? <div className="product-grid">{collection.products.map((product) => <ProductCard key={product.slug} product={product} />)}</div>
          : <p className="catalog-error">Esta coleção ainda não tem peças publicadas.</p>}
      </section>
    </main>
  </>;
}
