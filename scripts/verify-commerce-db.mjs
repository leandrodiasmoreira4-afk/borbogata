// Isolated PostgreSQL/WASM integration checks. Supabase Auth/Storage are schema
// fixtures here; Cron scheduling and hosted services require staging E2E.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "../work/sql-test/node_modules/@electric-sql/pglite/dist/index.js";

const db = new PGlite();
let checks = 0;
const check = (value, expected) => { assert.deepEqual(value, expected); checks++; };
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated,service_role;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;`);
  for (const file of (await readdir("supabase/migrations")).filter(name => name.endsWith(".sql")).sort()) {
    let sql = await readFile(`supabase/migrations/${file}`, "utf8");
    sql = sql.replace("create extension if not exists pgcrypto;", "");
    // pg_cron isn't available in WASM. Reservation expiry function remains tested below.
    if (file.includes("inventory_reservations")) sql = sql.split("create extension if not exists pg_cron")[0];
    try { await db.exec(sql); } catch (error) { throw new Error(`Migration ${file}: ${error.message}`, { cause: error }); }
  }
  await db.exec(`grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role;
    insert into public.organizations(id,slug,name) values('11111111-1111-4111-8111-111111111111','test-store','Loja de teste');
    insert into public.products(id,organization_id,slug,name,status) values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','test-product','Produto de teste','active');
    insert into public.product_variants(id,organization_id,product_id,sku,name,price_cents,compare_at_cents,stock_quantity)
    values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','TEST-P','Preto / P',20000,30000,5);
    insert into public.commerce_settings(organization_id,pickup_enabled,pickup_instructions) values('11111111-1111-4111-8111-111111111111',true,'Retirada fictícia para testes');
    insert into auth.users values('44444444-4444-4444-8444-444444444444');
    insert into public.organization_members values('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','orders',now());`);
  const orderId = "55555555-5555-4555-8555-555555555555";
  const org = "11111111-1111-4111-8111-111111111111";
  const variant = "33333333-3333-4333-8333-333333333333";
  const details = { name: "Comprador Teste", email: "test@example.com", phone: "71999999999", delivery: "pickup" };
  const create = async (id, quantity = 1, extra = {}, coupon = "", fingerprint = "a".repeat(64)) =>
    (await one("select public.create_sandbox_order($1,$2,$3,$4::jsonb,$5::jsonb,$6) as result", ["test-store",id,fingerprint,JSON.stringify([{variant_id:variant,quantity}]),JSON.stringify({...details,...extra}),coupon])).result;
  await db.exec("set role service_role");
  const order = await create(orderId);
  check(order.subtotalCents, 20000);
  check((await create(orderId)).reused, true);
  check((await one("select count(*)::int as count from public.orders")).count, 1);
  check((await one("select reserved_quantity from public.product_variants where id=$1",[variant])).reserved_quantity,1);
  await assert.rejects(create(orderId,1,{},"","b".repeat(64)), /key reused/); checks++;
  await assert.rejects(create(crypto.randomUUID(),99), /unavailable/); checks++;
  await assert.rejects(create(crypto.randomUUID(),1,{delivery:"correios"}), /freight not configured/); checks++;
  await assert.rejects(create(crypto.randomUUID(),1,{},"INVALID"), /coupon unavailable/); checks++;
  check((await one("select count(*)::int as count from public.orders")).count, 1);
  const payment = { id: "123456", orderId, status: "approved", amountCents: 20000, refundedCents: 0, updatedAt: "2026-10-13T00:00:00Z", liveMode: false };
  const processPayment = async value => (await one("select public.process_verified_sandbox_payment($1::jsonb) as result", [JSON.stringify(value)])).result;
  await assert.rejects(processPayment({...payment,amountCents:1}), /does not match/); checks++;
  check(await processPayment(payment), "processed");
  check(await processPayment(payment), "duplicate_or_stale");
  check(await processPayment({...payment,status:"pending",updatedAt:"2026-10-12T00:00:00Z"}), "duplicate_or_stale");
  check((await one("select status from public.orders where id=$1",[orderId])).status,"confirmed");
  check(await one("select stock_quantity,reserved_quantity from public.product_variants where id=$1",[variant]), {stock_quantity:4,reserved_quantity:0});
  check((await one("select count(*)::int as count from public.inventory_movements where reason='sale'")).count,1);
  check(await processPayment({...payment,status:"refunded",refundedCents:20000,updatedAt:"2026-10-14T00:00:00Z"}),"processed");
  check((await one("select payment_review_required from public.orders where id=$1",[orderId])).payment_review_required,true);

  const lateId = crypto.randomUUID();
  await create(lateId);
  await db.exec("reset role");
  await db.query("update public.inventory_reservation_groups set created_at=now()-interval '1 hour',expires_at=now()-interval '1 minute' where id=$1",[lateId]);
  await db.exec("select private.expire_inventory_reservations(100); set role service_role");
  check(await processPayment({...payment,id:"123457",orderId:lateId}),"processed");
  check(await one("select status,payment_review_required from public.orders where id=$1",[lateId]),{status:"pending",payment_review_required:true});
  check((await one("select stock_quantity from public.product_variants where id=$1",[variant])).stock_quantity,4);

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='44444444-4444-4444-8444-444444444444'`);
  await assert.rejects(db.query("update public.orders set status='shipped' where id=$1",[orderId]), /transition/); checks++;
  await assert.rejects(db.query("update public.orders set total_cents=1 where id=$1",[orderId]), /server controlled/); checks++;
  await assert.rejects(db.query("select public.process_verified_sandbox_payment($1::jsonb)",[JSON.stringify(payment)]), /permission denied/); checks++;
  check((await one("select count(*)::int as count from public.commerce_settings")).count,0);
  await db.exec("reset role; set role anon");
  await assert.rejects(db.query("select * from public.checkout_sessions"), /permission denied/); checks++;
  await assert.rejects(db.query("select public.create_sandbox_order('test-store',gen_random_uuid(),'',null,null,'')"), /permission denied/); checks++;
  await db.exec("reset role");
  await db.query("update public.product_variants set promotion_starts_at=now()+interval '1 day',promotion_ends_at=now()+interval '2 days' where id=$1",[variant]);
  await db.query("insert into public.coupons(organization_id,code,kind,value,starts_at,ends_at,is_active) values($1,'TEST10','percent',10,now()-interval '1 hour',now()+interval '1 day',true)",[org]);
  await db.query("update public.commerce_settings set courier_enabled=true,courier_fee_cents=800,courier_postal_prefixes=array['41710'] where organization_id=$1",[org]);
  await db.exec("set role service_role");
  const couponOrder = await create(crypto.randomUUID(),1,{},"TEST10");
  check(couponOrder.subtotalCents,30000);
  check(couponOrder.discountCents,3000);
  const courierOrder = await create(crypto.randomUUID(),1,{delivery:"courier",city:"Salvador",state:"BA",postalCode:"41710-000"});
  check(courierOrder.shippingCents,800);
  await assert.rejects(create(crypto.randomUUID(),1,{delivery:"courier",city:"Salvador",state:"BA",postalCode:"01001-000"}),/freight not configured/); checks++;
  await db.exec("reset role; set role authenticated; set request.jwt.claim.sub='44444444-4444-4444-8444-444444444444'");
  await assert.rejects(db.query("select public.schedule_variant_promotion($1,$2,null,null)",[org,variant]),/not authorized/); checks++;
  const report = (await one("select public.commerce_report($1,now()-interval '1 day',now()+interval '1 day') as result",[org])).result;
  check(report.orders,4);
  await db.exec("reset role");
  await db.query("update public.organization_members set role='owner' where organization_id=$1",[org]);
  await db.exec("set role authenticated");
  await db.query("select public.schedule_variant_promotion($1,$2,null,null)",[org,variant]);
  check((await one("select promotion_starts_at from public.product_variants where id=$1",[variant])).promotion_starts_at,null);

  // Admin workflows: financial dates, all rows, tenant isolation and atomic edits.
  await db.exec("reset role");
  const otherOrg = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await db.query("insert into public.organizations(id,slug,name) values($1,'other-store','Outra loja teste')",[otherOrg]);
  const customerId=crypto.randomUUID();
  await db.query("insert into public.customers(id,organization_id,name,email) values($1,$2,'Cliente histórico','history@example.com')",[customerId,org]);
  const reportIds=[];
  for(let index=0;index<30;index++) {
    const id=crypto.randomUUID(); reportIds.push(id);
    await db.query("insert into public.orders(id,organization_id,customer_id,subtotal_cents,total_cents,created_at,payment_environment,customer_snapshot,shipping_address_snapshot) values($1,$2,$3,1000,1000,'2024-02-01T03:00:00Z','production',$4::jsonb,'{}'::jsonb)",[id,org,customerId,JSON.stringify({name:'Cliente histórico',email:'history@example.com'})]);
    await db.query("insert into public.payments(organization_id,order_id,provider,external_id,status,amount_cents,paid_at,refunded_cents) values($1,$2,'mercado_pago',$3,'paid',1000,'2024-03-01T03:00:00Z',$4)",[org,id,'admin-'+index,index===0?200:0]);
  }
  await db.query("update public.payments set status='refunded',refunded_cents=1000 where order_id=$1",[reportIds[1]]);
  // This payment is 29 February in Brazil and must not enter March 1.
  await db.query("update public.payments set paid_at='2024-03-01T02:59:59Z' where order_id=$1",[reportIds[2]]);
  await db.exec("set role authenticated");
  const sales=async (start,end,env='production',tenant=org)=>(await one("select public.admin_sales_report($1,$2,$3,$4) as result",[tenant,start,end,env])).result;
  const march=await sales('2024-03-01','2024-03-01');
  check(march.orders,0); check(march.paid_orders,29); check(march.approved_cents,29000); check(march.refunded_cents,1200); check(march.net_cents,27800);
  check(march.days.length,1);
  check((await sales('2024-02-01','2024-02-29')).orders,30);
  check((await sales('2024-02-29','2024-02-29')).net_cents,1000);
  check((await sales('2024-03-01','2024-03-01','sandbox')).net_cents,0);
  check((await sales('2024-01-01','2024-12-31')).days.length,366);
  await assert.rejects(sales('2024-01-01','2025-01-01'),/invalid report/); checks++;
  await assert.rejects(sales('2024-03-01','2024-03-01','production',otherOrg),/not authorized/); checks++;
  const orderPage=async(page,search='histórico')=>(await one("select public.admin_orders_page($1,$2,'','2024-02-01','2024-02-29',$3,$4) as result",[org,search,page,customerId])).result;
  check((await orderPage(0)).total,30); check((await orderPage(0)).rows.length,25); check((await orderPage(1)).rows.length,5);
  check(new Set([...(await orderPage(0)).rows,...(await orderPage(1)).rows].map(row=>row.id)).size,30);
  check((await orderPage(0,"' OR true --")).total,0);
  await db.query("select public.admin_save_customer($1,$2,'Nome corrigido','updated@example.com','71999999999')",[org,customerId]);
  check((await one("select name from public.customers where id=$1",[customerId])).name,'Nome corrigido');
  check((await one("select customer_snapshot->>'name' as name from public.orders where id=$1",[reportIds[0]])).name,'Cliente histórico');
  const clients=(await one("select public.admin_customers_page($1,'updated@example.com',0) as result",[org])).result;
  check(clients.total,1);check(clients.rows[0].id,customerId);
  await assert.rejects(db.query("select public.admin_save_customer($1,$2,'No','bad','abc')",[org,customerId]),/invalid customer/);checks++;
  await assert.rejects(db.query("select public.admin_save_customer($1,$2,'Other','ok@example.com','')",[otherOrg,customerId]),/not authorized/);checks++;
  const collection=(await one("select public.create_collection_with_products($1,'test-collection','Coleção teste','Descrição',$2,'2024-02-01',array['22222222-2222-4222-8222-222222222222'::uuid],false) as id",[org,org+'/collections/test.jpg'])).id;
  const editCollection=(ids,tenant=org)=>db.query("select public.update_collection_with_products($1,$2,'Coleção editada','Nova descrição',$3,'2024-03-01',$4::uuid[],true)",[tenant,collection,org+'/collections/new.jpg',ids]);
  await editCollection(['22222222-2222-4222-8222-222222222222']);
  check(await one("select name,slug,description,is_featured from public.collections where id=$1",[collection]),{name:'Coleção editada',slug:'test-collection',description:'Nova descrição',is_featured:true});
  await assert.rejects(editCollection([crypto.randomUUID()]),/invalid collection/);checks++;
  check((await one("select count(*)::int as count from public.collection_products where collection_id=$1",[collection])).count,1);
  await assert.rejects(editCollection(['22222222-2222-4222-8222-222222222222'],otherOrg),/not authorized/);checks++;
  await db.exec("reset role");await db.query("update public.organization_members set role='catalog' where organization_id=$1",[org]);await db.exec("set role authenticated");
  await assert.rejects(sales('2024-03-01','2024-03-01'),/not authorized/);checks++;
  await assert.rejects(orderPage(0),/not authorized/);checks++;
  await assert.rejects(db.query("select public.admin_customers_page($1,'',0)",[org]),/not authorized/);checks++;
  await assert.rejects(db.query("select public.admin_save_customer($1,$2,'No access','','')",[org,customerId]),/not authorized/);checks++;
  await editCollection(['22222222-2222-4222-8222-222222222222']);checks++;
  await db.exec("reset role");await db.query("update public.organization_members set role='orders' where organization_id=$1",[org]);await db.exec("set role authenticated");
  await assert.rejects(editCollection(['22222222-2222-4222-8222-222222222222']),/not authorized/);checks++;
  await db.exec("reset role;set role anon");
  await assert.rejects(sales('2024-03-01','2024-03-01'),/permission denied/);checks++;

  console.log(JSON.stringify({ passed: checks, migrations: "all applied in isolated PostgreSQL/WASM", externalServices: "not tested" },null,2));
} finally { await db.close(); }
