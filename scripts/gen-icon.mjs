// ツカオのアプリアイコンを生成する(純パスSVG→PNG。フォント不要)。
// 使い方: pnpm add -D sharp && node scripts/gen-icon.mjs
import sharp from 'sharp';

const DIR = 'assets/images';

const GRAD = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#7c5cfc"/>
  <stop offset="0.55" stop-color="#b15cf2"/>
  <stop offset="1" stop-color="#ff6fb5"/>
</linearGradient>`;

// 「ツ」を3ストロークで描く(2つの点＋大きな払い)。round capで柔らかく
const tsu = (stroke, width) => `
  <g fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M37,33 L45,47"/>
    <path d="M56,33 L64,47"/>
    <path d="M74,32 C77,62 60,78 33,66"/>
  </g>`;

const svg = (size, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${inner}</svg>`;

// 1) アイコン本体: グラデ背景 ＋ 白いツ
const icon = (size) => svg(size, `<defs>${GRAD}</defs><rect width="100" height="100" fill="url(#g)"/>${tsu('#ffffff', 9)}`);
// 2) Android foreground: 透明背景＋中央60%セーフゾーンにツ
const fg = (size) => svg(size, `<g transform="translate(50,53) scale(0.6) translate(-54,-54)">${tsu('#ffffff', 9)}</g>`);
// 3) Android background: グラデのみ
const bg = (size) => svg(size, `<defs>${GRAD}</defs><rect width="100" height="100" fill="url(#g)"/>`);
// 4) monochrome: 白いツのみ(透明)
const mono = (size) => svg(size, tsu('#ffffff', 9));

const render = (str, out) => sharp(Buffer.from(str)).png().toFile(`${DIR}/${out}`);

await Promise.all([
  render(icon(1024), 'icon.png'),
  render(icon(96), 'favicon.png'),
  render(icon(1024), 'splash-icon.png'),
  render(fg(1024), 'android-icon-foreground.png'),
  render(bg(1024), 'android-icon-background.png'),
  render(mono(1024), 'android-icon-monochrome.png'),
]);
console.log('✅ icons generated under', DIR);
