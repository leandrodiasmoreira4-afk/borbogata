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
  console.log(JSON.stringify({ passed: checks, migrations: "all applied in isolated PostgreSQL/WASM", externalServices: "not tested" },null,2));
} finally { await db.close(); }
