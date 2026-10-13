import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "../work/sql-test/node_modules/@electric-sql/pglite/dist/index.js";
export async function createCommerceTestDb(){
 const db=new PGlite();
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

 return db;
}
