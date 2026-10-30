# Minhas Compras · Etapa 6 · Tamanho do produto e preço por medida

## Contexto

O app está publicado (https://lista-compras-frontend-phi.vercel.app, Vercel ligada ao GitHub, Root Directory `frontend`) e aprovado pela Mari. Código em `Documents\lista-compras\frontend`, cache do service worker em `minhas-compras-v6`.

A Mari quer informar o **tamanho** de cada produto (ex.: Toddy 700 g em vez de 400 g) sem cadastrar um produto novo, e ver **se o pacote maior compensa**.

### O banco já foi alterado (migração `mercado_tamanho`, aplicada e testada)
- `lista_itens` e `compra_itens` ganharam `tamanho_qtd numeric(10,3)` e `tamanho_unidade text`.
  - Unidades aceitas: `g`, `kg`, `ml`, `l`, `un`, `rolos`, `m`.
  - Os dois campos são preenchidos juntos ou ficam os dois nulos (o banco recusa só um deles).
- Funções novas: `mercado.tamanho_familia(unidade)` → `massa` (g, kg), `volume` (ml, l), `un`, `rolos`, `m`; `mercado.tamanho_base(qtd, unidade)` → quantidade na unidade base da família (kg e l × 1000).
- `mercado.finalizar_compra` agora copia o tamanho para `compra_itens` e zera o tamanho na lista.
- `mercado.comparar_mesmos_itens` agora considera o tamanho:
  - mesmo tamanho, ou tamanho desconhecido em algum lado (compras antigas): compara o preço unitário;
  - tamanhos diferentes da mesma família: ajusta o preço anterior para o tamanho de hoje;
  - famílias diferentes (ex.: g contra rolos): o par fica de fora.
- As compras antigas (notas fiscais) estão com tamanho nulo.

O app já está em uso pela Mari. **Antes de qualquer teste, anote o estado do banco** (pelo cliente da sessão): contagem de categorias e a ordem, produtos (ativos e total, com os nomes criados nos últimos dias), compras, compra_itens, as linhas de `lista_itens` (produto, quantidade, carrinho, marca, preço, tamanho), observações e configurações. **No fim, volte exatamente a esse estado**, sem apagar nem alterar nada que já existia (por exemplo, o produto "Teste" e os itens Arroz 5kg e Bala no carrinho, criados pela Mari no celular). Apague só o que os testes criarem e, se mexer numa linha que já existia, devolva os valores originais.

**Supabase:** modo Automático. **Não use o MCP do Supabase** e não altere o banco. Tudo pelo app, com o login da Mari no painel.

## 1. Campo de tamanho na linha aberta da Lista

- Ao lado do chip de marca, um chip **"Tamanho"** com o valor atual ("700 g", "1 kg", "12 rolos") ou "Tamanho" vazio.
- Tocar abre uma folha com:
  - os **tamanhos já comprados** deste produto (da marca escolhida primeiro), cada um com o último preço e a data: "400 g · última R$ 9,60 · 31/10";
  - **"Outro tamanho…"**: campo numérico (aceita vírgula) + escolha da unidade (g, kg, ml, l, un, rolos, m);
  - **"Sem tamanho"**, que limpa os dois campos.
- **Pré-preenchimento** (sem gravar até a Mari mexer na linha, igual à marca na Etapa 2): o tamanho da linha; se não houver, o da última compra **da mesma marca**; se não houver, o da última compra do produto; se não houver, vazio. Ao trocar de marca, se o tamanho ainda veio do pré-preenchimento, troque pelo da nova marca.
- Gravação: junto com a linha, na mesma fila e nas mesmas regras da Etapa 4 (offline, juntar mudanças, desfazer se o servidor recusar). Grave os dois campos sempre juntos.
- **Formatação:** número no padrão brasileiro, sem zeros sobrando ("0,7 kg", "700 g", "1,5 l", "12 rolos", "30 un", "7,5 m").

## 2. Textos das linhas

- Linha fechada: "Toddy · 700 g · 2 un. · última R$ 16,10" (sem tamanho: como hoje). Quantidade 0: "Toddy · 700 g · última R$ 16,10".
- Carrinho: "Toddy · 700 g · 2 × R$ 16,10". Se faltar espaço, corte a marca primeiro, depois o tamanho. **A conta nunca é cortada.**
- Histórico (detalhe da compra): "Marca · 700 g · 2 × R$ 8,05" ou "Marca · 700 g" quando não há quantidade.

## 3. Preço por medida

- Mostre na linha aberta (abaixo do total da linha), na folha do produto e no detalhe da compra, quando houver tamanho e preço:
  - massa → **por kg** ("R$ 23,00/kg"); volume → **por litro**; un → **por unidade**; rolos → **por rolo**; m → **por metro**.
- Arredonde para 2 casas. Nunca mostre preço por medida sem tamanho informado.

## 4. Regra de comparação (`precos.js`, usada em Lista, Orçamento, Histórico e folha do produto)

Para o preço digitado numa linha (ou um item de uma compra), procure a referência nesta ordem:

1. **Mesma marca e mesmo tamanho** (mesma família e mesma quantidade base): compara o preço unitário. Selo colorido como hoje ("▲ R$ 0,40 (+5%)").
2. **Mesma marca, tamanho diferente da mesma família:** compara o **preço por medida**. Selo colorido com a medida: "▼ R$ 1,00/kg (−4%)" e, ao lado, "vs. 400 g a R$ 9,60 em 31/10".
3. **Mesma marca, tamanho desconhecido em um dos lados** (compras antigas sem tamanho): compara o preço unitário como hoje, com a observação discreta "tamanho não informado na compra anterior" quando o lado sem tamanho for o antigo.
4. **Marca diferente:** selo cinza, como hoje. Quando os dois lados tiverem tamanho da mesma família, acrescente o preço por medida dos dois: "Outra marca · Pullman 500 g R$ 6,95 (R$ 13,90/kg) em 25/08".
5. **Famílias diferentes** (ex.: g contra rolos): selo cinza "Embalagem diferente", sem seta.

Produto sem marca nas duas compras conta como "mesma marca".

Aplique a mesma regra:
- nos destaques "mais caros / mais baratos" do detalhe da compra (entram os casos 1 e 2; ordenar pelo percentual);
- na estimativa do Orçamento (preço de referência: mesma marca e mesmo tamanho; senão, preço por medida × tamanho da linha; senão, a regra atual);
- na folha do produto:
  - se pelo menos 2 compras tiverem tamanho da mesma família, o gráfico e os cartões Menor, Maior e Média passam a usar o **preço por medida**, com o rótulo "R$/kg" (ou a medida certa); senão, continuam com o preço unitário;
  - a lista de compras mostra "dd/mm/aaaa · Marca · 700 g".

O cartão "Mesmos itens" continua usando `comparar_mesmos_itens` (já ajustada no banco). Acrescente "ajustado pelo tamanho" na linha de baixo quando algum par tiver sido ajustado. Calcule isso no cliente, com a mesma regra, só para decidir se mostra o texto.

## 5. Cache e versão

- Inclua os campos novos no IndexedDB e na fila.
- Troque o cache para `minhas-compras-v7`.

## Regras gerais

Estados honestos, R$ e números no padrão brasileiro, áreas de toque de 44 px, sem mudança no banco e sem dependências novas.

## Testes (login da Mari no painel, 390 × 844)

Para testar comparações, crie pelo cliente supabase-js da sessão **duas compras de teste** (`origem = 'nota_fiscal'`) com o produto real "Achocolatado em pó":
- compra de 30/10/2026: marca 3 Corações, 200 g, R$ 5,99;
- compra de 31/10/2026 (a mais recente): marca Toddy, 400 g, R$ 9,60.

Apague as duas no fim.

1. Linha aberta do Achocolatado, marca Toddy: o tamanho vem pré-preenchido com 400 g; trocar para "Outro tamanho…" 0,7 kg; preço 16,10 → "R$ 23,00/kg" e selo "▼ R$ 1,00/kg (−4%)" com "vs. 400 g a R$ 9,60 em 31/10".
2. Mesmo produto, 400 g a 9,60 → "= mesmo preço" (caso 1).
3. Trocar a marca para 3 Corações → o tamanho vira 200 g (pré-preenchido); trocar para Nescau (marca nova) → selo cinza com o preço por medida da última compra.
4. Tamanho em "rolos" contra a compra em g → "Embalagem diferente".
5. Tentar gravar só o número sem unidade é impossível pela tela (a unidade é obrigatória para salvar).
6. Carrinho com marca longa + tamanho: a conta inteira aparece.
7. Orçamento: "Mesmos itens" com o Achocolatado 0,7 kg a 16,10 no carrinho → R$ 16,10 contra R$ 16,80, "▼ R$ 0,70 (−4,2%)" e "ajustado pelo tamanho".
8. Folha do Achocolatado: lista com os tamanhos; gráfico/cartões em R$/kg só se houver 2 ou mais compras com tamanho de massa.
9. Offline: mudar o tamanho sem internet → fica pendente e sobe certo ao voltar.
10. Finalizar uma compra de teste com tamanho: o detalhe mostra "Toddy · 700 g · 1 × R$ 16,10". Apague essa compra.
11. Restaurar e mostrar, lado a lado, o estado anotado no início e o estado final (têm de ser iguais), confirmando que nenhum `compra_itens` antigo ficou com tamanho preenchido.

## Revisão adversarial (obrigatória)

- Algum selo colorido compara tamanhos diferentes sem converter, ou marcas diferentes?
- O pré-preenchimento pode gravar um tamanho que a Mari não escolheu?
- Algum caminho grava só um dos dois campos de tamanho?
- O preço por medida aparece sem tamanho ou com unidade errada (ex.: R$/kg para ml)?
- A fila offline perde o tamanho ao juntar mudanças?
- Algum teste deixou dado no banco?

## Relatório final

1. O que foi feito, por item.
2. Resultado de cada teste, com números reais.
3. Prints em 390 × 844: chip e folha de tamanho; linha com preço por medida e selo ajustado; selo cinza de outra marca com R$/kg; "Embalagem diferente"; carrinho com tamanho; "Mesmos itens" ajustado; folha do produto com tamanhos.
4. Contagens finais do banco.
5. O que ficou de fora e dúvidas.

Não faça commit nem deploy antes da aprovação.

Leia o minhas-compras-etapa-6-tamanho.md e execute. Pare ao final para aprovação.
