# Borbogata — auditoria e preparação operacional

Atualizado em 13/10/2026. Este documento descreve código preparado e testes locais; **não certifica a loja para vendas reais**.

## Escopo preservado

Repositório existente `leandrodiasmoreira4-afk/borbogata`. Mantidos React, TypeScript, Next.js/Vinext, Supabase e execução Cloudflare. Nenhuma alteração na home, identidade ou imagens comerciais; nenhum deploy. Os controles novos reutilizam o visual existente. Ajustes CSS ficam restritos ao painel, incluindo correção de overflow no tablet e rótulos dos botões no celular. Preset L7 Web App com administração, Supabase e segurança; pagamentos reais e publicação permanecem desativados.

## Evidências da auditoria inicial

- Supabase remoto `borbogata`: 19 tabelas públicas com RLS ativada; Security Advisors sem alertas na consulta realizada. Isso não equivale a uma auditoria completa de segurança.
- O banco tinha 3 produtos e nenhum pedido no momento da consulta. Não foram extraídos dados pessoais.
- Os identificadores das 12 migrações remotas divergem dos arquivos locais. Não executar `db push` cegamente. Comparar definições e reconciliar o histórico em homologação antes de promover a nova migração.
- Checkout anterior era uma prévia sem criação de pedido. Clientes/configurações estavam desativados. Visão geral somava somente os 20 pedidos exibidos.
- Cadastro e edição de produtos, cores/tamanhos livres (incluindo P/M/G), fotos ordenadas, publicação/arquivamento, coleções, ajuste auditado e reserva de estoque já existiam.

## Entregue no código

| Área | Comportamento preparado | Limite atual |
|---|---|---|
| Produtos | Validação de limites monetários e estoque; preço efetivo por período | Exclusão física não adicionada; arquivamento preserva histórico |
| Ofertas | Agendamento por variação, início inclusivo/fim exclusivo; fora da janela volta ao preço anterior | Exige preço anterior maior que preço de venda; configuração de datas usa fuso do navegador |
| Clientes | Cadastro, edição, busca por nome/e-mail/telefone, paginação e histórico de compras sob RLS; snapshots de pedidos preservados | Sem unificação automática de compradores visitantes |
| Cupons | Cadastro, edição, ativação, período, mínimo, valor fixo/percentual; acúmulo com oferta só se habilitado | Sem limite de utilizações/global/por CPF; configurar isso exigiria nova regra |
| Relatórios | Dia, semana, mês, ano e intervalo personalizado, resumo na visão geral, detalhamento diário e CSV; agregação de todos os registros do período no banco | Até 366 dias por consulta; relatório operacional, não contabilidade ou lucro |
| Configurações | Retirada e instruções; taxa de motoboy e prefixos de CEP; CEP de origem | Tudo desativado por padrão; não foram inventadas taxas ou horários |
| Checkout | Validação no servidor, CEP via ViaCEP, preço recalculado no banco, cupom, reserva e pedido atômicos | Exclusivo para homologação separada e Mercado Pago de teste |
| Pagamento | Preferência com referência ao pedido, URL sandbox, timeout e redirecionamento restrito | Não há modo de produção nesta entrega |
| Webhook | HMAC, consulta à API, conferência de ID/recebedor/moeda/valor/modo, idempotência por versão e transação | Exige URL pública HTTPS e segredo de webhook de testes |
| Estoque | Saldo físico/reservado/disponível por cor/tamanho, filtro de baixo estoque, reposição/saída e histórico paginado; reserva por 15 minutos e confirmação única | Expiração periódica real depende do Cron Supabase; movimentação presencial de estoque não cria receita |
| Exceções | Pagamento tardio, duplicado, parcial/totalmente estornado ou contestado exige revisão; entrega bloqueada | Sem estorno financeiro automático nem reposição automática de produto devolvido |
| Pedidos | Histórico completo paginado, busca por número/nome/e-mail, filtros de status/data, identificação de teste/revisão; banco impede avanço sem pagamento válido e rastreio inválido | Cancelamento financeiro/manual review precisa de procedimento operacional antes da produção |
| Coleções/imagens | Criar/editar nome, descrição, capa, data e composição; manter URL e status ao editar; destacar/arquivar | Sem transformação automática de imagens; trocar capa preserva arquivo anterior para não quebrar referências |

## Critérios dos novos relatórios e consultas

- Usa o fuso America/Sao_Paulo. Semana de segunda a domingo. Datas inicial e final inclusivas na interface, convertidas para intervalo semiaberto no banco.
- Pedidos são contados por criação; pagamentos por primeira aprovação persistida em paid_at. Cancelados/pendentes não entram como pagamentos aprovados. Estornos totais e contestações já mapeadas como refunded removem todo o valor; parciais descontam refunded_cents.
- O estorno atualiza o período da aprovação original, não o dia do reembolso. Pagamentos sem paid_at não são inventados no relatório. Valores incluem frete, antes de taxas/custos/impostos. Pedidos duplicadamente pagos podem aparecer com mais de um recebimento e precisam de revisão.
- Produção, sandbox e pedidos antigos sem classificação são consultados separadamente. Nenhum teste entra no padrão de vendas reais.
- A visão geral usa a mesma consulta integral; apenas sua tabela de pedidos recentes permanece limitada a 20 por conveniência. O módulo Pedidos percorre todo o histórico em páginas de 25.
- Busca do cabeçalho permite escolher produtos (nome/slug/SKU/cor/tamanho), coleções, pedidos ou clientes. As consultas de pedidos/clientes filtram no banco antes de paginar. O catálogo é carregado em páginas explícitas, evitando truncamento pelo limite padrão da API.
- Nova migração: supabase/migrations/20261013095404_admin_management_reports.sql. Deve ser promovida antes da interface correspondente. Não foi aplicada ao projeto remoto.
- RPCs novas usam SECURITY INVOKER, search_path vazio, autorização por organização/papel e grants apenas a authenticated; catálogo não acessa relatórios/clientes e equipe de pedidos não edita coleções. Operações editáveis registram auditoria sem copiar dados pessoais para os logs.

## Segurança e idempotência

O endpoint `/api/checkout/start` exige a origem HTTPS configurada, limita o corpo a 16 KiB e valida os dados. O identificador UUID da tentativa é associado a uma impressão SHA-256 do conteúdo normalizado. Repetir a mesma tentativa reutiliza o pedido; mudar o conteúdo com o mesmo ID é rejeitado. O banco bloqueia concorrência sobre a chave e sobre as variações.

A preferência é criada uma única vez por tentativa. Se a chamada externa retornar mas houver falha ao persistir a URL, a tentativa fica pendente de revisão/expiração, sem recriar automaticamente preferências. **Recuperação automática dessa janela de falha ainda não foi implementada.** O cliente pode consultar novamente a mesma tentativa enquanto a página estiver aberta. Recarregar a página perde o identificador local; por isso o aviso pede aguardar revisão/expiração antes de nova tentativa.

O corpo do webhook não é usado para confirmar pagamentos. A API autenticada do Mercado Pago fornece o estado. Gravação do evento, pagamento e confirmação de estoque são transacionais. Reembolsos não repõem estoque automaticamente: produto pode ainda estar em posse do comprador. Nenhum dado de cartão é coletado pela loja.

Há bloqueio explícito ao projeto Supabase atual da Borbogata no checkout de testes. Chaves ficam no servidor. Antes de habilitar produção, ainda são necessários limitação de requisições/abuso na borda, monitoramento, recuperação de preferências, gestão de cancelamentos e testes concorrentes em PostgreSQL hospedado. RLS local foi exercitada, mas Auth e Storage reais não foram testados nesta rodada.

## Ativação de homologação — pendente

O usuário confirmou que ainda não há aplicação/contas de teste Mercado Pago nem banco separado de homologação. Portanto não foi feita compra no sandbox externo.

1. Criar/selecionar um Supabase exclusivo de homologação, sem dados reais; aplicar e verificar as migrações nesse ambiente. Não alterar o histórico do banco atual sem comparação e backup.
2. Cadastrar usuários de teste para `owner`, `catalog`, `orders` e cliente sem papel administrativo. Criar catálogo fictício e estoque de teste pelo painel.
3. Criar aplicação e contas de teste no Mercado Pago; guardar token e segredo no gerenciador de segredos da hospedagem, nunca no chat/repositório.
4. Configurar as variáveis descritas em `.env.example`: `MERCADO_PAGO_MODE=sandbox`, token/segredo/collector de sandbox, `CHECKOUT_SANDBOX_PROJECT_REF`, Supabase de homologação e `STORE_PUBLIC_URL` HTTPS.
5. Configurar webhook `payment` para `/api/payments/mercado-pago/webhook` e cadastrar a assinatura correspondente.
6. Habilitar somente entregas com regras definidas nas configurações do painel de homologação.
7. Executar os cenários abaixo. A aprovação visual da cliente não substitui o aceite operacional.

## Matriz de compra no sandbox externo — ainda não executada

- Produto P/M/G e cores: seleção, carrinho, quantidade, preço e oferta ativa/futura/expirada.
- Cupom válido/inválido/expirado, mínimo não atingido e acúmulo permitido/proibido.
- Retirada configurada e desativada; motoboy dentro/fora dos CEPs aprovados; CEP inexistente, cidade divergente e ViaCEP indisponível.
- Pagamento aprovado, pendente, recusado e cancelado; retorno do navegador antes/depois do webhook.
- Mesmo webhook repetido, entrega fora de ordem, assinatura inválida, recebedor diferente, valor/moeda incorretos e modo de produção rejeitado.
- Duas compras simultâneas da última unidade: somente uma reserva deve ser aceita.
- Pagamento após expiração: não liberar entrega nem baixar estoque; exigir revisão.
- Estorno parcial/total, contestação e segundo pagamento para o mesmo pedido: revisão obrigatória.
- Interrupção após criação da preferência e antes de salvar sua URL: nenhuma segunda preferência automática.
- Perfil de catálogo não acessa clientes/pedidos nem configurações privadas; visitante não cria pedidos diretamente no banco nem chama RPC financeira.
- Upload real permitido/negado por perfil, login/logout e sessão revogada.

## Entregas e decisões comerciais

**Correios PF:** a postagem à vista não implica acesso automático às APIs de preço/prazo. Não foram inventados fretes nem prazos. O checkout rejeita Correios enquanto a cotação não estiver implementada e configurada. Faltam CEP de origem confirmado, peso/dimensões das embalagens, serviços, política de seguro e opção de cotação (integração autorizada ou processo manual com confirmação antes do pagamento).

**Motoboy:** faltam taxa, CEPs/bairros, horários, prazo e procedimento para exceções. O modelo preparado usa taxa fixa para prefixos aprovados e exige Salvador/BA; taxas por distância ou por bairro exigem outra configuração.

**Retirada:** faltam endereço/horários e instruções aprovadas. Nenhuma retirada foi ativada.

**Comercial:** decidir cumulatividade, limites de cupom, descontos, parcelamento/juros, cancelamentos, devoluções e documentação fiscal com os responsáveis. O código não certifica adequação fiscal da operação como PF.

Fontes verificadas:

- [Mercado Pago: notificações e validação de assinatura](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/additional-content/notifications/webhooks).
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [ViaCEP: formato, CEP inexistente e limites de uso](https://viacep.com.br/).
- [Correios: pré-condições da API de prazos](https://www.correios.com.br/atendimento/developers/manuais/manual-api-prazo).
- [Correios: pré-postagem](https://www.correios.com.br/ppn/perguntas-frequentes).
- [Correios: comunicado sobre DC-e](https://saladeimprensa.correios.com.br/arquivos/13666). Verificar o documento fiscal aplicável ao negócio; não presumir dispensa de nota fiscal.

## Verificações reproduzíveis

```powershell
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
# Ferramenta de teste isolada; não altera dependências da aplicação:
npm install --prefix ./work/sql-test @electric-sql/pglite@0.5.9 --ignore-scripts --no-audit --no-fund --cache ./work/npm-cache
node scripts/verify-commerce-db.mjs
pnpm dev --host 127.0.0.1
# Em outro terminal; PLAYWRIGHT_MODULE pode apontar para a instalação local do Playwright:
node scripts/verify-commerce-browser.mjs
```

- 34 testes de código passaram, incluindo calendário, virada de ano, ano bissexto, limite de datas e leitura além do limite padrão da API.
- 68 asserções de integração PostgreSQL/WASM passaram, aplicando todas as migrações. Auth/Storage são estruturas simuladas; instalação/agendamento de `pg_cron` é omitida nesse teste. A função de expiração foi executada.
- Navegador Chrome: fluxo produto → checkout, validação de endereço, pagamento desativado e retorno em 390, 768 e 1440 px; sem erro de JavaScript e sem overflow horizontal. Imagens e resultados locais em `outputs/`, não versionados.
- Tipos, lint e build: consultar o resultado final da rodada no PR. O lint passou a ignorar diretório antigo `.sites-stage-*`, que continha artefatos gerados e não foi modificado.
- Sem compra externa, publicação, alteração de banco remoto, teste de serviços Auth/Storage reais ou medição de Core Web Vitals. SEO e direção visual não foram objeto desta implementação; retorno do pagamento marcado para não indexação.

## Teste local do painel sem credenciais

O script scripts/verify-admin-browser.mjs liga a interface às funções SQL reais em PostgreSQL/WASM. Auth, Storage e transporte PostgREST são simulados com dados fictícios, claramente separados da homologação externa. Não verifica login/upload hospedados, concorrência real ou rede do Supabase.

Em um terminal temporário PowerShell, iniciar um preview de teste separado:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL='https://admin-test.supabase.co'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_local_fixture'
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort
```

Em outro terminal, executar node scripts/verify-admin-browser.mjs. Encerrar o terminal temporário ao terminar para descartar as variáveis fictícias. O teste cobre filtros dia/semana/mês/ano, totais de 30 pedidos, CSV, falha/recuperação de relatório, paginação, busca vazia, edição/cadastro/busca de clientes, histórico individual, edição de coleção preservando URL, busca por SKU, reposição e histórico de estoque. Viewports: 390, 768 e 1440 px; screenshots em outputs/. Chaves desse cenário são apenas marcadores fictícios.

## Arquivos principais

- `app/components/admin-commerce.tsx`: módulos administrativos.
- `app/components/admin-dashboard.tsx`: navegação e vínculo correto do usuário autenticado.
- `app/components/admin-orders.tsx`: revisão de pagamento e rastreio.
- `app/components/checkout-client.tsx`: preparação/revisão de pedido de teste.
- `app/api/checkout/start/route.ts`: criação segura e preferência.
- `app/api/payments/mercado-pago/webhook/route.ts`: entrada de notificações.
- `lib/payments/{config,mercado-pago,webhook}.ts`: configuração, adaptador e validação.
- `lib/checkout/{sandbox,postal-code,details,quote}.ts`: validação e isolamento.
- `lib/catalog/promotion.ts`: preço por período.
- `supabase/migrations/20261013000751_commerce_checkout_operations.sql`: migração pendente de homologação.
- `scripts/verify-commerce-{db,browser}.*` e `tests/`: evidências reproduzíveis.

Referências consultadas nesta rodada: [funções com autorização](https://supabase.com/docs/guides/database/functions), [paginação](https://supabase.com/docs/reference/javascript/range) e [changelog](https://supabase.com/changelog).
