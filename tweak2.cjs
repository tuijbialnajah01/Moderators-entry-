const fs = require('fs');

const files = [
  'src/components/ModList.tsx',
  'src/components/ModDetail.tsx'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  
  // Fix the translate typo
  content = content.replace(/tranzinc-y/g, 'translate-y');
  content = content.replace(/tranzinc-x/g, 'translate-x');
  
  // Soften borders
  content = content.replace(/border-zinc-800/g, 'border-white/5');
  content = content.replace(/border-zinc-700/g, 'border-white/10');
  
  // Update inner elements like badged text to feel lighter
  content = content.replace(/font-black/g, 'font-bold');
  
  // Shadows
  content = content.replace(/shadow-sm/g, 'shadow-lg shadow-black/20');
  
  fs.writeFileSync(f, content);
});

console.log("Done");
