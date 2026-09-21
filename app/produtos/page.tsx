import { ProductCard } from "../components/product-card";
import { StoreHeader } from "../components/store-header";
import { products } from "../data/products";
export default function ProductsPage(){return <><StoreHeader/><main className="catalog-page"><div className="catalog-heading"><p>Coleção atual</p><h1>Novidades</h1><span>Peças selecionadas para renovar seu guarda-roupa.</span></div><div className="catalog-toolbar"><strong>{products.length} produtos</strong><button>Ordenar: mais recentes</button></div><div className="product-grid">{products.map(product=><ProductCard key={product.slug} product={product}/>)}</div></main></>}
