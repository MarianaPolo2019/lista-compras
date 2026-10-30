// ---------------------------------------------------------------------------
// Portão contra o erro mais repetido deste projeto.
//
// Uma CRASE dentro de um comentário HTML que mora DENTRO de um template literal
// fecha a string e derruba o boot inteiro com SyntaxError — numa tela que pode
// nem ser a que você mexeu. Aconteceu treze vezes até a At. 15, voltou na 16, e
// voltou CINCO vezes na sessão da At. 18, sempre em comentário recém-escrito
// para explicar outra correção.
//
// A regra já estava no guia ("escreva o nome SEM crase quando o comentário for
// HTML") e mesmo assim não segurou. Lembrete não basta; isto aqui é o teste.
//
// Roda da pasta que contém frontend/, ou de dentro dela:
//   node frontend/ferramentas/crase-em-comentario.mjs
//
// Sai com código 1 se achar algo — dá para pendurar num hook ou rodar junto do
// `node --input-type=module --check`, que NÃO pega este caso quando a crase
// fecha a string de um jeito que continua sintaticamente válido.
// ---------------------------------------------------------------------------
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const raiz = process.argv[2] ?? (statSync("js", { throwIfNoEntry: false }) ? "." : "frontend");

function arquivos(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    const info = statSync(caminho);
    if (info.isDirectory()) {
      if (nome === "node_modules" || nome === ".git") continue;
      saida.push(...arquivos(caminho));
    } else if (nome.endsWith(".js") || nome.endsWith(".mjs")) {
      saida.push(caminho);
    }
  }
  return saida;
}

// Comentário HTML só aparece dentro de template literal neste projeto — não há
// HTML solto em .js. Então basta varrer os blocos <!-- ... --> e reclamar de
// qualquer crase dentro deles.
const achados = [];
for (const arquivo of arquivos(join(raiz, "js"))) {
  const texto = readFileSync(arquivo, "utf8");
  const linhas = texto.split("\n");
  for (const m of texto.matchAll(/<!--[\s\S]*?-->/g)) {
    if (!m[0].includes("`")) continue;
    const linha = texto.slice(0, m.index).split("\n").length;
    achados.push({
      arquivo: relative(raiz, arquivo).replace(/\\/g, "/"),
      linha,
      trecho: (linhas[linha - 1] ?? "").trim().slice(0, 88),
    });
  }
}

if (!achados.length) {
  console.log("crase em comentário HTML: nenhuma ✓");
  process.exit(0);
}
console.error("CRASE DENTRO DE COMENTÁRIO HTML — isto derruba o boot:\n");
for (const a of achados) console.error(`  ${a.arquivo}:${a.linha}\n    ${a.trecho}`);
console.error(`\n${achados.length} ocorrência(s). Escreva o nome SEM crase quando o comentário for HTML.`);
process.exit(1);
