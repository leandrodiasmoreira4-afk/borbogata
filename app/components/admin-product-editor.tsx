"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { centsToInput, parseAdminProductDraft } from "../../lib/catalog/admin-product";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

export type AdminProductVariant = {
  id: string;
  sku: string;
  name: string;
  color: string;
  size: string;
  priceCents: number;
  compareAtCents: number | null;
  stock: number;
};

export type AdminProductImage = {
  id: string;
  storagePath: string;
  alt: string;
  sortOrder: number;
};

export type AdminProductRecord = {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  featured: boolean;
  categoryId: string | null;
  price: number;
  stock: number;
  sku: string;
  variants: AdminProductVariant[];
  images: AdminProductImage[];
};

export type AdminCategory = { id: string; name: string };

type VariantForm = {
  key: string;
  id?: string;
  sku: string;
  name: string;
  color: string;
  size: string;
  price: string;
  compareAt: string;
  stock: string;
};

type ImageFormItem =
  | { key: string; kind: "existing"; storagePath: string; alt: string }
  | { key: string; kind: "new"; file: File };

const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
let variantKeySequence = 0;

export function AdminProductEditor({organizationId,product,categories,onSaved,onCancel}:{organizationId:string;product:AdminProductRecord|null;categories:AdminCategory[];onSaved:()=>Promise<void>;onCancel:()=>void}){
  const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
  const [name,setName]=useState(product?.name||"");
  const [slug,setSlug]=useState(product?.slug||"");
  const [description,setDescription]=useState(product?.description||"");
  const [categoryId,setCategoryId]=useState(product?.categoryId||"");
  const [featured,setFeatured]=useState(product?.featured||false);
  const [status,setStatus]=useState<"draft"|"active"|"archived">((product?.status as "draft"|"active"|"archived")||"draft");
  const [variants,setVariants]=useState<VariantForm[]>(product?.variants.length?product.variants.map(toVariantForm):[emptyVariant()]);
  const [imageItems,setImageItems]=useState<ImageFormItem[]>(()=>(product?.images||[]).map((image)=>({key:image.id,kind:"existing",storagePath:image.storagePath,alt:image.alt})));
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");

  function updateVariant(key:string,field:keyof Omit<VariantForm,"key"|"id">,value:string){
    setVariants((current)=>current.map((variant)=>variant.key===key?{...variant,[field]:value}:variant));
  }

  function removeVariant(key:string){
    setVariants((current)=>current.length===1?current:current.filter((variant)=>variant.key!==key));
  }

  function selectFiles(selected:FileList|null){
    if(!selected)return;
    setError("");
    const next=[...selected];
    if(imageItems.length+next.length>8){setError("Use no máximo 8 imagens por produto.");return}
    const invalid=next.find((file)=>!acceptedImageTypes.has(file.type)||file.size>8*1024*1024);
    if(invalid){setError("Cada imagem deve ser JPG, PNG ou WebP e ter até 8 MB.");return}
    setImageItems((current)=>[...current,...next.map((file)=>({key:crypto.randomUUID(),kind:"new" as const,file}))]);
  }

  function moveImage(index:number,direction:-1|1){
    const target=index+direction;
    if(target<0||target>=imageItems.length)return;
    setImageItems((current)=>{const next=[...current];[next[index],next[target]]=[next[target],next[index]];return next});
  }

  async function submit(event:FormEvent){
    event.preventDefault();
    if(!supabase)return;
    setError("");
    const parsed=parseAdminProductDraft({name,slug,description,categoryId:categoryId||null,featured,status,variants});
    if(!parsed.success){setError(parsed.error.issues[0]?.message||"Revise os dados do produto.");return}
    if(status==="active"&&!imageItems.length){setError("Adicione ao menos uma imagem antes de publicar.");return}

    setSaving(true);
    const uploadedPaths:string[]=[];
    let databaseSaved=false;
    try{
      const pathsByKey=new Map<string,string>();
      for(const item of imageItems){
        if(item.kind==="existing"){pathsByKey.set(item.key,item.storagePath);continue}
        const file=item.file;
        const extension=file.name.split(".").pop()?.toLowerCase()||"jpg";
        const storagePath=`${organizationId}/products/${crypto.randomUUID()}.${extension}`;
        const {error:uploadError}=await supabase.storage.from("product-images").upload(storagePath,file,{contentType:file.type,cacheControl:"31536000",upsert:false});
        if(uploadError)throw new Error("upload");
        uploadedPaths.push(storagePath);
        pathsByKey.set(item.key,storagePath);
      }

      const imagePayload=imageItems.map((item,index)=>({storagePath:pathsByKey.get(item.key)||"",alt:item.kind==="existing"?item.alt||name:name,sortOrder:index}));
      const {error:saveError}=await supabase.rpc("save_product_catalog",{
        target_organization_id:organizationId,
        target_product_id:product?.id||null,
        product_category_id:parsed.data.categoryId,
        product_slug:parsed.data.slug,
        product_name:parsed.data.name,
        product_description:parsed.data.description,
        product_featured:parsed.data.featured,
        next_status:parsed.data.status,
        variant_payload:parsed.data.variants,
        image_payload:imagePayload,
      });
      if(saveError)throw new Error("save");
      databaseSaved=true;

      const keptPaths=new Set(imageItems.flatMap((image)=>image.kind==="existing"?[image.storagePath]:[]));
      const removedPaths=(product?.images||[]).map((image)=>image.storagePath).filter((path)=>!keptPaths.has(path));
      if(removedPaths.length){
        const {error:cleanupError}=await supabase.storage.from("product-images").remove(removedPaths);
        if(cleanupError){
          setImageItems(imagePayload.map((image)=>({key:image.storagePath,kind:"existing",storagePath:image.storagePath,alt:image.alt})));
          setError("O produto foi salvo, mas uma foto antiga não pôde ser removida. Salve novamente para tentar a limpeza.");
          setSaving(false);
          return;
        }
      }
      await onSaved();
    }catch(cause){
      if(!databaseSaved&&uploadedPaths.length)await supabase.storage.from("product-images").remove(uploadedPaths);
      setError(databaseSaved?"O produto foi salvo, mas o painel não conseguiu atualizar a listagem.":cause instanceof Error&&cause.message==="upload"?"Não foi possível enviar uma das imagens.":"Não foi possível salvar. Confira slug, SKUs e permissões.");
      setSaving(false);
    }
  }

  return <form className="admin-card product-editor" onSubmit={submit}>
    <div className="product-editor-title"><div><small>{product?"Editando produto":"Novo produto"}</small><h2>{product?.name||"Cadastro do catálogo"}</h2></div><button type="button" aria-label="Fechar editor" onClick={onCancel}><X/></button></div>
    <div className="product-editor-grid">
      <div><label htmlFor="product-name">Nome</label><input id="product-name" value={name} onChange={(event)=>{setName(event.target.value);if(!product)setSlug(slugify(event.target.value))}} required/></div>
      <div><label htmlFor="product-slug">Slug</label><input id="product-slug" value={slug} onChange={(event)=>setSlug(slugify(event.target.value))} required/></div>
      <div><label htmlFor="product-category">Categoria</label><select id="product-category" value={categoryId} onChange={(event)=>setCategoryId(event.target.value)}><option value="">Sem categoria</option>{categories.map((category)=><option value={category.id} key={category.id}>{category.name}</option>)}</select></div>
      <div><label htmlFor="product-status">Publicação</label><select id="product-status" value={status} onChange={(event)=>setStatus(event.target.value as typeof status)}><option value="draft">Salvar como rascunho</option><option value="active">Publicar na loja</option><option value="archived">Arquivar</option></select></div>
      <div className="wide"><label htmlFor="product-description">Descrição</label><textarea id="product-description" rows={4} value={description} onChange={(event)=>setDescription(event.target.value)} placeholder="Descreva tecido, caimento e diferenciais da peça."/></div>
      <label className="featured-check wide"><input type="checkbox" checked={featured} onChange={(event)=>setFeatured(event.target.checked)}/><span><strong>Produto em destaque</strong><small>Permite priorizar a peça nas vitrines administráveis.</small></span></label>
    </div>

    <section className="variant-editor"><div className="product-editor-section-title"><div><h3>Variações e estoque</h3><p>Cadastre somente combinações que realmente existem.</p></div><button type="button" className="table-action" onClick={()=>setVariants((current)=>[...current,emptyVariant()])}><Plus/>Adicionar variação</button></div>
      {variants.map((variant,index)=><div className="variant-row" key={variant.key}>
        <div><label htmlFor={`${variant.key}-sku`}>SKU</label><input id={`${variant.key}-sku`} value={variant.sku} onChange={(event)=>updateVariant(variant.key,"sku",event.target.value.toUpperCase())} required/></div>
        <div><label htmlFor={`${variant.key}-name`}>Nome</label><input id={`${variant.key}-name`} value={variant.name} onChange={(event)=>updateVariant(variant.key,"name",event.target.value)} placeholder="Preto / P" required/></div>
        <div><label htmlFor={`${variant.key}-color`}>Cor</label><input id={`${variant.key}-color`} value={variant.color} onChange={(event)=>updateVariant(variant.key,"color",event.target.value)}/></div>
        <div><label htmlFor={`${variant.key}-size`}>Tamanho</label><input id={`${variant.key}-size`} value={variant.size} onChange={(event)=>updateVariant(variant.key,"size",event.target.value)}/></div>
        <div><label htmlFor={`${variant.key}-price`}>Preço</label><input id={`${variant.key}-price`} inputMode="decimal" value={variant.price} onChange={(event)=>updateVariant(variant.key,"price",event.target.value)} placeholder="189,90" required/></div>
        <div><label htmlFor={`${variant.key}-compare`}>Preço anterior</label><input id={`${variant.key}-compare`} inputMode="decimal" value={variant.compareAt} onChange={(event)=>updateVariant(variant.key,"compareAt",event.target.value)} placeholder="Opcional"/></div>
        <div><label htmlFor={`${variant.key}-stock`}>Estoque</label><input id={`${variant.key}-stock`} type="number" min="0" value={variant.stock} onChange={(event)=>updateVariant(variant.key,"stock",event.target.value)} required/></div>
        <button type="button" className="variant-remove" aria-label={`Remover variação ${index+1}`} disabled={variants.length===1} onClick={()=>removeVariant(variant.key)}><Trash2/></button>
      </div>)}
    </section>

    <section className="image-editor"><div className="product-editor-section-title"><div><h3>Fotos do produto</h3><p>A primeira imagem será usada como capa. Máximo de 8 fotos.</p></div><label className="table-action image-upload"><ImagePlus/>Adicionar fotos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event)=>selectFiles(event.target.files)}/></label></div>
      <div className="admin-image-grid">
        {imageItems.map((item,index)=><article className={item.kind==="new"?"pending-image":""} key={item.key}><div className="image-preview">{item.kind==="existing"?<Image src={supabase?.storage.from("product-images").getPublicUrl(item.storagePath).data.publicUrl||"/brand/product-placeholder.svg"} alt={item.alt} fill unoptimized sizes="150px"/>:<><ImagePlus/><span>{item.file.name}</span></>}{index===0&&<strong className="cover-label">Capa</strong>}</div><div className="image-order"><button type="button" aria-label="Mover imagem para a esquerda" disabled={index===0} onClick={()=>moveImage(index,-1)}><ChevronLeft/></button><button type="button" aria-label="Mover imagem para a direita" disabled={index===imageItems.length-1} onClick={()=>moveImage(index,1)}><ChevronRight/></button></div><button type="button" onClick={()=>setImageItems((current)=>current.filter((image)=>image.key!==item.key))}><Trash2/>Remover</button></article>)}
        {!imageItems.length&&<div className="admin-image-empty"><ImagePlus/><p>Nenhuma foto adicionada.</p></div>}
      </div>
    </section>

    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="product-editor-actions"><button type="button" className="table-action subtle" onClick={onCancel}>Cancelar</button><button className="admin-primary" disabled={saving}>{saving?"Salvando produto…":product?"Salvar alterações":"Cadastrar produto"}</button></div>
  </form>;
}

function emptyVariant():VariantForm{variantKeySequence+=1;return {key:`new-${variantKeySequence}`,sku:"",name:"",color:"",size:"",price:"",compareAt:"",stock:"0"}}
function toVariantForm(variant:AdminProductVariant):VariantForm{return {key:variant.id,id:variant.id,sku:variant.sku,name:variant.name,color:variant.color,size:variant.size,price:centsToInput(variant.priceCents),compareAt:centsToInput(variant.compareAtCents),stock:String(variant.stock)}}
function slugify(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}
