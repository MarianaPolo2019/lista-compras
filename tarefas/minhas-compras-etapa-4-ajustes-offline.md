# Minhas Compras · Etapa 4 · Ajustes e modo sem internet

## Contexto

As Etapas 1 a 3 estão aprovadas e commitadas. O app está em `Documents\lista-compras\frontend`, na stack do Nosso Plano (HTML/CSS/JS puro, ES modules, `supabase-js@2` do esm.sh, `sw.js` escrito à mão). Lista, Orçamento, Histórico e a folha do produto já funcionam com os dados reais. O módulo `precos.js` concentra as regras de "última compra" e "mesma marca".

Banco (esquema `mercado`, projeto `financas`), estado atual que precisa ser **restaurado no fim dos testes**:
- 8 categorias, nesta ordem (`categorias.ordem`): 1 Mercearia, 2 Laticínios, 3 Higiene, 4 Limpeza, 5 Açougue & Frios, 6 Padaria, 7 Biscoitos & Doces, 8 Bebidas;
- 63 produtos, todos ativos;
- 4 compras, 138 itens de compra;
- `lista_itens` = 0, `observacoes` = 0, `configuracoes.limite_gastos` nulo, `manter_tela_acesa` verdadeiro.

Lembretes do banco que afetam esta etapa:
- `produtos.categoria_id` tem `on delete restrict`: **uma categoria só pode ser apagada quando nenhum produto (ativo ou não) aponta para ela**.
- Nomes de categoria e de produto são únicos sem diferenciar acento e maiúscula (índices com `mercado.normalizar`).

Referência visual: design aprovado, telas **6g** (Ajustes), **6h** (Categorias, arrastando), **6i** (Produtos) e **7b** (excluir categoria). Implementação fiel ao design.

**Supabase:** modo Automático. **Não use o MCP do Supabase.** Tudo pelo app, com o login da Mari no painel. Esta etapa **não** prevê mudança no banco. Se precisar, pare e pergunte.

## Escopo

1. Acabamentos (2 itens).
2. Ajustes: Categorias e Produtos.
3. Modo sem internet: o app abre, mostra a lista e aceita as ações da Lista sem sinal, sincronizando quando o sinal volta.

Fora desta etapa: deploy na Vercel e instalação nos celulares (Etapa 5).

## 1. Acabamentos

- **Concordância no singular** em todo o app: "1 comprado · 1 pendente", "1 item", "1 produto", "1 compra finalizada". Revise todos os textos com contagem.
- O exemplo do campo de observação aparece cortado. Troque por **"Ex.: acabou o catchup"**.

## 2. Ajustes (tela 6g)

Mantenha o que já existe (Compartilhamento, "Manter tela acesa" e "Sair"). Os itens de **Cadastros** ("Categorias · 8" e "Produtos · 63") passam a abrir as telas abaixo.

### Categorias (tela 6h)
- Título "Categorias", subtítulo "Ordem dos corredores" e o texto "Segure a alça à esquerda e arraste para seguir o caminho do seu mercado."
- Cada linha: alça de arrastar, nome, "N produtos" (só os ativos), lápis (renomear) e lixeira.
- **Reordenar arrastando pela alça**, com o dedo no celular e com o mouse no computador (pointer events). A linha arrastada fica destacada como no design. Ao soltar, grave a nova `ordem` de todas as categorias que mudaram. Se a gravação falhar, volte à ordem anterior e avise.
- **Renomear:** campo no lugar ou numa folha. Nome repetido: mostre a mensagem real do banco.
- **Criar:** campo "Nova categoria…" + botão "+ Criar" no fim da lista; entra com `ordem` = maior ordem + 1.
- **Excluir (diálogo 7b, adaptado à regra do banco):**
  - Sem nenhum produto (nem inativo): confirmação simples e exclusão.
  - Com produtos: "Esta categoria tem N produtos. Para excluir, escolha para qual categoria eles vão." com a lista das outras categorias e os botões "Mover e excluir" e "Cancelar". Mova **todos** os produtos que apontam para ela (ativos e inativos) e só depois apague a categoria. Não ofereça "excluir categoria e produtos": o banco não permite apagar produtos com histórico.
  - Se qualquer passo falhar, nada pode ficar pela metade. Recarregue e avise.
- A nova ordem vale na hora para as seções da Lista e do detalhe da compra. Os atalhos da Lista continuam em ordem alfabética.

### Produtos (tela 6i)
- Título "Produtos" e "N cadastrados" (ativos).
- Busca (mesma normalização sem acento) e chips de filtro "Todas" + uma por categoria, numa linha arrastável como os atalhos da Lista.
- Lista em ordem alfabética: nome e categoria embaixo. Tocar abre a **folha do produto** da Etapa 3 (editar, mudar categoria, excluir).
- Botão flutuante **"+ Novo produto"**: nome + escolha de categoria (a mesma folha "Em que corredor ele fica?"). O produto novo **não** entra na lista com quantidade; só fica cadastrado.
- Produtos inativos não aparecem aqui.

## 3. Modo sem internet

Objetivo: no mercado, com sinal ruim ou nenhum, a Mari abre o app e usa a Lista normalmente. As mudanças ficam guardadas no aparelho e sobem sozinhas quando o sinal volta. **Nunca** pode parecer salvo o que ainda não subiu.

### Abrir sem internet
- O app tem de abrir sem internet depois de aberto uma vez com internet. Hoje não abre porque o `supabase-js` vem do esm.sh e não entra no cache. Resolva: guarde no cache do service worker o módulo do esm.sh **com a versão fixada na URL** (sem `@2` solto) e os arquivos do app, ou traga o módulo para dentro do projeto. Explique no relatório qual caminho usou e por quê.
- **Sessão:** sem internet, a renovação do login falha. O app **não pode** mandar a Mari para a tela de login por isso. Use a sessão guardada e a última confirmação de "membro do casal" guardada no aparelho. A tela de login só aparece se ela clicar em "Sair" ou se o servidor, online, disser que a sessão não vale mais.

### Dados guardados no aparelho
- A cada carga bem-sucedida, guarde em IndexedDB: categorias, produtos ativos, `lista_itens`, histórico de preços (`compra_itens` com a data da compra) e `configuracoes`.
- Sem internet, a Lista, o Orçamento (cálculos locais) e a folha do produto usam esses dados. O cartão "Mesmos itens" mostra "Disponível com internet" em vez de um número velho.

### O que funciona sem internet
- **Na Lista:** quantidade, + rápido, marca, preço, marcar e desmarcar no carrinho.
- **Bloqueado, com aviso "Precisa de internet":** Reiniciar lista (finalizar compra), criar, editar ou excluir produto e categoria, observações e limite de gastos. Os botões ficam visíveis, mas mostram o aviso ao tocar.

### Fila de alterações
- Cada mudança da Lista feita sem internet (ou que falhou por rede) vai para uma fila em IndexedDB, por produto. Várias mudanças no mesmo produto se juntam numa só, com os valores finais de cada campo.
- O selo do cabeçalho mostra **"Offline · 3 alterações pendentes"** (âmbar). A linha com mudança pendente tem um indicador discreto (por exemplo, um pequeno relógio ao lado do nome).
- Quando a conexão volta: envie a fila em ordem; a cada item confirmado pelo servidor, tire-o da fila. Ao terminar, recarregue `lista_itens` do servidor e mostre "Sincronizado" por alguns segundos.
- Se o servidor **recusar** um item (erro que não é de rede), tire-o da fila, recarregue aquele produto do servidor e avise qual produto não foi salvo e por quê. Erro de rede mantém o item na fila.
- Conflito com o Carlos (os dois mexeram no mesmo produto, um deles sem internet): vale a última alteração que chegar ao servidor. Depois de sincronizar, a tela mostra o que está no banco. Escreva essa regra no código e no relatório.
- A fila sobrevive a fechar e reabrir o app.

### Atualização do app
- Ao mudar arquivos do app, troque a versão do cache do service worker, para o celular não ficar preso numa versão antiga. Descreva no relatório como uma versão nova chega ao celular.

## Regras gerais

- Estados honestos: nada de valor inventado, sucesso falso ou falha silenciosa. "Salvo" ou "Sincronizado" só depois da confirmação do servidor.
- Valores em R$ no formato brasileiro, números tabulares, áreas de toque de pelo menos 44 px.
- Sem mudanças no banco e sem dependências novas (o módulo do supabase-js já é usado).

## Testes (login da Mari no painel, 390 × 844)

Use o cliente supabase-js da sessão logada para conferir o banco e para apagar só o que o teste criou. Para simular a falta de internet, use o modo offline das ferramentas do painel.

1. Acabamentos: Orçamento com 1 item no carrinho e 1 pendente mostra "1 comprado · 1 pendente"; o exemplo da observação aparece inteiro.
2. Categorias: criar "Teste corredor"; renomear para "Teste corredor 2"; tentar renomear para "mercearia" (recusado com a mensagem real); arrastar "Teste corredor 2" para a 2ª posição e conferir a ordem na Lista; criar o produto "Produto teste ajustes" nela; excluir a categoria escolhendo "Bebidas" como destino e conferir que o produto foi para Bebidas e a categoria sumiu.
3. Produtos: busca "sabao" acha "Sabão em pó"; filtro "Higiene" mostra só Higiene; "+ Novo produto" cria um produto sem colocá-lo na lista; tocar abre a folha.
4. Offline, abrir: com internet, abrir o app; desligar a internet; **recarregar a página**: o app abre logado, com a Lista e os 63 produtos.
5. Offline, usar: sem internet, pôr Feijão carioca com 3 un., marca Kicaldo, R$ 8,50, e marcar Arroz 5kg no carrinho a R$ 27,50. O selo mostra "Offline · 2 alterações pendentes", as linhas mostram o indicador, e o banco (conferido depois) ainda **não** tem essas linhas.
6. Offline, fechar e reabrir o app ainda sem internet: as mudanças e a contagem pendente continuam.
7. Voltar a internet: a fila sobe sozinha, aparece "Sincronizado", e o banco tem as 2 linhas com os valores certos.
8. Bloqueios: sem internet, "Reiniciar lista", "+ Novo produto" e "+ Anotar" mostram "Precisa de internet" e não gravam nada.
9. Recusa do servidor: simule uma recusa (por exemplo, interceptando a resposta de um item da fila com um erro 400) e mostre o aviso com o nome do produto, a linha recarregada do servidor e a fila sem esse item.
10. Atualização: mude a versão do cache, recarregue e mostre que a versão nova foi carregada.
11. **Restaurar:** apague as linhas de `lista_itens`, o "Produto teste ajustes" e o produto do teste 3; confira que nenhuma categoria de teste ficou; **restaure a ordem original** das 8 categorias (1 Mercearia … 8 Bebidas). Mostre as contagens finais: categorias 8 (na ordem original), produtos 63 ativos, compras 4, compra_itens 138, lista_itens 0, observacoes 0, limite nulo.

## Revisão adversarial (obrigatória)

- Sem internet, algum caminho mostra "salvo" ou some com uma mudança sem avisar?
- A fila pode enviar a mesma mudança duas vezes ou perder uma ao fechar o app no meio do envio?
- Uma recusa do servidor trava a fila para os outros itens?
- O app desloga a Mari por estar sem internet?
- Algum dado velho do cache aparece como se fosse atual (por exemplo, "Mesmos itens")?
- Excluir categoria pode deixar produto apontando para categoria inexistente ou apagar algo pela metade?
- Algum teste deixou dado a mais no banco ou mudou a ordem das categorias?

## Relatório final

1. O que foi feito, por item, incluindo como o supabase-js passou a funcionar sem internet e como uma versão nova chega ao celular.
2. Resultado de cada teste com o que apareceu na tela.
3. Prints em 390 × 844: Ajustes; Categorias arrastando; diálogo de excluir categoria com destino; Produtos com filtro; novo produto; Lista offline com pendências; "Sincronizado"; aviso "Precisa de internet"; aviso de recusa do servidor.
4. Contagens finais do banco e a ordem das categorias.
5. O que ficou de fora e dúvidas.

Não faça commit nem deploy antes da aprovação.

Leia o minhas-compras-etapa-4-ajustes-offline.md e execute. Pare ao final para aprovação.
