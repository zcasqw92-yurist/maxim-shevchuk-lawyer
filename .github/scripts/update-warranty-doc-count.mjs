import fs from 'node:fs';

const file = 'docs/current-production-state.md';
let text = fs.readFileSync(file, 'utf8');
const before = '- 26 канонических содержательных URL: главная, каталог и семь страниц услуг, раздел и десять юридических разборов, раздел и два полных кейса практики, страница о юристе, контакты и политика конфиденциальности;';
const after = '- 27 канонических содержательных URL: главная, каталог и семь страниц услуг, раздел и одиннадцать юридических разборов, раздел и два полных кейса практики, страница о юристе, контакты и политика конфиденциальности;';
if (!text.includes(before)) throw new Error('Production count marker not found');
text = text.replace(before, after);
fs.writeFileSync(file, text);
