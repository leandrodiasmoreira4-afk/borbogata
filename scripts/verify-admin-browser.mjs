// Local UI -> real SQL functions in PostgreSQL/WASM. Auth, Storage and the
// PostgREST transport are fixtures, never connections to a hosted Supabase.
// Run the isolated preview with NEXT_PUBLIC_SUPABASE_URL=https://admin-test.supabase.co
// and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local_fixture on port 5174.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createCommerceTestDb } from './create-commerce-test-db.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/DELL/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.ADMIN_TEST_BASE_URL || 'http://127.0.0.1:5174';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error('Local test preview required');
const org='11111111-1111-4111-8111-111111111111', userId='44444444-4444-4444-8444-444444444444';
const product='22222222-2222-4222-8222-222222222222', variant='33333333-3333-4333-8333-333333333333';
const collection='66666666-6666-4666-8666-666666666666', customer='77777777-7777-4777-8777-777777777777';
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
await fs.mkdir('outputs',{recursive:true});
try {
  for(const width of (process.env.ADMIN_TEST_WIDTHS || "390,768,1440").split(",").map(Number)) {
    const db=await createCommerceTestDb();
    const one=async(sql,params=[]) => (await db.query(sql,params)).rows[0];
    await db.exec(`insert into public.organizations(id,slug,name) values('${org}','borbogata','Loja teste');
      insert into auth.users(id) values('${userId}');
      insert into public.organization_members(organization_id,user_id,role) values('${org}','${userId}','owner');
      insert into public.products(id,organization_id,slug,name,status) values('${product}','${org}','roupa-teste','Roupa de teste','active');
      insert into public.product_variants(id,organization_id,product_id,sku,name,color,size,price_cents,stock_quantity) values('${variant}','${org}','${product}','TEST-P','Preto / P','Preto','P',1000,10);
      insert into public.collections(id,organization_id,slug,name,description,status,cover_storage_path) values('${collection}','${org}','colecao-teste','Coleção de teste','Descrição inicial','active','${org}/collections/test.jpg');
      insert into public.collection_products(organization_id,collection_id,product_id) values('${org}','${collection}','${product}');
      insert into public.customers(id,organization_id,name,email) values('${customer}','${org}','Cliente de teste','client@example.com');`);
    for(let i=0;i<30;i++) {
      const orderId=crypto.randomUUID();
      await db.query(`insert into public.orders(id,organization_id,customer_id,subtotal_cents,total_cents,customer_snapshot,shipping_address_snapshot,payment_environment,created_at)
        values($1,$2,$3,1000,1000,'{"name":"Cliente de teste","email":"client@example.com"}','{}','production','2024-03-05T12:00:00Z')`,[orderId,org,customer]);
      await db.query("insert into public.payments(organization_id,order_id,provider,external_id,status,amount_cents,paid_at) values($1,$2,'mercado_pago',$3,'paid',1000,'2024-03-05T12:00:00Z')",[org,orderId,String(i)]);
    }
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${userId}'`);
    const context=await browser.newContext({viewport:{width,height:1000}});
    const errors=[],requests=[]; let failReport=false;
    const user={id:userId,aud:'authenticated',role:'authenticated',email:'admin@example.com',app_metadata:{},user_metadata:{},created_at:'2024-01-01T00:00:00Z'};
    const jwt = [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:userId,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'test-signature'].join('.');
    await context.route('https://admin-test.supabase.co/**',async route=>{
      const request=route.request(),url=new URL(request.url());
      const body=request.postDataJSON?.() || {}; requests.push(url.pathname);
      const respond=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
      try {
        if(url.pathname==='/auth/v1/token') return respond({access_token:jwt,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,user});
        if(url.pathname==='/auth/v1/user') return respond(user);
        if(url.pathname==='/auth/v1/logout') return respond({});
        if(url.pathname.startsWith('/storage/')) return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#5a2b5b"/></svg>'});
        if(url.pathname.startsWith('/rest/v1/rpc/')) {
          const fn=url.pathname.split('/').at(-1);
          const parameters={
            admin_sales_report:['target_organization_id','first_day','last_day','environment'],
            admin_orders_page:['target_organization_id','search_text','status_filter','first_day','last_day','page_number','customer_filter'],
            admin_customers_page:['target_organization_id','search_text','page_number'],
            admin_save_customer:['target_organization_id','target_customer_id','customer_name','customer_email','customer_phone'],
            update_collection_with_products:['target_organization_id','target_collection_id','collection_name','collection_description','collection_cover_storage_path','collection_launched_at','product_ids','make_featured'],
            adjust_inventory:['target_organization_id','target_variant_id','quantity_change','movement_reason','movement_note'],
          }[fn];
          if(!parameters) throw new Error('Unhandled RPC '+fn);
          if(fn==='admin_sales_report'&&failReport) {failReport=false;return respond({message:'Fixture network error'},503);}
          return respond((await one(`select public.${fn}(${parameters.map((_,i)=>'$'+(i+1)).join(',')}) as result`,parameters.map(key=>body[key]??null))).result);
        }
        const table=url.pathname.split('/').at(-1);
        if(table==='organization_members') return respond({organization_id:org,role:'owner',organizations:{name:'Loja teste',slug:'borbogata'}});
        if(table==='products') {
          const row=await one('select * from public.products where id=$1',[product]);
          row.product_variants=(await db.query('select * from public.product_variants where product_id=$1',[product])).rows;row.product_images=[];return respond([row]);
        }
        if(table==='orders') return respond((await db.query(`select o.*,coalesce((select jsonb_agg(p) from public.payments p where p.order_id=o.id),'[]') as payments from public.orders o order by created_at desc,id limit 20`)).rows);
        if(['categories','collections','collection_products','inventory_movements'].includes(table)) { const rows=(await db.query(`select * from public.${table} where organization_id=$1`,[org])).rows; if(table==='collections') rows.forEach(row=>row.launched_at=row.launched_at.toISOString().slice(0,10));return respond(rows); }
        throw new Error('Unhandled transport '+url.pathname);
      }catch(error){errors.push(error.message);return respond({message:error.message},400);}
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    try {
      await page.goto(base+'/admin',{waitUntil:'networkidle'});
      await page.getByLabel('E-mail',{exact:true}).fill('admin@example.com');await page.getByLabel('Senha',{exact:true}).fill('fixture-password');
      await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByRole('heading',{name:'Visão geral',exact:true}).waitFor();
      const navigate=async(name)=>{if(width<=680)await page.getByRole('button',{name:'Abrir menu',exact:true}).click();await page.locator('nav').getByRole('button',{name,exact:true}).click();};
      await navigate('Relatórios');
      await page.getByLabel('Data de referência',{exact:true}).fill('2024-03-05');
      for(const [preset,start,end] of [['Dia','2024-03-05','2024-03-05'],['Semana','2024-03-04','2024-03-10'],['Mês','2024-03-01','2024-03-31'],['Ano','2024-01-01','2024-12-31']]) {
        await page.getByRole('button',{name:preset,exact:true}).click();assert.equal(await page.getByLabel('Início',{exact:true}).inputValue(),start);assert.equal(await page.getByLabel('Fim',{exact:true}).inputValue(),end);
      }
      await page.getByRole('button',{name:'Mês',exact:true}).click();await page.getByRole('button',{name:'Consultar período',exact:true}).click();
      await page.getByRole('status').filter({hasText:'01/03/2024'}).waitFor();assert.match(await page.locator('.metric-grid').innerText(),/300,00/);
      const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar CSV',exact:true}).click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/production-2024-03-01/);
      const stream=await download.createReadStream();let csv='';for await(const chunk of stream)csv+=chunk;assert.match(csv,/2024-03-05;30;300.00;300.00;0.00;300.00/);
      failReport=true;await page.getByRole('button',{name:'Consultar período',exact:true}).click();await page.getByRole('alert').filter({hasText:'Não foi possível consultar'}).waitFor();assert.equal(await page.getByRole('button',{name:'Exportar CSV'}).count(),0);
      await page.getByRole('button',{name:'Consultar período',exact:true}).click();await page.getByRole('button',{name:'Exportar CSV'}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`outputs/admin-report-${width}.png`,fullPage:true});
      await navigate('Pedidos');await page.getByText('Página 1 · 30 pedidos encontrados',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Ver pedido',exact:true}).count(),25);
      await page.getByRole('button',{name:'Próxima',exact:true}).click();await page.getByText('Página 2 · 30 pedidos encontrados',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Ver pedido',exact:true}).count(),5);
      await page.getByLabel('Buscar pedido ou cliente').fill('inexistente');await page.getByRole('button',{name:'Filtrar pedidos'}).click();await page.getByText('Nenhum pedido encontrado.').waitFor();
      await navigate('Clientes');await page.getByRole('button',{name:'Editar cliente',exact:true}).click();await page.getByLabel('Nome do cliente').fill('Nome corrigido');await page.getByRole('button',{name:'Salvar cliente',exact:true}).click();await page.getByRole('cell',{name:'Nome corrigido',exact:true}).waitFor();
      assert.equal((await one('select name from public.customers where id=$1',[customer])).name,'Nome corrigido');
      assert.equal((await one("select customer_snapshot->>'name' as name from public.orders limit 1")).name,'Cliente de teste');
      await page.getByRole('button',{name:'Ver compras',exact:true}).click();await page.getByText('Página 1 · 30 pedidos encontrados',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Fechar compras',exact:true}).click();
      await page.getByRole('button',{name:'Novo cliente',exact:true}).click();await page.getByLabel('Nome do cliente').fill('Novo comprador');await page.getByLabel('E-mail do cliente').fill('new@example.com');await page.getByLabel('Telefone do cliente').fill('71999999999');await page.getByRole('button',{name:'Salvar cliente',exact:true}).click();await page.getByRole('cell',{name:'Novo comprador',exact:true}).waitFor();
      await page.getByLabel('Buscar cliente',{exact:true}).fill('new@example.com');await page.getByRole('button',{name:'Buscar clientes',exact:true}).click();await page.getByText('Página 1 · 1 clientes',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Editar cliente',exact:true}).count(),1);
      await navigate('Coleções');await page.getByRole('button',{name:'Editar coleção',exact:true}).click();await page.getByLabel('Nome da coleção').fill('Coleção revisada');await page.getByLabel('Texto da coleção').fill('Descrição revisada');await page.getByRole('button',{name:'Salvar coleção',exact:true}).click();await page.getByRole('heading',{name:'Coleção revisada',exact:true}).waitFor();
      assert.equal((await one('select slug from public.collections where id=$1',[collection])).slug,'colecao-teste');
      await page.getByLabel('Onde buscar').selectOption('produtos');await page.getByLabel('Buscar no painel').fill('TEST-P');await page.getByRole('button',{name:'Buscar',exact:true}).click();await page.getByRole('heading',{name:'Produtos',exact:true}).waitFor();assert.match(await page.locator('main').innerText(),/Roupa de teste/);
      await page.getByLabel('Tipo de movimentação').selectOption('restock');await page.getByLabel('Produto e variação').selectOption(variant);await page.getByLabel('Quantidade de unidades').fill('2');await page.getByRole('button',{name:'Registrar movimentação'}).click();
      await page.waitForFunction(()=>document.querySelector('main')?.innerText.includes('12 disponíveis'));
      assert.equal((await one('select stock_quantity from public.product_variants where id=$1',[variant])).stock_quantity,12);
      await page.getByRole('button',{name:'Ver movimentações',exact:true}).click();await page.getByText(/\+2 un\. · Reposição/).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`outputs/admin-products-${width}.png`,fullPage:true});
      assert.deepEqual(errors,[]);results.push({width,passed:true,transport:'Auth/Storage/PostgREST fixtures; real SQL with RLS',rpcRequests:requests.filter(path=>path.includes('/rpc/')).length});
    }catch(error){await page.screenshot({path:`outputs/admin-failure-${width}.png`,fullPage:true});console.log(await page.evaluate(()=>[...document.querySelectorAll("main *")].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,15).map(el=>({tag:el.tagName,class:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right}))));console.log(JSON.stringify({width,errors,body:(await page.locator("body").innerText()).slice(-3000)}));throw error;}finally{await context.close();await db.close();}
  }
  console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
