export type ProductVariant = {
  id: string;
  sku: string;
  name: string;
  color: string;
  size: string;
  price: number;
  compareAt?: number;
  stock: number;
};

export type ProductImage = {
  url: string;
  alt: string;
  sortOrder: number;
};

export type Product = {
  slug: string;
  name: string;
  category: string;
  price: number;
  compareAt?: number;
  image: string;
  images: ProductImage[];
  description: string;
  variants: ProductVariant[];
  sizes: string[];
  colors: string[];
  stock: number;
  badge?: string;
};

export const products: Product[] = [
  createDemoProduct({
    slug: "vestido-luna-creme",
    name: "Vestido Luna",
    category: "Vestidos",
    image: "/products/vestido-luna.png",
    description: "Vestido midi com caimento leve, cintura marcada e acabamento delicado. Uma peça elegante para ocasiões especiais ou produções sofisticadas no dia a dia.",
    badge: "Novo",
    variants: [
      variant("demo-luna-creme-p", "LUNA-CREME-P", "Creme", "P", 189.9, 3, 229.9),
      variant("demo-luna-creme-m", "LUNA-CREME-M", "Creme", "M", 189.9, 3, 229.9),
      variant("demo-luna-vinho-g", "LUNA-VINHO-G", "Vinho", "G", 189.9, 2, 229.9),
    ],
  }),
  createDemoProduct({
    slug: "macacao-noir",
    name: "Macacão Noir",
    category: "Macacões",
    image: "/products/macacao-noir.png",
    description: "Macacão preto de modelagem alongada, decote elegante e tecido encorpado. Conforto e presença em uma única peça.",
    badge: "Mais vendido",
    variants: [
      variant("demo-noir-preto-p", "NOIR-PRETO-P", "Preto", "P", 219.9, 2),
      variant("demo-noir-preto-m", "NOIR-PRETO-M", "Preto", "M", 219.9, 3),
    ],
  }),
  createDemoProduct({
    slug: "bolsa-aurora-vinho",
    name: "Bolsa Aurora",
    category: "Acessórios",
    image: "/products/bolsa-aurora.png",
    description: "Bolsa estruturada em tom vinho com ferragens douradas e alça ajustável. Compacta por fora e prática por dentro.",
    variants: [
      variant("demo-aurora-vinho", "AURORA-VINHO", "Vinho", "Único", 139.9, 12),
    ],
  }),
];

function variant(id: string, sku: string, color: string, size: string, price: number, stock: number, compareAt?: number): ProductVariant {
  return { id, sku, name: `${color} / ${size}`, color, size, price, stock, compareAt };
}

function createDemoProduct(input: Omit<Product, "price" | "compareAt" | "images" | "sizes" | "colors" | "stock">): Product {
  const available = input.variants.filter((item) => item.stock > 0);
  const priceSource = available.length ? available : input.variants;
  const lowest = priceSource.reduce((current, item) => item.price < current.price ? item : current);
  return {
    ...input,
    price: lowest.price,
    compareAt: lowest.compareAt,
    images: [{ url: input.image, alt: input.name, sortOrder: 0 }],
    sizes: unique(input.variants.map((item) => item.size)),
    colors: unique(input.variants.map((item) => item.color)),
    stock: input.variants.reduce((total, item) => total + item.stock, 0),
  };
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export const formatBRL = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
