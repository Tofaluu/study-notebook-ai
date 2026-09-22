const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.git')) {
        results = results.concat(walk(file));
      }
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}
const files = walk('.');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('claude-sonnet-5')) {
    content = content.replace(/'gpt-6-astra', /g, '');
    content = content.replace(/  'gpt-6-astra': 'gpt-6-astra',\n/g, '');
    
    // Add models to z.enum arrays
    content = content.replace(/'gpt-5\.6-sol',/g, "'gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol',");
    content = content.replace(/'claude-sonnet-5'\]/g, "'claude-sonnet-5', 'claude-opus-5']");
    
    // Add models to StudyModel objects
    content = content.replace(/  'gpt-56-sol': 'gpt-5\.6-sol',/g, "  'gpt-56-luna': 'gpt-5.6-luna',\n  'gpt-56-terra': 'gpt-5.6-terra',\n  'gpt-56-sol': 'gpt-5.6-sol',");
    content = content.replace(/  'claude-sonnet-5': 'claude-sonnet-5',/g, "  'claude-sonnet-5': 'claude-sonnet-5',\n  'claude-opus-5': 'claude-opus-5',");
    fs.writeFileSync(file, content);
    console.log('Updated ' + file);
  }
});
