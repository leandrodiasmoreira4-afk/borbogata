"use client";

import Link from "next/link";
import {
  Boxes, LayoutDashboard, LogOut, Menu, PackageOpen, Plus, Search,
  Settings, ShoppingBag, TrendingUp, Users, X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { storeConfig } from "../config/store";
import { formatBRL, products as demoProducts } from "../data/products";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

type Tab = "visao" | "produtos" | "pedidos";
type AdminProduct = { id:string; name:string; slug:string; status:string; price:number; stock:number; sku:string };
type AdminOrder = { id:string; number:string; customer:string; value:number; status:string; time:string };

const demoOrders:AdminOrder[] = [
  { id:"demo-1048", number:"#1048", customer:"Cliente demonstrativo", value:208.8, status:"Pago", time:"Demonstração" },
  { id:"demo-1047", number:"#1047", customer:"Cliente demonstrativo", value:359.8, status:"Separando", time:"Demonstração" },
  { id:"demo-1046", number:"#1046", customer:"Cliente demonstrativo", value:139.9, status:"Enviado", time:"Demonstração" },
];

const demoAdminProducts:AdminProduct[] = demoProducts.map((product,index)=>({
  id:`demo-${index}`, name:product.name, slug:product.slug, status:"Demonstração",
  price:product.price, stock:product.stock, sku:`DEMO-${index+1}`,
}));

export function AdminDashboard(){
  const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
  const [sidebar,setSidebar]=useState(false);
  const [tab,setTab]=useState<Tab>("visao");
  const [loading,setLoading]=useState(Boolean(supabase));
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [authError,setAuthError]=useState("");
  const [signedIn,setSignedIn]=useState(!supabase);
  const [organizationId,setOrganizationId]=useState<string|null>(null);
  const [products,setProducts]=useState<AdminProduct[]>(supabase?[]:demoAdminProducts);
  const [orders,setOrders]=useState<AdminOrder[]>(supabase?[]:demoOrders);
  const [showProductForm,setShowProductForm]=useState(false);
  const [operationError,setOperationError]=useState("");

  const loadData=useCallback(async()=>{
    if(!supabase)return;
    setLoading(true);setOperationError("");
    const {data:membership,error:membershipError}=await supabase.from("organization_members").select("organization_id,role,organizations!inner(name,slug)").eq("organizations.slug",storeConfig.organizationSlug).maybeSingle();
    if(membershipError||!membership){setOperationError("Seu usuário ainda não tem acesso administrativo a esta loja.");setLoading(false);return}
    const orgId=membership.organization_id as string;setOrganizationId(orgId);
    const [productsResult,ordersResult]=await Promise.all([
      supabase.from("products").select("id,name,slug,status,product_variants(id,sku,price_cents,stock_quantity)").eq("organization_id",orgId).order("created_at",{ascending:false}),
      supabase.from("orders").select("id,order_number,total_cents,status,created_at,customer_snapshot").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(20),
    ]);
    if(productsResult.error||ordersResult.error){setOperationError("Não foi possível carregar os dados do painel.");setLoading(false);return}
    setProducts((productsResult.data||[]).map((row)=>{const variants=(row.product_variants||[]) as Array<{sku:string;price_cents:number;stock_quantity:number}>;const first=variants[0];return {id:row.id,name:row.name,slug:row.slug,status:row.status,price:(first?.price_cents||0)/100,stock:variants.reduce((sum,item)=>sum+item.stock_quantity,0),sku:first?.sku||"—"}}));
    setOrders((ordersResult.data||[]).map((row)=>{const customer=row.customer_snapshot as {name?:string}|null;return {id:row.id,number:`#${row.order_number}`,customer:customer?.name||"Cliente",value:Number(row.total_cents)/100,status:row.status,time:new Intl.DateTimeFormat("pt-BR").format(new Date(row.created_at))}}));
    setLoading(false);
  },[supabase]);

  useEffect(()=>{if(!supabase)return;let active=true;void supabase.auth.getSession().then(({data})=>{if(!active)return;setSignedIn(Boolean(data.session));if(data.session)void loadData();else setLoading(false)});const {data:listener}=supabase.auth.onAuthStateChange((_event,session)=>{setSignedIn(Boolean(session));if(session)void loadData()});return()=>{active=false;listener.subscription.unsubscribe()}},[supabase,loadData]);

  async function signIn(event:FormEvent){event.preventDefault();if(!supabase)return;setLoading(true);setAuthError("");const {error}=await supabase.auth.signInWithPassword({email,password});if(error){setAuthError("E-mail ou senha inválidos.");setLoading(false)}}
  async function signOut(){if(supabase)await supabase.auth.signOut();setSignedIn(false);setOrganizationId(null);setProducts([]);setOrders([])}
  const choose=(value:Tab)=>{setTab(value);setSidebar(false)};

  if(!signedIn)return <AdminLogin email={email} password={password} loading={loading} error={authError} setEmail={setEmail} setPassword={setPassword} onSubmit={signIn}/>;

  const nav=<><button className={tab==="visao"?"active":""} onClick={()=>choose("visao")}><LayoutDashboard/>Visão geral</button><button className={tab==="pedidos"?"active":""} onClick={()=>choose("pedidos")}><ShoppingBag/>Pedidos<span>{orders.length}</span></button><button className={tab==="produtos"?"active":""} onClick={()=>choose("produtos")}><Boxes/>Produtos</button><button disabled><Users/>Clientes</button><button disabled><Settings/>Configurações</button></>;
  return <div className="admin-shell"><aside className={sidebar?"admin-sidebar open":"admin-sidebar"}><div className="admin-logo"><span>{storeConfig.logoLetter}</span><strong>{storeConfig.name.toUpperCase()}</strong><button className="mobile-only" onClick={()=>setSidebar(false)} aria-label="Fechar menu"><X/></button></div><nav>{nav}</nav><div className="admin-store"><small>{storeConfig.demoMode?"Ambiente demonstrativo":"Loja conectada"}</small><strong>{storeConfig.domain}</strong><Link href="/">Ver loja</Link></div><div className="l7-signature"><span>L7</span><small>Commerce</small></div><button className="admin-logout" onClick={signOut}><LogOut/>Sair</button></aside><main className="admin-main"><header className="admin-top"><button className="mobile-only" onClick={()=>setSidebar(true)} aria-label="Abrir menu"><Menu/></button><div className="admin-search"><Search/><input placeholder="Buscar pedidos, produtos..." aria-label="Buscar no painel"/></div><div className="admin-user"><span>L7</span><div><strong>Administração</strong><small>{storeConfig.demoMode?"Dados ilustrativos":"Dados reais"}</small></div></div></header><div className="admin-content">{storeConfig.demoMode&&<div className="admin-demo-notice">Modo demonstração: conecte o Supabase para operar produtos, estoque e pedidos reais.</div>}{operationError&&<div className="admin-error">{operationError}</div>}{loading?<div className="admin-loading">Carregando painel…</div>:<>{tab==="visao"&&<Overview products={products} orders={orders} setTab={setTab}/>} {tab==="produtos"&&<ProductsPanel products={products} organizationId={organizationId} showForm={showProductForm} setShowForm={setShowProductForm} reload={loadData}/>} {tab==="pedidos"&&<OrdersPanel orders={orders}/>}</>}</div></main></div>;
}

function AdminLogin({email,password,loading,error,setEmail,setPassword,onSubmit}:{email:string;password:string;loading:boolean;error:string;setEmail:(value:string)=>void;setPassword:(value:string)=>void;onSubmit:(event:FormEvent)=>void}){return <main className="admin-login-page"><form className="admin-login-card" onSubmit={onSubmit}><div className="admin-login-brand"><span>B</span><div><strong>BORBOGATA</strong><small>Administração L7</small></div></div><h1>Acessar painel</h1><label htmlFor="admin-email">E-mail</label><input id="admin-email" type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} required/><label htmlFor="admin-password">Senha</label><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required/>{error&&<p className="form-error">{error}</p>}<button className="admin-primary" disabled={loading}>{loading?"Entrando…":"Entrar"}</button><Link href="/">Voltar para a loja</Link></form></main>}

function Overview({products,orders,setTab}:{products:AdminProduct[];orders:AdminOrder[];setTab:(tab:Tab)=>void}){const revenue=orders.reduce((sum,order)=>sum+order.value,0);const lowStock=products.filter(product=>product.stock<=3).length;const ticket=orders.length?revenue/orders.length:0;return <><div className="admin-heading"><div><p>Operação da loja</p><h1>Visão geral</h1></div><button className="admin-primary" onClick={()=>setTab("produtos")}><Plus/>Novo produto</button></div><section className="metric-grid"><Metric label="Vendas exibidas" value={formatBRL(revenue)} note="Conforme período carregado" icon={<TrendingUp/>}/><Metric label="Pedidos" value={String(orders.length)} note="Pedidos mais recentes" icon={<ShoppingBag/>}/><Metric label="Ticket médio" value={formatBRL(ticket)} note="Com base nos pedidos exibidos" icon={<Users/>}/><Metric label="Estoque baixo" value={String(lowStock)} note="Até 3 unidades" icon={<PackageOpen/>}/></section><OrdersTable orders={orders}/></>}
function Metric({label,value,note,icon}:{label:string;value:string;note:string;icon:React.ReactNode}){return <article className="metric-card"><div className="metric-icon">{icon}</div><p>{label}</p><h2>{value}</h2><small>{note}</small></article>}
function OrdersTable({orders}:{orders:AdminOrder[]}){return <section className="admin-card table-card"><div className="card-title"><h2>Pedidos recentes</h2><span>{orders.length} registros</span></div><div className="table-scroll"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Valor</th><th>Status</th><th>Data</th></tr></thead><tbody>{orders.length?orders.map(order=><tr key={order.id}><td><strong>{order.number}</strong></td><td>{order.customer}</td><td>{formatBRL(order.value)}</td><td><span className={`status ${statusClass(order.status)}`}>{translateStatus(order.status)}</span></td><td>{order.time}</td></tr>):<tr><td colSpan={5}>Nenhum pedido encontrado.</td></tr>}</tbody></table></div></section>}

function ProductsPanel({products,organizationId,showForm,setShowForm,reload}:{products:AdminProduct[];organizationId:string|null;showForm:boolean;setShowForm:(value:boolean)=>void;reload:()=>Promise<void>}){const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);const [updating,setUpdating]=useState<string|null>(null);const [error,setError]=useState("");async function toggleStatus(product:AdminProduct){if(!supabase||!organizationId)return;setUpdating(product.id);setError("");const nextStatus=product.status==="active"?"draft":"active";const {error:updateError}=await supabase.from("products").update({status:nextStatus}).eq("id",product.id).eq("organization_id",organizationId);if(updateError)setError("Não foi possível alterar a publicação do produto.");else await reload();setUpdating(null)}return <><div className="admin-heading"><div><p>Catálogo e estoque</p><h1>Produtos</h1></div><button className="admin-primary" onClick={()=>setShowForm(!showForm)} disabled={!organizationId}><Plus/>{showForm?"Fechar":"Novo produto"}</button></div>{showForm&&organizationId&&<NewProductForm organizationId={organizationId} onCreated={async()=>{setShowForm(false);await reload()}}/>}{error&&<div className="admin-error">{error}</div>}<section className="admin-card table-card"><div className="card-title"><h2>{products.length} produtos cadastrados</h2></div><div className="table-scroll"><table><thead><tr><th>Produto</th><th>SKU</th><th>Preço</th><th>Estoque</th><th>Status</th><th>Ação</th></tr></thead><tbody>{products.length?products.map(product=><tr key={product.id}><td><strong>{product.name}</strong><small className="table-subtitle">/{product.slug}</small></td><td>{product.sku}</td><td>{formatBRL(product.price)}</td><td>{product.stock} un.</td><td><span className={`status ${product.status==="active"?"pago":"separando"}`}>{translateStatus(product.status)}</span></td><td><button className="table-action" disabled={!organizationId||updating===product.id} onClick={()=>void toggleStatus(product)}>{updating===product.id?"Salvando…":product.status==="active"?"Despublicar":"Publicar"}</button></td></tr>):<tr><td colSpan={6}>Nenhum produto cadastrado.</td></tr>}</tbody></table></div></section></>}

function NewProductForm({organizationId,onCreated}:{organizationId:string;onCreated:()=>Promise<void>}){const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);const [name,setName]=useState("");const [slug,setSlug]=useState("");const [sku,setSku]=useState("");const [price,setPrice]=useState("");const [stock,setStock]=useState("0");const [saving,setSaving]=useState(false);const [error,setError]=useState("");async function submit(event:FormEvent){event.preventDefault();if(!supabase)return;setSaving(true);setError("");const priceCents=Math.round(Number(price.replace(",","."))*100);const {error:rpcError}=await supabase.rpc("create_product_with_variant",{target_organization_id:organizationId,target_category_id:null,product_slug:slug,product_name:name,product_description:null,variant_sku:sku,variant_name:"Padrão",variant_color:null,variant_size:null,variant_price_cents:priceCents,initial_stock:Number(stock)});if(rpcError){setError("Não foi possível cadastrar. Confira o slug, SKU, preço e permissões.");setSaving(false);return}await onCreated();setSaving(false)}return <form className="admin-card product-form" onSubmit={submit}><div><label htmlFor="product-name">Nome</label><input id="product-name" value={name} onChange={event=>{setName(event.target.value);setSlug(slugify(event.target.value))}} required/></div><div><label htmlFor="product-slug">Slug</label><input id="product-slug" value={slug} onChange={event=>setSlug(slugify(event.target.value))} required/></div><div><label htmlFor="product-sku">SKU</label><input id="product-sku" value={sku} onChange={event=>setSku(event.target.value.toUpperCase())} required/></div><div><label htmlFor="product-price">Preço</label><input id="product-price" inputMode="decimal" placeholder="189,90" value={price} onChange={event=>setPrice(event.target.value)} required/></div><div><label htmlFor="product-stock">Estoque inicial</label><input id="product-stock" type="number" min="0" value={stock} onChange={event=>setStock(event.target.value)} required/></div>{error&&<p className="form-error">{error}</p>}<button className="admin-primary" disabled={saving}>{saving?"Salvando…":"Salvar rascunho"}</button></form>}
function OrdersPanel({orders}:{orders:AdminOrder[]}){return <><div className="admin-heading"><div><p>Acompanhe as vendas da loja</p><h1>Pedidos</h1></div></div><OrdersTable orders={orders}/></>}
function slugify(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}
function translateStatus(status:string){return ({active:"Ativo",draft:"Rascunho",archived:"Arquivado",pending:"Pendente",confirmed:"Confirmado",processing:"Separando",shipped:"Enviado",delivered:"Entregue",cancelled:"Cancelado"} as Record<string,string>)[status]||status}
function statusClass(status:string){if(["paid","confirmed","delivered","Pago"].includes(status))return "pago";if(["shipped","Enviado"].includes(status))return "enviado";return "separando"}
