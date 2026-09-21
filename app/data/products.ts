export type Product = {
  slug: string;
  name: string;
  category: string;
  price: number;
  compareAt?: number;
  image: string;
  description: string;
  sizes: string[];
  colors: string[];
  stock: number;
  badge?: string;
};

export const products: Product[] = [
  { slug:"vestido-luna-creme", name:"Vestido Luna", category:"Vestidos", price:189.9, compareAt:229.9, image:"/products/vestido-luna.png", description:"Vestido midi com caimento leve, cintura marcada e acabamento delicado. Uma peça elegante para ocasiões especiais ou produções sofisticadas no dia a dia.", sizes:["P","M","G"], colors:["Creme","Vinho"], stock:8, badge:"Novo" },
  { slug:"macacao-noir", name:"Macacão Noir", category:"Macacões", price:219.9, image:"/products/macacao-noir.png", description:"Macacão preto de modelagem alongada, decote elegante e tecido encorpado. Conforto e presença em uma única peça.", sizes:["P","M","G","GG"], colors:["Preto"], stock:5, badge:"Mais vendido" },
  { slug:"bolsa-aurora-vinho", name:"Bolsa Aurora", category:"Acessórios", price:139.9, image:"/products/bolsa-aurora.png", description:"Bolsa estruturada em tom vinho com ferragens douradas e alça ajustável. Compacta por fora e prática por dentro.", sizes:["Único"], colors:["Vinho"], stock:12 },
];

export const formatBRL = (value: number) => new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(value);
