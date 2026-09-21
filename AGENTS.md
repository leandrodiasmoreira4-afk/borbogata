# Borbogata — padrão L7

Use a skill pessoal `l7-developer-master` em qualquer alteração estrutural deste projeto.

- Preservar a identidade visual da Borbogata.
- Manter a Borbogata em projeto e banco exclusivos; usar a arquitetura parametrizada para replicar uma nova instância isolada para cada cliente.
- Usar Supabase/PostgreSQL como fonte de verdade para catálogo, estoque, pedidos e painel.
- Manter RLS em toda tabela exposta e segredos somente no servidor.
- Identificar dados demonstrativos claramente.
- Validar celular, desktop, lint, tipos e build antes de publicar.
