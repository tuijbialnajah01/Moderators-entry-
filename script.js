const fs = require('fs');

const files = [
  'src/components/ModList.tsx',
  'src/components/ModDetail.tsx',
  'src/components/CountdownTimer.tsx',
  'src/index.css',
  'src/App.tsx'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(/slate-/g, 'zinc-');
  content = content.replace(/indigo-/g, 'blue-');
  // Apple likes blue-500 instead of indigo.
  fs.writeFileSync(f, content);
});

console.log("Done");