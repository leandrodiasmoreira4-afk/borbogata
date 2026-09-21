# Ativação do Supabase

Cada cliente deve ter um projeto Supabase próprio. A estrutura mantém `organization_id` para consistência e replicação do produto L7, mas não mistura dados de clientes diferentes no mesmo banco.

1. Crie ou selecione o projeto Supabase da loja.
2. Vincule o projeto com `pnpm exec supabase link --project-ref <project-ref>`.
3. Aplique a estrutura com `pnpm exec supabase db push`.
4. Cadastre o primeiro usuário em **Authentication > Users**.
5. No SQL Editor, associe esse usuário à organização:

```sql
insert into public.organization_members (organization_id, user_id, role)
select id, '<auth-user-id>'::uuid, 'owner'
from public.organizations
where slug = 'borbogata';
```

6. Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no ambiente do site.
7. Mantenha `SUPABASE_SECRET_KEY` somente no ambiente do servidor. A chave não pode usar o prefixo `NEXT_PUBLIC_`.

O arquivo `supabase/seed.sql` contém somente dados demonstrativos para desenvolvimento local. Produtos reais devem ser cadastrados no painel `/admin`.
