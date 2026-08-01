import fs from 'node:fs';

const file = 'src/automotive-warranty-data.mjs';
let text = fs.readFileSync(file, 'utf8');
const before = 'seoTitle: "Гарантийный ремонт авто больше 45 дней: претензия дилеру"';
const after = 'seoTitle: "Ремонт авто больше 45 дней: претензия дилеру"';
if (!text.includes(before)) throw new Error('SEO-title marker not found');
text = text.replace(before, after);
fs.writeFileSync(file, text);
