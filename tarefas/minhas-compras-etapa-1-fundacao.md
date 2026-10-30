# Minhas Compras · Etapa 1 · Fundação (banco, projeto e login)

## Contexto

Vamos criar um app novo, o **Minhas Compras**: um PWA de lista de compras de supermercado usado pela Mari e pelo Carlos (casal) dentro do mercado, no celular. Ele substitui uma lista simples que hoje está em https://cerulean-pavlova-9896ca.netlify.app/.

O app é **separado** do Nosso Plano (o app financeiro do casal): repositório próprio, deploy próprio na Vercel e ícone próprio no celular. Ele usa o **mesmo projeto Supabase** do Nosso Plano, para aproveitar o mesmo login.

- Projeto Supabase: `financas` (ref `krlmkcwigyabtsackjqo`, região sa-east-1)
- O Nosso Plano já tem, no esquema `public`:
  - a tabela `public.membros_casal (user_id uuid, nome text, created_at, updated_at)`, com 2 linhas: Mari e Carlos;
  - a função `public.eh_membro_casal()` (SQL, STABLE, SECURITY DEFINER), que retorna `true` quando `auth.uid()` está em `membros_casal`. As políticas RLS do Nosso Plano usam essa função.
- **Não mexa em nada do esquema `public`.** Nenhuma tabela, view, função ou política do Nosso Plano pode ser criada, alterada ou removida. O `public` já tem uma tabela `categorias` e uma `compras_cartao` do financeiro; por isso, tudo deste app fica num esquema próprio chamado **`mercado`**.

O design foi aprovado no Claude Design e está no ZIP anexo (`Shopping_list_app_design.zip`). As telas de referência são os arquivos `Minhas Compras v5.dc.html` e `Minhas Compras v5 - Telas.dc.html`. **A implementação final precisa ser fiel ao design** (cores, espaçamentos, bordas, ícones, tipografia Figtree e todos os detalhes visuais), não uma aproximação. Nesta etapa só entram o login e o esqueleto de navegação, mas já com os tokens visuais do design.

## Escopo desta etapa

Somente:
1. Banco: esquema `mercado`, tabelas, funções, RLS e Realtime (migração única).
2. Projeto: repositório novo, base do PWA, cliente Supabase apontando para o esquema `mercado`.
3. Login com o mesmo e-mail e senha do Nosso Plano, e bloqueio para quem não é membro do casal.
4. Casca de navegação: as 4 abas (Lista, Orçamento, Histórico, Ajustes) com o visual do design e telas vazias honestas ("Em construção" não; use o estado vazio real de cada tela, sem dados inventados).

**Fora desta etapa** (não implementar): telas completas da Lista, Orçamento, Histórico, Ajustes, modo offline, marca/preço, comparação de preços. **Não cadastre produtos, categorias nem histórico**: a carga inicial será feita depois, direto no banco, fora do Claude Code.

## 1. Stack

Use a **mesma stack e as mesmas convenções do Nosso Plano** (framework, bundler, linguagem, plugin de PWA, versão do `@supabase/supabase-js`, organização de pastas, padrão de autenticação, lint/format). O código do Nosso Plano provavelmente está na pasta `Documents\financas-pessoal`: confirme abrindo-a, **só para leitura**. Não altere nada nessa pasta. Se ela não for o Nosso Plano ou você não conseguir identificar a stack, **pare antes de criar o projeto** e pergunte. Não escolha por conta própria.

**Pasta do projeto:** use a pasta que a Mari já criou, `Documents\lista-compras` (ao lado de `financas-pessoal`). Não crie outra pasta. Antes de qualquer coisa, liste o conteúdo dela no relatório. Se ela não estiver vazia, **pare e pergunte** antes de apagar, sobrescrever ou mover qualquer arquivo que já esteja lá.

Repositório: `lista-compras` (mesmo nome da pasta), privado, no mesmo GitHub do Nosso Plano.

## 2. Banco de dados (migração `mercado_fundacao`)

Aplique via MCP do Supabase como **uma migração** (não SQL solto). Antes de aplicar, rode um diagnóstico e inclua o resultado no relatório: confirme que o esquema `mercado` não existe e que `public.eh_membro_casal()` existe com a definição descrita acima.

### Esquema e permissões
- `create schema mercado;`
- `grant usage on schema mercado to authenticated;`
- Nada para `anon`.
- Grants de tabela para `authenticated` conforme cada tabela abaixo; RLS ligado em **todas** as tabelas, com políticas usando `public.eh_membro_casal()`.

### Tabelas

**`mercado.categorias`**
- `id uuid pk default gen_random_uuid()`
- `nome text not null`, único sem diferenciar maiúsculas/acentos. A função `unaccent` não é IMMUTABLE e não pode ir direto num índice: crie `mercado.normalizar(text) returns text` IMMUTABLE que chama `extensions.unaccent('extensions.unaccent'::regdictionary, lower($1))` e use índice único em `mercado.normalizar(nome)`. A mesma função serve para a busca ignorar acentos.
- `ordem int not null` (ordem dos corredores, editável por arrastar)
- `created_at`, `updated_at timestamptz` (trigger de `updated_at` própria do esquema `mercado`, não reutilize a do `public`)

**`mercado.produtos`**
- `id uuid pk`
- `categoria_id uuid not null references mercado.categorias on delete restrict`
- `nome text not null`, único sem diferenciar maiúsculas/acentos
- `ativo boolean not null default true` (exclusão de produto = desativar, para preservar o histórico de preços)
- `created_at`, `updated_at`

**`mercado.lista_itens`**: o estado atual da lista (uma linha por produto que já entrou na lista)
- `produto_id uuid pk references mercado.produtos on delete cascade`
- `quantidade int not null default 0 check (quantidade >= 0)`
- `no_carrinho boolean not null default false`
- `marca text null` (marca escolhida nesta compra)
- `preco_unitario numeric(10,2) null check (preco_unitario > 0)`
- `marcado_por uuid null references auth.users` (quem marcou "peguei")
- `atualizado_por uuid null references auth.users`
- `updated_at timestamptz`

**`mercado.compras`**: compras finalizadas (Histórico)
- `id uuid pk`
- `data date not null`
- `mercado text null`
- `origem text not null check (origem in ('app','nota_fiscal'))`
- `total numeric(10,2) null` (preenchido nas compras feitas pelo app; `null` nas importadas de nota, que só têm preço unitário)
- `criada_por uuid null references auth.users`
- `created_at`

**`mercado.compra_itens`**
- `id uuid pk`
- `compra_id uuid not null references mercado.compras on delete cascade`
- `produto_id uuid not null references mercado.produtos on delete restrict`
- `marca text null`
- `quantidade int null check (quantidade > 0)` (`null` nas compras importadas de nota)
- `preco_unitario numeric(10,2) not null check (preco_unitario > 0)`
- índice em `(produto_id, compra_id)`

**`mercado.observacoes`**
- `id uuid pk`
- `texto text not null`
- `produto_id uuid null references mercado.produtos on delete set null`
- `resolvida boolean not null default false`
- `criada_por uuid references auth.users`, `created_at`

**`mercado.configuracoes`** (linha única)
- `id int pk default 1 check (id = 1)`
- `limite_gastos numeric(10,2) null`
- `manter_tela_acesa boolean not null default true`
- `updated_at`
- Insira a linha `id = 1` na migração.

### Funções (todas `security invoker`, `set search_path = mercado, public`)

1. **`mercado.ultimo_preco(p_produto uuid, p_marca text default null)`**: retorna `data`, `marca` e `preco_unitario` da compra mais recente do produto. Se `p_marca` for informada, considera só compras dessa marca. Base para "última R$ X" e para a regra de comparação do design (mesma marca → diferença com seta vermelha/verde; marca diferente → selo cinza "Outra marca · Pullman R$ 6,95 em 25/08"; marca já comprada antes → compara com a última compra **daquela marca**).
2. **`mercado.finalizar_compra(p_data date default current_date, p_mercado text default null)`**: transacional.
   - Cria a linha em `compras` (`origem = 'app'`) e copia para `compra_itens` todos os itens com `no_carrinho = true`.
   - Item no carrinho **sem preço**: a função **não** finaliza e retorna erro claro listando os produtos sem preço. Nunca grava preço zero ou inventado.
   - Calcula `total` = soma de `quantidade × preco_unitario`.
   - Depois zera `quantidade`, `no_carrinho`, `marca`, `preco_unitario` e `marcado_por` de **todas** as linhas de `lista_itens`. Produtos, histórico, observações e configurações ficam como estão.
   - Retorna o `id` da compra criada.
3. **`mercado.comparar_mesmos_itens(p_compra_anterior uuid default null)`**: para a tela de Orçamento. Soma, só para os produtos que estão no carrinho agora **e** foram comprados na compra anterior (a mais recente, se não informada), o preço unitário de hoje e o daquela compra. Retorna `total_hoje`, `total_anterior`, `diferenca`, `percentual`, `qtd_produtos` e a data da compra anterior. Nunca compara o total gasto até agora com o total da compra anterior.

### Políticas RLS
- Em todas as tabelas de `mercado`: `select`, `insert`, `update` e `delete` só quando `public.eh_membro_casal()`. Em `configuracoes`, sem `insert` nem `delete`.
- Teste as políticas no relatório: como `anon`, nenhuma leitura; como membro, leitura e escrita.

### Realtime
- Adicione `mercado.lista_itens` à publicação `supabase_realtime`, para o Carlos ver na hora o que a Mari marca, e vice-versa.

### Exposição na API (passo manual da Mari)
O cliente só enxerga o esquema `mercado` depois que ele é adicionado em **Supabase → Project Settings → Data API → Exposed schemas**. Não tente fazer isso por SQL. No relatório, deixe esse passo destacado para a Mari fazer no painel e, depois que ela confirmar, teste uma leitura real pelo cliente.

## 3. Projeto e PWA

- Cliente Supabase com `db: { schema: 'mercado' }`, usando as mesmas variáveis de ambiente (URL e chave publicável) do Nosso Plano, em `.env.local`, fora do Git.
- Manifest: nome "Minhas Compras", nome curto "Compras", `display: standalone`, `theme_color` e `background_color` tirados do design, ícones 192/512 e maskable (crie um ícone simples de carrinho na cor magenta do design; nada de marca de terceiros).
- Service worker registrado (cache do app shell). Offline completo fica para outra etapa.
- Tokens visuais do design centralizados (cores, raios, sombras, espaçamentos, fonte Figtree), extraídos dos arquivos `.dc.html`, não estimados.

## 4. Login

- Tela de login no visual do design (o design não tem essa tela: siga os componentes, campos e botões das telas existentes).
- E-mail e senha, `signInWithPassword`, no mesmo projeto: a Mari e o Carlos entram com o mesmo e-mail e a mesma senha do Nosso Plano.
- Depois do login, conferir se o usuário está em `membros_casal`. Se não estiver: tela "Acesso não liberado" e botão de sair. Nada de lista vazia fingindo que deu certo.
- Sessão persistente; botão "Sair" em Ajustes.
- Sem cadastro de conta, sem "esqueci a senha" (as contas já existem).

## 5. Casca de navegação

- Barra inferior com as 4 abas e os ícones do design (Lista, Orçamento, Histórico, Ajustes), com a aba ativa em magenta.
- Cabeçalho de cada tela como no design.
- Selo de conexão "Online" (ponto verde) / "Offline" (ponto âmbar), refletindo o estado real de `navigator.onLine` e da conexão Realtime.
- Cada aba mostra o estado vazio real que o design define (ex.: Lista vazia "Nenhum item para levar"), lendo do banco. Nenhum dado de exemplo do design pode aparecer no app.

## Regras gerais

- **Estados honestos:** nenhuma tela mostra valor inventado, sucesso falso ou falha silenciosa. Erro de rede vira estado de erro com mensagem clara, nunca mensagem de sucesso.
- **Nada de métricas deduzidas** no relatório: só o que foi medido ou executado de verdade.
- Comentários no código descrevem a regra inteira, não meia regra.
- Mudanças de banco só as descritas aqui. Qualquer necessidade fora disso: pare e pergunte.
- Sem dependências desnecessárias.

## Revisão adversarial (obrigatória)

Antes de relatar, revise o próprio trabalho tentando quebrá-lo:
- Algum objeto do esquema `public` foi tocado? (Liste o diff de objetos do `public` antes/depois.)
- Um usuário autenticado que **não** está em `membros_casal` consegue ler ou escrever algo em `mercado`? Teste.
- `finalizar_compra` com item no carrinho sem preço: falha sem alterar nada? Teste e mostre que a lista ficou intacta.
- `finalizar_compra` normal: confere `total`, itens copiados e lista zerada? Teste com dados temporários e **apague esses dados de teste no fim**, mostrando que as tabelas voltaram a ficar vazias (exceto `configuracoes`).
- `ultimo_preco` com e sem marca, e `comparar_mesmos_itens` sem compra anterior: retornam o esperado, sem erro?
- O cliente está mesmo usando o esquema `mercado` e nenhuma chave secreta foi parar no front ou no Git?

## Relatório final

Entregue, em português:
1. Diagnóstico pré-migração (resultado real das consultas).
2. Migração aplicada (nome e conteúdo resumido) e lista de objetos criados.
3. Resultado de cada teste da revisão adversarial (comando e saída real).
4. Estrutura de pastas do projeto e stack usada (confirmando que é a mesma do Nosso Plano).
5. Prints da tela de login, do bloqueio "Acesso não liberado" e das 4 abas vazias.
6. **Passos manuais pendentes para a Mari** (expor o esquema `mercado`, variáveis de ambiente na Vercel, se for o caso), em lista numerada e linguagem simples.
7. O que ficou de fora e qualquer dúvida.

Não faça deploy em produção nesta etapa.

Leia o minhas-compras-etapa-1-fundacao.md e execute. Pare ao final para aprovação.
