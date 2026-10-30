# Minhas Compras · Etapa 5 · Sinal fraco, publicação e instalação

## Contexto

As Etapas 1 a 4 estão aprovadas e commitadas. O app (`Documents\lista-compras\frontend`) já tem Lista, Orçamento, Histórico, folha do produto, Ajustes e modo sem internet (cache no service worker `minhas-compras-v5`, dados em IndexedDB, fila de alterações, `db: { retry: false }` no supabase-js).

Banco (esquema `mercado`), estado que precisa ser **restaurado no fim dos testes**: 8 categorias na ordem 1 Mercearia … 8 Bebidas; 63 produtos ativos; compras 4; compra_itens 138; lista_itens 0; observacoes 0; limite nulo; manter_tela_acesa verdadeiro.

**Supabase:** modo Automático. **Não use o MCP do Supabase.** Sem mudanças no banco. Se precisar, pare e pergunte.

## Escopo

1. Sinal fraco: o app não pode ficar parado esperando a rede.
2. Preparar a publicação na Vercel (sem publicar sozinho).
3. Instalação no celular (Android e iPhone).
4. Roteiro de teste no celular para a Mari.

## 1. Sinal fraco

No mercado, o pior caso não é "sem internet", é o sinal fraco: o celular diz que está conectado, mas as respostas demoram ou nunca chegam. Hoje os arquivos do app vêm "primeiro da rede" e as leituras esperam a resposta. Ajuste:

- **Arquivos do app (service worker):** busque na rede com **limite de 3 segundos**. Passou do limite ou deu erro: entregue o que está no cache e continue atualizando o cache em segundo plano quando a resposta chegar. Os arquivos do supabase-js continuam vindo só do cache.
- **Abertura:** desenhe a tela **primeiro com os dados guardados no aparelho** (IndexedDB) e depois atualize com o servidor. A Lista nunca pode ficar em branco esperando a rede.
- **Leituras:** toda consulta ao servidor tem limite de tempo (cerca de 6 segundos, com `AbortController` ou equivalente). Passou do limite: trate como sem internet (selo "Offline", dados do aparelho) e tente de novo pelo caminho de recuperação que já existe.
- **Gravações da Lista:** gravação que passa do limite vai para a fila, como erro de rede. Confirme no relatório que reenviar a mesma mudança é seguro (o `upsert` por `produto_id` com os valores finais não duplica nada).
- **Ações que exigem servidor** (finalizar compra, cadastros, observações, limite): com o limite de tempo estourado, mostre o aviso de falha e não mude a tela. Para finalizar a compra, se a resposta não chegar, **não presuma que falhou nem que deu certo**: recarregue o Histórico e a Lista e mostre o que o servidor tem ("Não deu para confirmar. Confira no Histórico se a compra foi salva.").

## 2. Preparar a publicação na Vercel

O Nosso Plano já publica pela Vercel ligada ao GitHub. Faça o mesmo, mas **não crie o projeto na Vercel nem publique por conta própria**: deixe tudo pronto e escreva o passo a passo para a Mari.

- `vercel.json` (se o Nosso Plano usa um, siga o mesmo padrão):
  - Root Directory é `frontend`, sem etapa de build;
  - `sw.js` e `index.html` com `Cache-Control: no-cache`, para uma versão nova chegar sempre;
  - os demais arquivos com cache normal.
- Confira que nada do app depende de `localhost` (URLs, `config.js`, manifest, service worker com escopo `/`).
- `config.js` só com a URL e a chave anon/publishable. Confirme no relatório que nenhuma chave `service_role` aparece no repositório.
- Troque a versão do cache para `minhas-compras-v6`.
- Passo a passo para a Mari, em linguagem simples:
  1. vercel.com → Add New → Project → importar o repositório `lista-compras`;
  2. Root Directory `frontend`, Framework Preset "Other", sem comando de build;
  3. Deploy, e anotar o endereço gerado;
  4. o que conferir no primeiro acesso.

## 3. Instalação no celular

- Manifest: nome "Minhas Compras", nome curto "Compras", ícones 192 e 512 (comum e maskable), `display: standalone`, `start_url` e `scope` corretos, cores do design.
- **iPhone:** `apple-touch-icon` (180 × 180), `apple-mobile-web-app-capable`, `apple-mobile-web-app-title` = "Compras" e cor da barra de status coerente com o design.
- Área segura (notch e barra de gestos): o cabeçalho e o menu inferior não podem ficar embaixo da barra do sistema no app instalado (use `env(safe-area-inset-*)` e `viewport-fit=cover`).
- Escreva as instruções de instalação:
  - **Android (Chrome):** menu ⋮ → "Instalar app" (ou "Adicionar à tela inicial");
  - **iPhone (Safari):** botão Compartilhar → "Adicionar à Tela de Início".

## 4. Roteiro de teste no celular (para a Mari)

Entregue um roteiro curto, numerado, para fazer em casa e na próxima ida ao mercado:

1. Abrir o endereço da Vercel no celular, entrar com o mesmo e-mail e senha do Nosso Plano e instalar.
2. Carlos faz o mesmo no celular dele.
3. Em casa: Mari põe 2 itens na lista; Carlos vê aparecer em poucos segundos.
4. Modo avião: abrir o app instalado; a lista aparece; mudar uma quantidade; aparece "Offline · 1 alteração pendente". Tirar o modo avião: aparece "Sincronizado".
5. Tela acesa: com a Lista aberta, o celular não apaga sozinho.
6. No mercado: usar normalmente; no fim, "Reiniciar lista (nova compra)" e conferir a compra no Histórico com a data certa.
7. O que anotar e mandar se algo der errado: print, horário e o que estava fazendo.

## Testes (login da Mari no painel, 390 × 844)

Use o cliente supabase-js da sessão para conferir o banco e apagar só o que o teste criar.

1. **Sinal fraco, abertura:** simule respostas do Supabase que demoram 20 segundos (por exemplo, interceptando e atrasando). Recarregue: a Lista aparece com os dados do aparelho em menos de 1 segundo, e o selo vira "Offline" quando o limite estoura.
2. **Sinal fraco, gravação:** com o atraso ligado, mude a quantidade de um produto: vai para a fila ("1 alteração pendente"). Tire o atraso: sobe e aparece "Sincronizado". O banco tem uma linha só para aquele produto.
3. **Sinal fraco, finalizar:** com o atraso ligado, tente "Reiniciar lista" com um item no carrinho com preço: aparece o aviso de que não deu para confirmar, sem mudar a tela. Tire o atraso, recarregue e mostre o que o servidor tem. Se a compra de teste tiver sido salva, apague-a.
4. **Arquivos do app com rede lenta:** mostre que, com a rede para os arquivos do app atrasada além de 3 s, o app abre pelo cache.
5. **Manifest e ícones:** valide o manifest (ícones carregando, nomes, `start_url`) e mostre o app com a área segura simulada.
6. **Restaurar** e mostrar as contagens finais (estado do Contexto).

## Revisão adversarial (obrigatória)

- Existe algum caminho em que a tela fica em branco ou carregando para sempre com sinal fraco?
- Uma gravação que chegou ao servidor, mas cuja resposta se perdeu, pode virar duplicada ou sumir?
- Finalizar compra com resposta perdida pode fazer a Mari salvar a compra duas vezes? (Mostre o que impede ou como o aviso orienta.)
- O `vercel.json` pode prender o celular numa versão velha do `sw.js`?
- Alguma chave secreta ou endereço `localhost` vai para produção?

## Relatório final

1. O que foi feito, por item.
2. Resultado de cada teste, com números reais.
3. Conteúdo do `vercel.json` e do manifest.
4. Passo a passo da Vercel e instruções de instalação (Android e iPhone), prontos para a Mari seguir.
5. O roteiro de teste no celular.
6. Contagens finais do banco.
7. O que ficou de fora e dúvidas.

Não faça commit nem publique antes da aprovação.

Leia o minhas-compras-etapa-5-publicacao.md e execute. Pare ao final para aprovação.
