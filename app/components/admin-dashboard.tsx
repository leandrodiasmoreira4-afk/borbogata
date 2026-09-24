"use client";

import Link from "next/link";
import Image from "next/image";
import {
  Boxes, Images, LayoutDashboard, LogOut, Menu, PackageOpen, Pencil, Plus, Search,
  Settings, ShoppingBag, Star, TrendingUp, Users, X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { storeConfig } from "../config/store";
import { formatBRL, products as demoProducts } from "../data/products";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { AdminProductEditor, type AdminCategory, type AdminProductRecord } from "./admin-product-editor";
import { BrandLogo } from "./brand-logo";
import { availableStock } from "../../lib/inventory/model";

type Tab = "visao" | "produtos" | "colecoes" | "pedidos";
type AdminProduct = AdminProductRecord;
type AdminOrder = { id:string; number:string; customer:string; value:number; status:string; time:string };
type AdminCollection = { id:string; name:string; slug:string; status:string; isFeatured:boolean; launchedAt:string; coverPath:string|null; productCount:number };

const demoOrders:AdminOrder[] = [
  { id:"demo-1048", number:"#1048", customer:"Cliente demonstrativo", value:208.8, status:"Pago", time:"Demonstração" },
  { id:"demo-1047", number:"#1047", customer:"Cliente demonstrativo", value:359.8, status:"Separando", time:"Demonstração" },
  { id:"demo-1046", number:"#1046", customer:"Cliente demonstrativo", value:139.9, status:"Enviado", time:"Demonstração" },
];

const demoAdminProducts:AdminProduct[] = demoProducts.map((product,index)=>({
  id:`demo-${index}`, name:product.name, slug:product.slug, status:"Demonstração",
  description:product.description,featured:false,categoryId:null,price:product.price,
  stock:product.stock,sku:`DEMO-${index+1}`,
  variants:product.variants.map((variant)=>({id:variant.id,sku:variant.sku,name:variant.name,color:variant.color,size:variant.size,priceCents:Math.round(variant.price*100),compareAtCents:variant.compareAt?Math.round(variant.compareAt*100):null,stock:variant.stock})),
  images:[],
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
  const [membershipRole,setMembershipRole]=useState<string|null>(supabase?null:"owner");
  const [products,setProducts]=useState<AdminProduct[]>(supabase?[]:demoAdminProducts);
  const [categories,setCategories]=useState<AdminCategory[]>([]);
  const [orders,setOrders]=useState<AdminOrder[]>(supabase?[]:demoOrders);
  const [collections,setCollections]=useState<AdminCollection[]>([]);
  const [showProductForm,setShowProductForm]=useState(false);
  const [showCollectionForm,setShowCollectionForm]=useState(false);
  const [operationError,setOperationError]=useState("");

  const loadData=useCallback(async()=>{
    if(!supabase)return;
    setLoading(true);setOperationError("");
    const {data:membership,error:membershipError}=await supabase.from("organization_members").select("organization_id,role,organizations!inner(name,slug)").eq("organizations.slug",storeConfig.organizationSlug).maybeSingle();
    if(membershipError||!membership){setOperationError("Seu usuário ainda não tem acesso administrativo a esta loja.");setLoading(false);return}
    const orgId=membership.organization_id as string;setOrganizationId(orgId);setMembershipRole(membership.role as string);
    const [productsResult,categoriesResult,ordersResult,collectionsResult,collectionProductsResult]=await Promise.all([
      supabase.from("products").select("id,name,slug,description,status,featured,category_id,product_variants(id,sku,name,color,size,price_cents,compare_at_cents,stock_quantity,reserved_quantity,is_active),product_images(id,storage_path,alt_text,sort_order)").eq("organization_id",orgId).order("created_at",{ascending:false}),
      supabase.from("categories").select("id,name").eq("organization_id",orgId).eq("is_active",true).order("sort_order",{ascending:true}),
      supabase.from("orders").select("id,order_number,total_cents,status,created_at,customer_snapshot").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(20),
      supabase.from("collections").select("id,name,slug,status,is_featured,launched_at,cover_storage_path").eq("organization_id",orgId).order("launched_at",{ascending:false}),
      supabase.from("collection_products").select("collection_id").eq("organization_id",orgId),
    ]);
    if(productsResult.error||categoriesResult.error||ordersResult.error||collectionsResult.error||collectionProductsResult.error){setOperationError("Não foi possível carregar os dados do painel.");setLoading(false);return}
    setProducts((productsResult.data||[]).map((row)=>{const variants=((row.product_variants||[]) as Array<{id:string;sku:string;name:string;color:string|null;size:string|null;price_cents:number;compare_at_cents:number|null;stock_quantity:number;reserved_quantity:number;is_active:boolean}>).filter((item)=>item.is_active);const images=((row.product_images||[]) as Array<{id:string;storage_path:string;alt_text:string;sort_order:number}>).sort((first,second)=>first.sort_order-second.sort_order);const first=variants[0];return {id:row.id,name:row.name,slug:row.slug,description:row.description||"",status:row.status,featured:row.featured,categoryId:row.category_id,price:(first?.price_cents||0)/100,stock:variants.reduce((sum,item)=>sum+availableStock(item.stock_quantity,item.reserved_quantity),0),sku:first?.sku||"—",variants:variants.map((item)=>({id:item.id,sku:item.sku,name:item.name,color:item.color||"",size:item.size||"",priceCents:item.price_cents,compareAtCents:item.compare_at_cents,stock:item.stock_quantity})),images:images.map((item)=>({id:item.id,storagePath:item.storage_path,alt:item.alt_text,sortOrder:item.sort_order}))}}));
    setCategories((categoriesResult.data||[]).map((row)=>({id:row.id,name:row.name})));
    setOrders((ordersResult.data||[]).map((row)=>{const customer=row.customer_snapshot as {name?:string}|null;return {id:row.id,number:`#${row.order_number}`,customer:customer?.name||"Cliente",value:Number(row.total_cents)/100,status:row.status,time:new Intl.DateTimeFormat("pt-BR").format(new Date(row.created_at))}}));
    setCollections((collectionsResult.data||[]).map((row)=>({id:row.id,name:row.name,slug:row.slug,status:row.status,isFeatured:row.is_featured,launchedAt:row.launched_at,coverPath:row.cover_storage_path,productCount:(collectionProductsResult.data||[]).filter((item)=>item.collection_id===row.id).length})));
    setLoading(false);
  },[supabase]);

  useEffect(()=>{if(!supabase)return;let active=true;void supabase.auth.getSession().then(({data})=>{if(!active)return;setSignedIn(Boolean(data.session));if(data.session)void loadData();else setLoading(false)});const {data:listener}=supabase.auth.onAuthStateChange((_event,session)=>{setSignedIn(Boolean(session));if(session)void loadData()});return()=>{active=false;listener.subscription.unsubscribe()}},[supabase,loadData]);

  async function signIn(event:FormEvent){event.preventDefault();if(!supabase)return;setLoading(true);setAuthError("");const {error}=await supabase.auth.signInWithPassword({email,password});if(error){setAuthError("E-mail ou senha inválidos.");setLoading(false)}}
  async function signOut(){if(supabase)await supabase.auth.signOut();setSignedIn(false);setOrganizationId(null);setMembershipRole(null);setProducts([]);setCategories([]);setOrders([]);setCollections([])}
  const choose=(value:Tab)=>{setTab(value);setSidebar(false)};

  if(!signedIn)return <AdminLogin email={email} password={password} loading={loading} error={authError} setEmail={setEmail} setPassword={setPassword} onSubmit={signIn}/>;

  const canManageCatalog=["owner","admin","catalog"].includes(membershipRole||"");
  const nav=<><button className={tab==="visao"?"active":""} onClick={()=>choose("visao")}><LayoutDashboard/>Visão geral</button><button className={tab==="pedidos"?"active":""} onClick={()=>choose("pedidos")}><ShoppingBag/>Pedidos<span>{orders.length}</span></button><button className={tab==="produtos"?"active":""} onClick={()=>choose("produtos")} disabled={!canManageCatalog}><Boxes/>Produtos</button><button className={tab==="colecoes"?"active":""} onClick={()=>choose("colecoes")} disabled={!canManageCatalog}><Images/>Coleções</button><button disabled><Users/>Clientes</button><button disabled><Settings/>Configurações</button></>;
  return <div className="admin-shell"><aside className={sidebar?"admin-sidebar open":"admin-sidebar"}><div className="admin-logo"><BrandLogo variant="lime" className="admin-brand-logo"/><button className="mobile-only" onClick={()=>setSidebar(false)} aria-label="Fechar menu"><X/></button></div><nav>{nav}</nav><div className="admin-store"><small>{storeConfig.demoMode?"Ambiente demonstrativo":"Loja conectada"}</small><strong>{storeConfig.domain}</strong><Link href="/">Ver loja</Link></div><div className="l7-signature"><span>L7</span><small>Commerce</small></div><button className="admin-logout" onClick={signOut}><LogOut/>Sair</button></aside><main className="admin-main"><header className="admin-top"><button className="mobile-only" onClick={()=>setSidebar(true)} aria-label="Abrir menu"><Menu/></button><div className="admin-search"><Search/><input placeholder="Buscar pedidos, produtos..." aria-label="Buscar no painel"/></div><div className="admin-user"><span>L7</span><div><strong>Administração</strong><small>{storeConfig.demoMode?"Dados ilustrativos":"Dados reais"}</small></div></div></header><div className="admin-content">{storeConfig.demoMode&&<div className="admin-demo-notice">Modo demonstração: conecte o Supabase para operar produtos, estoque e pedidos reais.</div>}{operationError&&<div className="admin-error">{operationError}</div>}{loading?<div className="admin-loading">Carregando painel…</div>:<>{tab==="visao"&&<Overview products={products} orders={orders} setTab={setTab} canManageCatalog={canManageCatalog}/>} {tab==="produtos"&&canManageCatalog&&<ProductsPanel products={products} categories={categories} organizationId={organizationId} showForm={showProductForm} setShowForm={setShowProductForm} reload={loadData}/>} {tab==="colecoes"&&canManageCatalog&&<CollectionsPanel collections={collections} products={products} organizationId={organizationId} showForm={showCollectionForm} setShowForm={setShowCollectionForm} reload={loadData}/>} {tab==="pedidos"&&<OrdersPanel orders={orders}/>}</>}</div></main></div>;
}

function AdminLogin({email,password,loading,error,setEmail,setPassword,onSubmit}:{email:string;password:string;loading:boolean;error:string;setEmail:(value:string)=>void;setPassword:(value:string)=>void;onSubmit:(event:FormEvent)=>void}){return <main className="admin-login-page"><form className="admin-login-card" onSubmit={onSubmit}><div className="admin-login-brand"><BrandLogo className="admin-login-logo"/><small>Administração L7</small></div><h1>Acessar painel</h1><label htmlFor="admin-email">E-mail</label><input id="admin-email" type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} required/><label htmlFor="admin-password">Senha</label><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required/>{error&&<p className="form-error">{error}</p>}<button className="admin-primary" disabled={loading}>{loading?"Entrando…":"Entrar"}</button><Link href="/">Voltar para a loja</Link></form></main>}

function Overview({products,orders,setTab,canManageCatalog}:{products:AdminProduct[];orders:AdminOrder[];setTab:(tab:Tab)=>void;canManageCatalog:boolean}){const revenue=orders.reduce((sum,order)=>sum+order.value,0);const lowStock=products.filter(product=>product.stock<=3).length;const ticket=orders.length?revenue/orders.length:0;return <><div className="admin-heading"><div><p>Operação da loja</p><h1>Visão geral</h1></div>{canManageCatalog&&<button className="admin-primary" onClick={()=>setTab("produtos")}><Plus/>Novo produto</button>}</div><section className="metric-grid"><Metric label="Vendas exibidas" value={formatBRL(revenue)} note="Conforme período carregado" icon={<TrendingUp/>}/><Metric label="Pedidos" value={String(orders.length)} note="Pedidos mais recentes" icon={<ShoppingBag/>}/><Metric label="Ticket médio" value={formatBRL(ticket)} note="Com base nos pedidos exibidos" icon={<Users/>}/><Metric label="Estoque baixo" value={String(lowStock)} note="Até 3 unidades" icon={<PackageOpen/>}/></section><OrdersTable orders={orders}/></>}
function Metric({label,value,note,icon}:{label:string;value:string;note:string;icon:React.ReactNode}){return <article className="metric-card"><div className="metric-icon">{icon}</div><p>{label}</p><h2>{value}</h2><small>{note}</small></article>}
function OrdersTable({orders}:{orders:AdminOrder[]}){return <section className="admin-card table-card"><div className="card-title"><h2>Pedidos recentes</h2><span>{orders.length} registros</span></div><div className="table-scroll"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Valor</th><th>Status</th><th>Data</th></tr></thead><tbody>{orders.length?orders.map(order=><tr key={order.id}><td><strong>{order.number}</strong></td><td>{order.customer}</td><td>{formatBRL(order.value)}</td><td><span className={`status ${statusClass(order.status)}`}>{translateStatus(order.status)}</span></td><td>{order.time}</td></tr>):<tr><td colSpan={5}>Nenhum pedido encontrado.</td></tr>}</tbody></table></div></section>}

function ProductsPanel({products,categories,organizationId,showForm,setShowForm,reload}:{products:AdminProduct[];categories:AdminCategory[];organizationId:string|null;showForm:boolean;setShowForm:(value:boolean)=>void;reload:()=>Promise<void>}){
  const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
  const [editingProduct,setEditingProduct]=useState<AdminProduct|null>(null);
  const [updating,setUpdating]=useState<string|null>(null);
  const [error,setError]=useState("");

  function openNew(){setEditingProduct(null);setShowForm(true)}
  function openEdit(product:AdminProduct){setEditingProduct(product);setShowForm(true)}
  function closeEditor(){setEditingProduct(null);setShowForm(false)}

  async function toggleStatus(product:AdminProduct){
    if(!supabase||!organizationId)return;
    setUpdating(product.id);setError("");
    const nextStatus=product.status==="active"?"draft":"active";
    const {error:updateError}=await supabase.rpc("set_product_status",{target_organization_id:organizationId,target_product_id:product.id,next_status:nextStatus});
    if(updateError)setError(nextStatus==="active"?"Para publicar, cadastre ao menos uma variação e uma imagem.":"Não foi possível alterar a publicação do produto.");
    else await reload();
    setUpdating(null);
  }

  return <>
    <div className="admin-heading"><div><p>Catálogo e estoque</p><h1>Produtos</h1></div><button className="admin-primary" onClick={showForm?closeEditor:openNew} disabled={!organizationId}><Plus/>{showForm?"Fechar":"Novo produto"}</button></div>
    {showForm&&organizationId&&<AdminProductEditor key={editingProduct?.id||"new"} organizationId={organizationId} product={editingProduct} categories={categories} onCancel={closeEditor} onSaved={async()=>{closeEditor();await reload()}}/>}
    {error&&<div className="admin-error">{error}</div>}
    <section className="admin-card table-card"><div className="card-title"><h2>{products.length} produtos cadastrados</h2></div><div className="table-scroll"><table><thead><tr><th>Produto</th><th>SKU</th><th>Preço</th><th>Estoque</th><th>Fotos</th><th>Status</th><th>Ações</th></tr></thead><tbody>{products.length?products.map(product=><tr key={product.id}><td><strong>{product.name}</strong><small className="table-subtitle">/{product.slug}</small></td><td>{product.variants.length>1?`${product.variants.length} variações`:product.sku}</td><td>{formatBRL(product.price)}</td><td>{product.stock} un.</td><td>{product.images.length}</td><td><span className={`status ${product.status==="active"?"pago":"separando"}`}>{translateStatus(product.status)}</span></td><td><div className="table-actions"><button className="table-action" disabled={!organizationId||updating===product.id} onClick={()=>openEdit(product)}><Pencil/>Editar</button><button className="table-action subtle" disabled={!organizationId||updating===product.id} onClick={()=>void toggleStatus(product)}>{updating===product.id?"Salvando…":product.status==="active"?"Despublicar":"Publicar"}</button></div></td></tr>):<tr><td colSpan={7}>Nenhum produto cadastrado.</td></tr>}</tbody></table></div></section>
  </>;
}

function CollectionsPanel({collections,products,organizationId,showForm,setShowForm,reload}:{collections:AdminCollection[];products:AdminProduct[];organizationId:string|null;showForm:boolean;setShowForm:(value:boolean)=>void;reload:()=>Promise<void>}){
  const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
  const [updating,setUpdating]=useState<string|null>(null);
  const [error,setError]=useState("");
  async function featureCollection(collectionId:string){if(!supabase||!organizationId)return;setUpdating(collectionId);setError("");const {error:rpcError}=await supabase.rpc("set_featured_collection",{target_organization_id:organizationId,target_collection_id:collectionId});if(rpcError)setError("Não foi possível definir a coleção principal.");else await reload();setUpdating(null)}
  async function toggleArchive(collection:AdminCollection){if(!supabase||!organizationId)return;setUpdating(collection.id);setError("");const nextStatus=collection.status==="archived"?"active":"archived";const {error:rpcError}=await supabase.rpc("set_collection_status",{target_organization_id:organizationId,target_collection_id:collection.id,next_status:nextStatus});if(rpcError)setError("Não foi possível alterar o status da coleção.");else await reload();setUpdating(null)}
  return <><div className="admin-heading"><div><p>Vitrine e lançamentos</p><h1>Coleções</h1></div><button className="admin-primary" onClick={()=>setShowForm(!showForm)} disabled={!organizationId}><Plus/>{showForm?"Fechar":"Nova coleção"}</button></div>
    <div className="collection-admin-tip"><Star/>A coleção principal ocupa o hero da página inicial. As demais ficam no histórico, da mais nova para a mais antiga.</div>
    {showForm&&organizationId&&<NewCollectionForm organizationId={organizationId} products={products.filter((product)=>product.status==="active")} onCreated={async()=>{setShowForm(false);await reload()}}/>}
    {error&&<div className="admin-error">{error}</div>}
    <section className="admin-collection-grid">{collections.length?collections.map((collection)=><article className="admin-card admin-collection-card" key={collection.id}>
      <div className="admin-collection-cover">{collection.coverPath?<Image src={supabase?.storage.from("collection-covers").getPublicUrl(collection.coverPath).data.publicUrl||""} alt={`Capa da coleção ${collection.name}`} fill unoptimized sizes="(max-width: 680px) 100vw, 33vw"/>:<Images/>}{collection.isFeatured&&<span><Star/>Principal</span>}</div>
      <div className="admin-collection-body"><small>{formatAdminDate(collection.launchedAt)}</small><h2>{collection.name}</h2><p>{collection.productCount} {collection.productCount===1?"produto":"produtos"} · {translateStatus(collection.status)}</p><div>{!collection.isFeatured&&collection.status!=="archived"&&<button className="table-action" disabled={updating===collection.id} onClick={()=>void featureCollection(collection.id)}>Tornar principal</button>}<button className="table-action subtle" disabled={updating===collection.id} onClick={()=>void toggleArchive(collection)}>{collection.status==="archived"?"Reativar":"Arquivar"}</button></div></div>
    </article>):<div className="admin-card collection-empty"><Images/><h2>Nenhuma coleção criada</h2><p>Crie a primeira coleção, escolha a capa e selecione as peças que farão parte dela.</p></div>}</section>
  </>;
}

function NewCollectionForm({organizationId,products,onCreated}:{organizationId:string;products:AdminProduct[];onCreated:()=>Promise<void>}){
  const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
  const [name,setName]=useState("");const [slug,setSlug]=useState("");const [description,setDescription]=useState("");const [launchedAt,setLaunchedAt]=useState(new Date().toISOString().slice(0,10));const [selected,setSelected]=useState<string[]>([]);const [cover,setCover]=useState<File|null>(null);const [featured,setFeatured]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState("");
  function toggleProduct(id:string){setSelected((current)=>current.includes(id)?current.filter((item)=>item!==id):[...current,id])}
  async function submit(event:FormEvent){event.preventDefault();if(!supabase||!cover)return;setError("");if(!["image/jpeg","image/png","image/webp"].includes(cover.type)||cover.size>8*1024*1024){setError("Use uma imagem JPG, PNG ou WebP de até 8 MB.");return}if(!selected.length){setError("Selecione pelo menos um produto publicado.");return}setSaving(true);const extension=cover.name.split(".").pop()?.toLowerCase()||"jpg";const coverPath=`${organizationId}/collections/${crypto.randomUUID()}.${extension}`;const {error:uploadError}=await supabase.storage.from("collection-covers").upload(coverPath,cover,{contentType:cover.type,cacheControl:"31536000",upsert:false});if(uploadError){setError("Não foi possível enviar a imagem de capa.");setSaving(false);return}const {error:rpcError}=await supabase.rpc("create_collection_with_products",{target_organization_id:organizationId,collection_slug:slug,collection_name:name,collection_description:description,collection_cover_storage_path:coverPath,collection_launched_at:launchedAt,product_ids:selected,make_featured:featured});if(rpcError){await supabase.storage.from("collection-covers").remove([coverPath]);setError("Não foi possível criar a coleção. Confira o nome e tente novamente.");setSaving(false);return}await onCreated();setSaving(false)}
  return <form className="admin-card collection-form" onSubmit={submit}><div className="collection-form-grid"><div><label htmlFor="collection-name">Nome da coleção</label><input id="collection-name" placeholder="Ex.: Coleção Março" value={name} onChange={(event)=>{setName(event.target.value);setSlug(slugify(event.target.value))}} required/></div><div><label htmlFor="collection-date">Data de lançamento</label><input id="collection-date" type="date" value={launchedAt} onChange={(event)=>setLaunchedAt(event.target.value)} required/></div><div className="wide"><label htmlFor="collection-description">Texto do hero</label><textarea id="collection-description" placeholder="Uma frase curta sobre a nova coleção." value={description} onChange={(event)=>setDescription(event.target.value)} rows={3}/></div><div className="wide"><label htmlFor="collection-cover">Imagem principal</label><input id="collection-cover" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>setCover(event.target.files?.[0]||null)} required/><small>JPG, PNG ou WebP · até 8 MB · prefira imagem vertical ou paisagem ampla.</small></div></div>
    <fieldset className="collection-product-picker"><legend>Produtos da coleção</legend>{products.length?products.map((product)=><label key={product.id}><input type="checkbox" checked={selected.includes(product.id)} onChange={()=>toggleProduct(product.id)}/><span><strong>{product.name}</strong><small>{product.sku} · {formatBRL(product.price)}</small></span></label>):<p>Publique pelo menos um produto antes de criar a coleção.</p>}</fieldset>
    <label className="featured-check"><input type="checkbox" checked={featured} onChange={(event)=>setFeatured(event.target.checked)}/><span><strong>Usar como coleção principal</strong><small>Ela aparecerá no hero e abrirá a página inicial.</small></span></label>
    {error&&<p className="form-error">{error}</p>}<button className="admin-primary" disabled={saving||!products.length}>{saving?"Criando coleção…":"Publicar coleção"}</button>
  </form>;
}

function OrdersPanel({orders}:{orders:AdminOrder[]}){return <><div className="admin-heading"><div><p>Acompanhe as vendas da loja</p><h1>Pedidos</h1></div></div><OrdersTable orders={orders}/></>}
function formatAdminDate(value:string){return new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${value}T00:00:00Z`))}
function slugify(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}
function translateStatus(status:string){return ({active:"Ativo",draft:"Rascunho",archived:"Arquivado",pending:"Pendente",confirmed:"Confirmado",processing:"Separando",shipped:"Enviado",delivered:"Entregue",cancelled:"Cancelado"} as Record<string,string>)[status]||status}
function statusClass(status:string){if(["paid","confirmed","delivered","Pago"].includes(status))return "pago";if(["shipped","Enviado"].includes(status))return "enviado";return "separando"}
