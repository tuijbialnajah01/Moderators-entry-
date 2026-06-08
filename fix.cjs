const fs = require('fs');

let content = fs.readFileSync('src/components/ModList.tsx', 'utf8');
content = content.replace(/border-white\/10\/50/g, 'border-white/5');
fs.writeFileSync('src/components/ModList.tsx', content);

console.log('Fixed border syntax');
