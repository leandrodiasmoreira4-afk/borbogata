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
8. Em **Project Settings > Data API**, confirme que o schema `public` está exposto para a aplicação. Projetos Supabase novos podem iniciar sem exposição automática das tabelas.
9. Execute os Security e Performance Advisors depois de aplicar migrations e antes de promover o ambiente para produção.

## Verificação da Fase 1

A migration `phase1_database_security` adiciona:

- integridade entre registros e `organization_id`;
- leitura pública do catálogo para visitantes e clientes autenticados;
- leitura dos próprios dados para clientes autenticados;
- auditoria de alteração do status de produtos;
- bloqueio de alterações diretas no saldo de estoque.

Alterações de estoque devem utilizar exclusivamente a função `adjust_inventory`. Atualizar `product_variants.stock_quantity` diretamente gera erro e não deve ser usado pelo painel ou por integrações.

## Catálogo administrativo

As migrations `product_images_storage` e `product_catalog_admin` adicionam a operação profissional de catálogo:

- bucket público `product-images`, com escrita restrita aos papéis `owner`, `admin` e `catalog`;
- criação e edição atômica de produto, variações e metadados das imagens pela função `save_product_catalog`;
- limite de oito imagens e cem variações por produto, com validação também no banco;
- publicação condicionada à existência de ao menos uma imagem e uma variação ativa;
- ajuste de estoque acompanhado por `inventory_movements` e `audit_logs`;
- reativação de SKU anteriormente removido, preservando o histórico da variação;
- alteração de publicação pela função `set_product_status`.

O painel envia arquivos exclusivamente pela API do Supabase Storage. O SQL manipula apenas os metadados de `product_images`; não altere diretamente registros de `storage.objects`.

## Reservas de estoque

As migrations `inventory_reservations` e `fix_inventory_reservation_function` adicionam:

- saldo físico (`stock_quantity`) separado do saldo reservado (`reserved_quantity`);
- grupos de reserva idempotentes com itens por variação;
- validade configurável entre 5 e 30 minutos, usando 15 minutos por padrão;
- confirmação vinculada ao pedido com uma única baixa auditável de estoque;
- liberação e expiração que devolvem a disponibilidade sem alterar o estoque físico;
- trabalho `l7-expire-inventory-reservations` no Supabase Cron, executado a cada minuto;
- RLS nas tabelas de reserva e execução das operações somente pelo papel `service_role`.

As funções `reserve_inventory`, `confirm_inventory_reservation` e `release_inventory_reservation` são operações exclusivas do servidor. Nunca use a chave secreta no navegador. A vitrine deve considerar como disponível apenas `stock_quantity - reserved_quantity`.

Em um ambiente com Docker, valide a sequência completa antes do deploy:

```bash
pnpm exec supabase start
pnpm exec supabase db reset
pnpm exec supabase migration list --local
pnpm exec supabase db lint --local
pnpm exec supabase db advisors --local
```

O arquivo `supabase/seed.sql` contém somente dados demonstrativos para desenvolvimento local. Produtos reais devem ser cadastrados no painel `/admin`.
