// ---------------------------------------------------------------------------
// Gera os PNGs do manifest (e o apple-touch-icon e os favicons) sem depender
// de nenhum programa instalado: desenha o mesmo carrinho de assets/icone.svg e
// assets/icone-mascara.svg direto em pixels e grava PNG com o zlib do Node.
//
// A geometria aqui é a dos SVGs: se mudar o desenho lá, mude aqui também.
// Os cantos arredondados do carrinho viram curvas de Bézier quadráticas com o
// controle no encontro das duas retas; na escala de um ícone a diferença para o
// arco do SVG não aparece.
//
// Roda da pasta frontend/ ou da pasta do projeto:
//   node frontend/ferramentas/gerar-icones.mjs
// ---------------------------------------------------------------------------
import { writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const raiz = statSync("assets", { throwIfNoEntry: false }) ? "." : "frontend";
const destino = join(raiz, "assets", "icons");

const MAGENTA = [201, 58, 110];   // #c93a6e, o --magenta do design
const BRANCO = [255, 255, 255];
const TRACO = 1.9;                // stroke-width dos SVGs, em unidades do viewBox 24

// O carrinho no viewBox 24×24.
function curva(a, c, b, passos = 8) {
  const pts = [];
  for (let i = 1; i <= passos; i++) {
    const t = i / passos, u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return pts;
}
const caminho = [
  [2.5, 4], [4.9, 4], [7.3, 15.1],
  ...curva([7.3, 15.1], [7.58, 16.4], [8.9, 16.4]),
  [17.3, 16.4],
  ...curva([17.3, 16.4], [18.55, 16.4], [18.9, 15.2]),
  [21, 8], [6, 8],
];
const rodas = [[9.5, 20.2], [17.3, 20.2]];
const RAIO_RODA = 1.3;

// Os dois formatos, no viewBox 512 dos SVGs.
const FORMATOS = {
  any:      { cantos: 112, dx: 96,  dy: 100, escala: 13.333 },
  maskable: { cantos: 0,   dx: 136, dy: 138, escala: 10 },
};

function distSegmento(px, py, [ax, ay], [bx, by]) {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function noTraco(x, y) {
  for (let i = 1; i < caminho.length; i++) {
    if (distSegmento(x, y, caminho[i - 1], caminho[i]) <= TRACO / 2) return true;
  }
  for (const [cx, cy] of rodas) {
    if (Math.abs(Math.hypot(x - cx, y - cy) - RAIO_RODA) <= TRACO / 2) return true;
  }
  return false;
}

function noFundo(x, y, r) {
  if (!r) return x >= 0 && x <= 512 && y >= 0 && y <= 512;
  const qx = Math.max(r - x, 0, x - (512 - r));
  const qy = Math.max(r - y, 0, y - (512 - r));
  return qx * qx + qy * qy <= r * r;
}

function desenhar(lado, f) {
  const AMOSTRAS = 4;                       // 4×4 por pixel: bordas suaves
  const px = Buffer.alloc(lado * lado * 4);
  const k = 512 / lado;
  for (let j = 0; j < lado; j++) {
    for (let i = 0; i < lado; i++) {
      let fundo = 0, traco = 0;
      for (let sj = 0; sj < AMOSTRAS; sj++) {
        for (let si = 0; si < AMOSTRAS; si++) {
          const x = (i + (si + .5) / AMOSTRAS) * k;
          const y = (j + (sj + .5) / AMOSTRAS) * k;
          if (!noFundo(x, y, f.cantos)) continue;
          fundo++;
          if (noTraco((x - f.dx) / f.escala, (y - f.dy) / f.escala)) traco++;
        }
      }
      const total = AMOSTRAS * AMOSTRAS;
      const a = fundo / total;
      const mistura = fundo ? traco / fundo : 0;
      const o = (j * lado + i) * 4;
      for (let c = 0; c < 3; c++) px[o + c] = Math.round(MAGENTA[c] * (1 - mistura) + BRANCO[c] * mistura);
      px[o + 3] = Math.round(a * 255);
    }
  }
  return px;
}

// --- PNG -------------------------------------------------------------------
const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloco(tipo, dados) {
  const t = Buffer.from(tipo, "ascii");
  const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
  return Buffer.concat([tam, t, dados, crc]);
}
function png(lado, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0); ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; ihdr[9] = 6;                 // 8 bits, RGBA
  const linhas = Buffer.alloc(lado * (lado * 4 + 1));
  for (let j = 0; j < lado; j++) rgba.copy(linhas, j * (lado * 4 + 1) + 1, j * lado * 4, (j + 1) * lado * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco("IHDR", ihdr), bloco("IDAT", deflateSync(linhas, { level: 9 })), bloco("IEND", Buffer.alloc(0)),
  ]);
}

const ALVOS = [
  ["icone-192.png", 192, "any"],
  ["icone-512.png", 512, "any"],
  ["icone-mascavel-192.png", 192, "maskable"],
  ["icone-mascavel-512.png", 512, "maskable"],
  // O iOS arredonda o apple-touch-icon sozinho: vai o de borda a borda.
  ["apple-touch-icon.png", 180, "maskable"],
  ["favicon-64.png", 64, "any"],
  ["favicon-32.png", 32, "any"],
];

for (const [nome, lado, formato] of ALVOS) {
  const arquivo = png(lado, desenhar(lado, FORMATOS[formato]));
  writeFileSync(join(destino, nome), arquivo);
  console.log(`${nome}  ${lado}px  ${arquivo.length} bytes`);
}
