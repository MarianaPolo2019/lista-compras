# Minhas Compras · Etapa 3 · Orçamento, Histórico, finalizar compra e folha do produto

## Contexto

A Etapa 2 (aba Lista) está aprovada, commitada (`0313d22`) e enviada ao GitHub. O app está em `Documents\lista-compras\frontend`, na mesma stack do Nosso Plano.

O banco (esquema `mercado`, projeto `financas`) tem hoje:
- 8 categorias e 63 produtos;
- 4 compras importadas de nota fiscal (25/05, 25/06, 25/08 e 29/10/2026), com 138 itens. As três primeiras têm `total` nulo e `quantidade` nula; a de 29/10 tem `total = 715.28` e quantidade em cada item;
- `lista_itens`, `observacoes` vazias e `configuracoes.limite_gastos` nulo.

Funções já existentes no banco (não altere):
- `mercado.finalizar_compra(p_data date, p_mercado text)`: copia o carrinho para `compras`/`compra_itens` com `origem = 'app'`, calcula o total e zera **todas** as linhas de `lista_itens` (quantidade, carrinho, marca, preço, quem marcou). Falha com mensagem clara se o carrinho estiver vazio ou se algum item do carrinho estiver sem preço ou com quantidade 0. Retorna o `id` da compra.
- `mercado.comparar_mesmos_itens(p_compra_anterior uuid default null)`: soma, só para produtos que estão no carrinho com preço **e** foram comprados na compra anterior (a mais recente, se não informada), o preço unitário de hoje e o daquela compra. Retorna `compra_data`, `total_hoje`, `total_anterior`, `diferenca`, `percentual` (1 casa) e `qtd_produtos`.

Referência visual: design aprovado (`design/Shopping list app design vs2`), telas **6c** (Orçamento), **6d** (estourado), **6e** (Histórico), **6f** (detalhe da compra), **7a** (reiniciar), **7c** (excluir produto) e **7d** (folha do produto). Implementação fiel ao design.

**Supabase:** a sessão está no modo Automático. **Não use o MCP do Supabase.** Tudo pelo app, com o login da Mari no painel. Esta etapa **não** prevê mudança no banco. Se precisar, pare e pergunte.

## Escopo

1. Acabamentos da Lista (2 itens).
2. Aba Orçamento completa, incluindo Observações e o botão "Reiniciar lista".
3. Aba Histórico e detalhe da compra.
4. Folha do produto (histórico de preços), com editar nome, mudar categoria e excluir.

Fora desta etapa: aba Ajustes (gerenciar categorias e a lista de produtos) e modo offline com fila. Não mexa nelas.

## 1. Acabamentos da Lista (pedidos na revisão da Etapa 2)

- **No carrinho, nunca cortar a conta.** Hoje aparece "Empório São João · 2 × R$ 27,…". A parte "2 × R$ 27,50" tem de aparecer sempre inteira; quem é cortado com reticências é a marca.
- **Itens com quantidade 0:** a linha fechada mostra só "Marca · última R$ 7,99" (sem "0 un."). Com quantidade ≥ 1, continua "Marca · 2 un. · última R$ 7,99".
- Na linha aberta, acrescente o link discreto **"Histórico de preços ›"** que abre a folha do produto (item 4).

## 2. Orçamento (telas 6c e 6d)

### Cabeçalho
"Orçamento" e, embaixo, "X comprados · Y pendentes" (comprados = no carrinho; pendentes = quantidade ≥ 1 fora do carrinho).

### Limite de gastos
- Campo "Valor máximo" em R$ (teclado decimal, vírgula ou ponto). Grava em `configuracoes.limite_gastos` com debounce de ~600 ms e ao sair do campo. Campo vazio grava `null`.
- Sem limite: "Nenhum limite de gastos definido." e nenhuma barra.
- Com limite: "R$ 312,40 de R$ 600,00" e o percentual à direita, com a barra **verde até 80%**, **âmbar de 80% a 100%** e **vermelha acima de 100%**. Gasto = total do carrinho (só itens com preço).
- Acima de 100%: o alerta 6d "▲ Orçamento estourado · Você passou R$ X do limite."

### Resumo da compra (4 cartões)
Total gasto, Saldo restante (limite − gasto; negativo em vermelho com "−"; sem limite: "—"), Itens comprados, Itens pendentes.

### Estimativa do que falta
- Entram os itens pendentes **e** os do carrinho ainda sem preço.
- Preço de referência de cada um: o preço já digitado na linha; se não houver, o último preço **da marca da linha**; se a linha não tiver marca ou essa marca nunca foi comprada, o último preço do produto.
- Mostre "Estimativa do que falta · R$ X" e "Se pegar tudo, o total vai a R$ Y" (Y = gasto + X).
- Itens sem nenhum preço conhecido **não entram na conta** e aparecem honestamente: "2 itens sem preço conhecido ficaram de fora". Nunca invente valor.

### Mesmos itens na compra anterior
- Use `mercado.comparar_mesmos_itens()`.
- Com `qtd_produtos > 0`: "Mesmos itens na compra de 29/10", o selo "▲ R$ 8,40 (+4,1%)" (vermelho subiu, verde caiu, "=" igual; seta e cor juntas) e "Comparando 18 produtos".
- Com 0: "Os itens do carrinho ainda não têm par na compra de 29/10." (ou "Sem compra anterior para comparar." se não houver compras).
- Atualize quando o carrinho mudar (mudanças locais e do Realtime).

### Observações
- Lista das observações com `resolvida = false`, a mais recente primeiro, e um campo para adicionar nova ("Ex.: catchup acabou na 2ª semana").
- Cada observação tem **"+ Adicionar à lista"**:
  - abre a escolha de produto: busca nos produtos ativos (mesma normalização sem acento) e, se não achar, "Cadastrar '[texto]'" com a escolha de corredor da Etapa 2;
  - ao escolher, soma 1 na quantidade do produto na lista e marca a observação como `resolvida = true` (com `produto_id` preenchido).
- Cada observação pode ser apagada (ícone de lixeira, com confirmação).

### Reiniciar lista (nova compra) · tela 7a
Botão contornado no fim da aba. Ao tocar:
1. **Carrinho vazio:** aviso "O carrinho está vazio. Marque os itens que você pegou antes de salvar a compra." e nada acontece.
2. **Item no carrinho sem preço ou com quantidade 0:** aviso listando os nomes ("Falta o preço de: Arroz 5kg, Pão de forma") com o botão "Ir para o carrinho", que abre a Lista no filtro Carrinho. Nada é salvo.
3. **Tudo certo:** o diálogo 7a, com:
   - **Salva:** "A compra vai para o Histórico com data, itens, quantidades, marcas e preços." Mostre o total que será salvo.
   - **Zera:** "Quantidades e marcações." Se houver itens pendentes que não foram pegos, diga quantos: "3 itens que não foram pegos voltam para 0."
   - **Mantém:** "Produtos, histórico de preços, limite e observações."
   - Campo "Mercado", pré-preenchido com o mercado da última compra ("Atacadão"), editável.
   - Botões "Salvar e reiniciar" e "Cancelar".
4. Ao confirmar, chame `mercado.finalizar_compra(p_data, p_mercado)` com **`p_data` = data de hoje no fuso de São Paulo** (não use a data padrão do banco, que está em UTC e erraria compras feitas à noite).
5. Sucesso: aviso "Compra salva no Histórico" e abra o detalhe dessa compra. Erro: mostre a mensagem real da função e não mexa em nada na tela.

## 3. Histórico (tela 6e) e detalhe da compra (tela 6f)

### Lista de compras
- Título "Histórico" e "N compras finalizadas".
- Mais recente primeiro: data (dd/mm/aaaa), "N itens · Mercado", total à direita (nulo: "—"), selo "Nota fiscal" quando `origem = 'nota_fiscal'`.
- Variação do total contra a compra anterior **só quando as duas têm total**; se alguma não tiver, não mostre selo (nada inventado). A mais antiga mostra "primeira compra".
- Toque abre o detalhe.

### Detalhe (somente consulta)
- Voltar, data, total e "N itens · vs. dd/mm" (compra anterior).
- **Mais caros nesta compra** e **Mais baratos nesta compra** (até 3 cada): compare o preço unitário de cada produto com a última compra **anterior a esta** do mesmo produto e **da mesma marca**. Produto que mudou de marca ou não tinha compra anterior fica fora dos destaques. Ordene por percentual.
- Itens agrupados por corredor (`categorias.ordem`), em ordem alfabética:
  - nome; embaixo "Marca · 3 × R$ 7,99" quando há quantidade, ou só "Marca" quando a quantidade é nula;
  - à direita, o total da linha quando há quantidade, ou o preço unitário com "un." quando não há;
  - selo pequeno da variação (mesma regra dos destaques; marca diferente: sem selo).
- Tocar no nome do produto abre a folha do produto.

## 4. Folha do produto (tela 7d)

Abre de baixo para cima a partir do link "Histórico de preços ›" da Lista e do detalhe da compra.
- Nome, categoria, "Último preço · Marca" com o valor grande e o selo contra a compra anterior **da mesma marca** ("vs. compra de 25/08"); se a marca anterior for outra, selo cinza "Outra marca · Pullman R$ 6,95 em 25/08".
- **Gráfico de linha** do preço unitário ao longo das compras (SVG feito à mão, sem biblioteca), com o mês embaixo de cada ponto e o último ponto preenchido. Um ponto só: mostre o ponto. Nenhuma compra: "Ainda sem compras registradas."
- Cartões **Menor**, **Maior** e **Média**, com a marca embaixo de menor e maior.
- Lista de todas as compras: "dd/mm/aaaa · Marca" e o preço.
- Ações:
  - **Editar**: renomear. O índice único do banco recusa nomes repetidos (sem diferenciar acento e maiúscula): mostre a mensagem real.
  - **Mudar categoria**: lista dos corredores.
  - **Excluir produto** (link vermelho, com o diálogo 7c "O produto sai da lista e do cadastro. O histórico de compras e de preços dele é mantido."): marque `ativo = false` e apague a linha dele em `lista_itens`, se houver. Se o produto estiver no carrinho, não exclua: avise "Tire o produto do carrinho antes de excluir."
  - Produtos com `ativo = false` somem da Lista, mas continuam aparecendo no Histórico.

## Regras gerais

- Estados honestos: nada de valor inventado, sucesso falso ou falha silenciosa. Toda gravação com atualização otimista é desfeita na tela se falhar, com o aviso da Etapa 2.
- Valores em R$ no formato brasileiro, números tabulares, áreas de toque de pelo menos 44 px.
- Datas exibidas e calculadas no fuso de São Paulo.
- Sem mudanças no banco e sem dependências novas.

## Testes (login da Mari no painel, 390 × 844)

**Estado inicial que tem de ser restaurado no fim:** `compras` = 4, `compra_itens` = 138, `lista_itens` = 0, `observacoes` = 0, `configuracoes.limite_gastos` = nulo, produtos ativos = 63. Use o cliente supabase-js da sessão logada para conferir e para apagar só o que o teste criou. Mostre as contagens finais.

1. Lista: carrinho com "Empório São João · 2 × R$ 27,50" mostrando a conta inteira; item zerado sem "0 un.".
2. Orçamento sem limite: textos e "—" corretos. Definir R$ 100: barra verde/âmbar/vermelha conforme o carrinho (mostre os três estados) e o alerta de estourado.
3. Estimativa: com um item pendente de preço conhecido e outro sem nenhum histórico (crie o produto de teste pelo "Adicionar" e apague no fim), mostre o valor e o aviso "1 item sem preço conhecido ficou de fora".
4. Mesmos itens: feijão carioca no carrinho a R$ 8,50 → comparação contra R$ 8,09 de 29/10 (+R$ 0,41, +5,1%, 1 produto).
5. Observação: criar "Acabou o café", "Adicionar à lista" → Café em pó com quantidade 1 e observação resolvida.
6. Reiniciar com item sem preço: aviso com o nome e nada salvo. Reiniciar com carrinho completo: diálogo com total, pendentes que voltam a 0 e mercado "Atacadão"; confirmar; a compra aparece no Histórico com a data de hoje (São Paulo), o total certo e `origem = 'app'`; a lista fica zerada. **Depois apague essa compra de teste** (os itens saem em cascata).
7. Histórico: 4 compras; 29/10 com R$ 715,28 e sem selo de variação (25/08 não tem total); detalhe de 29/10 com destaques (ex.: Feijão carioca Kicaldo R$ 8,09 vs R$ 7,59 de 25/08 em "mais caros") e itens com "3 × R$ 8,09 · R$ 24,27".
8. Folha do produto: Pão de forma com 4 pontos no gráfico, menor R$ 6,95 (Pullman), maior R$ 8,99 (Panco), lista com as marcas; último R$ 7,99 Panco com selo "▲ R$ 1,00 (+14%)" contra R$ 6,99 Panco de 25/06.
9. Editar/mudar categoria/excluir: use o produto de teste do item 3 (não mexa em produtos reais); excluir com ele no carrinho é bloqueado; fora do carrinho, some da Lista. No fim, apague o produto de teste de verdade.
10. Contagens finais iguais ao estado inicial.

## Revisão adversarial (obrigatória)

- A data da compra salva à noite sai certa (fuso de São Paulo)?
- Algum caminho chama `finalizar_compra` com item sem preço ou com o carrinho vazio sem avisar antes?
- A estimativa soma algum valor inventado ou ignora sem avisar os itens sem preço?
- O Histórico mostra variação entre compras quando uma delas não tem total?
- Destaques ou selos comparam marcas diferentes como se fossem a mesma?
- Excluir produto apaga histórico ou deixa linha órfã em `lista_itens`?
- Algum teste deixou dado a mais no banco?

## Relatório final

1. O que foi feito, por item.
2. Resultado de cada teste com os números reais da tela.
3. Prints em 390 × 844: Lista com os dois acabamentos; Orçamento sem limite, dentro do limite e estourado; estimativa com aviso; mesmos itens; observações; diálogo 7a; aviso de item sem preço; Histórico; detalhe de 29/10; folha do Pão de forma; diálogo de excluir.
4. Contagens finais do banco.
5. O que ficou de fora e dúvidas.

Não faça commit nem deploy antes da aprovação.

Leia o minhas-compras-etapa-3-orcamento-historico.md e execute. Pare ao final para aprovação.
