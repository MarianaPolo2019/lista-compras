# Minhas Compras · Etapa 2 · Tela da Lista

## Contexto

A Etapa 1 está aprovada e commitada (`d284028`, repositório `lista-compras`, branch `main`, já enviado ao GitHub). O app está em `Documents\lista-compras\frontend`, na mesma stack do Nosso Plano (HTML/CSS/JS puro com ES modules, sem build, `supabase-js@2` do esm.sh, rotas por hash, `config.js` com a chave anon).

O banco já está pronto no esquema `mercado` (projeto Supabase `financas`) e **tem dados reais**:
- 8 categorias, com a ordem dos corredores em `categorias.ordem`;
- 63 produtos;
- 4 compras importadas de nota fiscal em `compras`/`compra_itens` (25/05, 25/06, 25/08 e 29/10/2026). As três primeiras têm só preço unitário (`quantidade` nula); a de 29/10 tem quantidade e `total = 715.28`;
- `lista_itens` está **vazia** (nenhum produto na lista ainda);
- funções disponíveis: `mercado.ultimo_preco(p_produto, p_marca)`, `mercado.finalizar_compra(...)`, `mercado.comparar_mesmos_itens(...)`, `mercado.normalizar(text)`.

A referência visual continua sendo o design aprovado (`design/Shopping list app design vs2`, arquivos `Minhas Compras v5.dc.html` e `Minhas Compras v5 - Telas.dc.html`, telas 5a a 5e e 6a/6b). **A implementação tem de ser fiel ao design** em cores, espaçamentos, bordas, ícones e tipografia, com as mudanças descritas abaixo, que a Mari pediu depois de usar a lista no mercado.

**Importante sobre o Supabase:** esta sessão roda no modo Automático, que recusa chamadas diretas ao Supabase (MCP). **Não use o MCP do Supabase.** Toda leitura e gravação acontece pelo app, com o login da Mari no painel do navegador. Se precisar de qualquer mudança no banco (tabela, coluna, função, política), **pare e pergunte**. Esta etapa não prevê nenhuma.

## Escopo desta etapa

Só a aba **Lista**, completa. Fora desta etapa: Orçamento, Histórico, detalhe do produto (folha com gráfico), Ajustes, modo offline com fila de sincronização e o botão "Reiniciar lista" (`finalizar_compra`). Não mexa nessas telas, exceto o que for preciso para a navegação continuar funcionando.

## 1. Cabeçalho (fixo no topo)

- Título "Compras" e selo de conexão (Online, ponto verde / Offline, ponto âmbar), como na Etapa 1.
- À direita: o **total do carrinho** em R$ e, embaixo, **"X de Y itens"**. X = itens no carrinho; Y = itens no carrinho + itens a levar. Essa linha faltou na Etapa 1.
- Seletor com 3 opções, sempre no formato "Nome · N" (espaço antes e depois do ponto):
  - **Todos · N**: produtos ativos que **não** estão no carrinho;
  - **A levar · N**: quantidade ≥ 1 e fora do carrinho;
  - **Carrinho · N**: `no_carrinho = true`.
- O filtro escolhido fica salvo no aparelho (localStorage, com try/catch) e volta igual ao reabrir.

## 2. Busca

- Campo com o ícone de lupa do design, logo abaixo do seletor.
- Ignora maiúsculas e acentos ("acucar" acha "Açúcar refinado"). Normalize no cliente com `normalize('NFD')` + remoção de diacríticos + `toLowerCase`.
- Enquanto há texto, a busca **ignora o filtro** e mostra todos os produtos que batem, inclusive os zerados e os do carrinho, para dar para aumentar a quantidade direto.
- Botão × para limpar.
- Sem resultado: estado 6b do design, com o botão **"Adicionar '[texto]'"**. Ao tocar, abre uma escolha simples de categoria (lista das categorias). Ao escolher, cria o produto (primeira letra maiúscula), já põe quantidade 1 e limpa a busca. Se o nome já existir (o índice único do banco ignora acento e maiúscula), mostre a mensagem de erro real, sem criar duplicado.

## 3. Atalhos de categoria (mudança pedida pela Mari)

- **Uma linha só, rolando para o lado**, sem quebrar linha, para economizar tela.
- Atalhos em **ordem alfabética** (pt-BR). As seções da lista continuam na ordem dos corredores (`categorias.ordem`).
- Deslizar com o dedo no celular **e arrastar clicando com o mouse** no computador (pointer events, arrastar não pode disparar o toque do atalho). Sem barra de rolagem visível.
- Formato "Mercearia · 5", com N = itens a levar daquela categoria. No filtro "A levar", esconda os atalhos com 0.
- Tocar no atalho rola até a seção, descontando a altura real do cabeçalho fixo (a seção não pode ficar escondida atrás dele).
- Escondidos no filtro "Carrinho" e durante a busca.

## 4. Lista

- Seções na ordem dos corredores. Cabeçalho da seção em maiúsculas e, à direita, "N a levar".
- Dentro da seção, ordem alfabética (pt-BR, sem diferenciar acento).
- Filtro "Todos": todos os produtos fora do carrinho; os com quantidade 0 ficam apagados (como no design) e cada linha fechada tem o botão **+** rosa, que soma 1 sem abrir a linha.
- Filtro "A levar": só quantidade ≥ 1 e fora do carrinho.
- Em "Todos" e "A levar", o bloco **"No carrinho · N"** fica no fim, com o total do carrinho à direita. No filtro "Carrinho", só esse bloco aparece.

### Linha fechada
- Círculo de marcar, nome (uma linha, com reticências se precisar) e, embaixo, em texto pequeno: **"Marca · 2 un. · última R$ 8,99"**.
  - Marca: a de `lista_itens.marca`; se não houver, a da última compra do produto; se nunca foi comprado, omita.
  - "última": preço da última compra do produto (qualquer marca). Nunca comprado: "primeira compra".

### Linha aberta (tocar no nome abre; tocar de novo fecha; só uma aberta por vez)
- **Chip de marca** (5d do design): pré-preenchido com a marca atual. Ao tocar, abre a lista das marcas já compradas desse produto, cada uma com o último preço e a data ("Panco · última R$ 7,99 · 29/10"), mais **"Outra marca…"**, que permite digitar uma nova. Produto sem nenhuma marca no histórico: chip "Marca" vazio, só com "Outra marca…".
- **Contador** − N + (mínimo 0).
- **Campo de preço** "R$", teclado numérico decimal, aceitando vírgula ou ponto, gravado com 2 casas.
- **Total da linha** (pedido da Mari depois do mercado): com quantidade > 1 e preço preenchido, mostrar **"3 × R$ 7,99 = R$ 23,97"** logo abaixo do contador/preço, atualizando enquanto ela digita ou muda a quantidade.
- **Selo de comparação de preço**, logo abaixo:
  - Referência: a última compra **da mesma marca** escolhida. Se a linha não tem marca, a referência é a última compra do produto.
  - Preço maior: selo vermelho "▲ R$ 0,40 (+5%)"; menor: verde "▼ R$ 0,30 (−4%)"; igual: "= mesmo preço". Use seta e cor juntas, nunca só cor. Percentual arredondado para inteiro.
  - Marca escolhida nunca comprada, mas o produto tem histórico: selo **cinza, sem seta**: "Outra marca · Pullman R$ 6,95 em 25/08".
  - Produto sem nenhum histórico: "primeira compra".

### Marcar como pego
- Tocar no círculo: `no_carrinho = true` e `marcado_por = usuário atual`. O item vai para o bloco "No carrinho".
- Marcado **sem preço**: a linha já abre pedindo o preço, com o aviso "Digite o preço para somar no carrinho". Até ter preço, a linha do carrinho mostra **"sem preço"** à direita e não soma no total.
- Tocar de novo no círculo desmarca e o item volta para a seção dele.

### Linha no carrinho
- Círculo verde com ✓, nome riscado, embaixo "Marca · 3 × R$ 7,99" (ou "Marca · 1 un."), à direita o **total da linha**, e as **iniciais de quem marcou** (M / C, com as mesmas cores dos Ajustes).
- Pode abrir para corrigir preço, marca ou quantidade.

## 5. Gravação no banco

- `lista_itens` tem uma linha por produto que já entrou na lista. Na primeira alteração de um produto, faça `upsert` por `produto_id`. Não crie linhas para produtos que não foram tocados.
- Atualização otimista: a tela muda na hora. Se a gravação falhar, desfaça a mudança na tela e mostre um aviso claro ("Não foi possível salvar. Verifique a conexão."). **Nunca** deixe a tela mostrando algo que não foi salvo.
- Preço digitado: grave com um pequeno atraso (debounce, ~600 ms) e também ao sair do campo; não grave a cada tecla.
- `atualizado_por` e `updated_at` são preenchidos por trigger no banco. Não envie esses campos.
- Preço vazio grava `null` (nunca 0).

## 6. Dados para preço e marca

- Ao abrir a aba, carregue uma vez `compra_itens` com a data da compra (são poucas centenas de linhas) e calcule no cliente: última compra por produto e última compra por produto + marca (marca comparada sem acento e sem maiúscula). Não chame `ultimo_preco` produto a produto.
- Recarregue esse histórico só quando a tela voltar ao primeiro plano.

## 7. Tempo real (Mari e Carlos)

- Assine as mudanças de `mercado.lista_itens` pelo Realtime. Quando chegar uma mudança do outro aparelho, atualize a linha na tela.
- Não sobrescreva o campo que está sendo editado naquele momento; aplique a mudança remota quando o campo perder o foco.
- Se o Realtime cair, o selo vira "Offline" e volta para "Online" quando reconectar, recarregando a lista.

## 8. Tela acesa

- Se `configuracoes.manter_tela_acesa` for verdadeiro, peça o Wake Lock com a aba Lista aberta e peça de novo quando o app volta ao primeiro plano. Sem suporte: segue sem erro e sem aviso.

## 9. Estados para conferir

- Lista vazia no "A levar" (6a): "Nenhum item para levar" com "Ver todos os produtos".
- Carrinho vazio: "Carrinho vazio. Toque no círculo de um item para marcar que você pegou."
- Busca sem resultado (6b), com "Adicionar".
- Erro de gravação (aviso e tela desfeita).
- Offline: selo âmbar.

## Regras gerais

- **Estados honestos:** nada de valor inventado, sucesso falso ou falha silenciosa.
- Valores em R$ no formato brasileiro, números tabulares.
- Áreas de toque de pelo menos 44 px.
- Comentários no código descrevem a regra inteira.
- Sem mudanças no banco. Se precisar de alguma, pare e pergunte.
- Sem dependências novas.

## Testes (com o login da Mari no painel do navegador, 390 × 844)

A `lista_itens` está vazia agora. **No fim dos testes, ela tem de voltar a ficar vazia**: desfaça pelo próprio app ou apague pelo cliente supabase-js na sessão logada só as linhas criadas no teste, e mostre no relatório a contagem final (0).

1. "Todos" mostra os 63 produtos por corredor; "A levar · 0" e "Carrinho · 0".
2. Atalhos: arrastar com o mouse até "Padaria" e tocar; a seção aparece abaixo do cabeçalho. Mostre que arrastar não dispara o toque.
3. Busca "acucar" acha "Açúcar refinado"; "xyz" mostra o estado 6b com o botão "Adicionar". Mostre a escolha de categoria abrindo, mas **cancele sem criar** (não crie produto de teste no banco; se criar por engano, apague e mostre).
4. Feijão carioca: + até 3; abrir; marca já vem "Kicaldo"; digitar 8,50 → selo "▲ R$ 0,41 (+5%)" contra R$ 8,09 de 29/10, e "3 × R$ 8,50 = R$ 25,50".
5. Pão de forma: marca Pullman, preço 6,95 → "= mesmo preço" (última Pullman foi R$ 6,95 em 25/08). Trocar para uma marca nova "Wickbold" → selo cinza "Outra marca · Panco R$ 7,99 em 29/10".
6. Marcar um item sem preço: abre pedindo preço; no carrinho aparece "sem preço" e não soma. Digitar o preço: soma no total do cabeçalho.
7. Tempo real: duas abas logadas; mudar a quantidade numa e ver na outra em até poucos segundos.
8. Erro de gravação: simule (por exemplo, bloqueando a rede nas ferramentas do painel) e mostre o aviso e a tela desfeita.
9. Limpeza: `lista_itens` com 0 linhas no final.

## Revisão adversarial (obrigatória)

Antes de relatar, tente quebrar o próprio trabalho:
- Algum valor na tela pode ficar diferente do que está no banco depois de uma falha de rede?
- O total do carrinho soma item sem preço ou com quantidade 0?
- A comparação de preço usa marca diferente sem avisar (selo colorido quando deveria ser cinza)?
- Arrastar os atalhos com o mouse abre a seção sem querer?
- Uma mudança remota do Carlos apaga o preço que a Mari está digitando?
- Algum teste deixou linha em `lista_itens`, produto ou categoria a mais no banco?

## Relatório final

Em português:
1. O que foi feito, por item deste prompt.
2. Resultado de cada teste, com o que apareceu na tela (números reais).
3. Prints em 390 × 844: Lista em casa (Todos), no mercado (A levar), meio da compra (vários no carrinho, um sem preço), linha aberta com preço que subiu, linha com selo cinza de outra marca, lista de marcas aberta, busca sem resultado, atalhos arrastados.
4. Contagem final de `lista_itens` (tem de ser 0).
5. O que ficou de fora e dúvidas.

Não faça commit nem deploy antes da aprovação.

Leia o minhas-compras-etapa-2-lista.md e execute. Pare ao final para aprovação.
