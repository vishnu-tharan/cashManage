const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');
const root = path.join(__dirname, 'src');
const parse = code => parser.parse(code, {sourceType:'module', plugins:['jsx']});
const code = node => generate(node).code;
const read = file => parse(fs.readFileSync(path.join(root,file),'utf8'));
function write(file, ast) {
  traverse(ast, { Program(p) { p.scope.crawl(); for (const child of p.get('body')) if(child.isImportDeclaration()) { for(const spec of child.get('specifiers')) { const binding = p.scope.getBinding(spec.node.local.name); if(!binding?.referenced) spec.remove(); } if(!child.node.specifiers.length) child.remove(); } } });
  fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});
  fs.writeFileSync(path.join(root,file),code(ast)+'\n');
}
function free(node) {
  const ast = t.file(t.program([t.isStatement(node)?t.cloneNode(node,true):t.expressionStatement(t.cloneNode(node,true))]));
  const names = new Set();
  traverse(ast,{ReferencedIdentifier(p){if(!p.scope.hasBinding(p.node.name)) names.add(p.node.name);}});
  return [...names];
}
const ast = read('App.jsx');
const imports = ast.program.body.filter(t.isImportDeclaration);
const helpers = ast.program.body.filter(n=>!t.isImportDeclaration(n)&&!t.isExportDefaultDeclaration(n));
const helperNames = helpers.flatMap(n=>Object.keys(t.getBindingIdentifiers(n)));
write('components/forms.jsx',parse(imports.map(code).join('\n').replaceAll('"./','"../')+'\n'+helpers.map(n=>'export '+code(n)).join('\n')));
ast.program.body = ast.program.body.filter(n=>!helpers.includes(n));
ast.program.body.unshift(t.importDeclaration(helperNames.map(n=>t.importSpecifier(t.identifier(n),t.identifier(n))),t.stringLiteral('./components/forms')));
const app = ast.program.body.find(t.isExportDefaultDeclaration).declaration;
const moduleNames = new Set([...imports.flatMap(n=>n.specifiers.map(s=>s.local.name)),...helperNames]);
const globals = new Set(['window','document','navigator','localStorage','crypto','console','fetch','FormData','FileReader','Blob','URL','TextEncoder','TextDecoder','setTimeout','clearTimeout','setInterval','clearInterval','alert','confirm','prompt']);
function extract(p,name,file) {
  const node = p.node;
  const props = free(node).filter(n=>!moduleNames.has(n)&&!globals.has(n));
  const source = imports.map(code).join('\n').replaceAll('"./','"../')+'\nimport { '+helperNames.join(',')+' } from "../components/forms";\nexport default function '+name+'({'+props.join(',')+'}) { return ('+code(node)+'); }';
  write(file,parse(source));
  const element = t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier(name), props.map(n=>t.jsxAttribute(t.jsxIdentifier(n),t.jsxExpressionContainer(t.identifier(n)))),true),null,[],true);
  p.replaceWith(element);
  ast.program.body.unshift(t.importDeclaration([t.importDefaultSpecifier(t.identifier(name))],t.stringLiteral('./'+file.replace(/\.jsx$/,''))));
  moduleNames.add(name);
}
traverse(ast,{
  IfStatement(p){ if(p.parent===app.body && t.isReturnStatement(p.node.consequent)) extract(p.get('consequent.argument'),'AuthPage','pages/AuthPage.jsx'); },
  VariableDeclarator(p){if(t.isIdentifier(p.node.id,{name:'transactionTable'})) extract(p.get('init'),'TransactionTable','components/TransactionTable.jsx');},
  LogicalExpression(p){
    if(p.node.operator!=='&&') return;
    const left=code(p.node.left);
    const lookup={'page === "Cashbooks"':['CashbooksPage','pages/CashbooksPage.jsx'],'page === "Settings"':['SettingsPage','pages/SettingsPage.jsx'],'conflict':['SyncConflictDialog','components/SyncConflictDialog.jsx'],'modal':['TransactionDialog','components/TransactionDialog.jsx']};
    if(lookup[left]&&(t.isJSXElement(p.node.right)||t.isJSXFragment(p.node.right))) extract(p.get('right'),...lookup[left]);
    else if(left.includes('.includes(page)')&&t.isJSXFragment(p.node.right)) extract(p.get('right'),'ReportsPage','pages/ReportsPage.jsx');
  },
  JSXElement(p){const opening=p.node.openingElement;if(opening.name.name==='aside')extract(p,'Sidebar','components/Sidebar.jsx');}
});
const guard=app.body.body.findIndex(t.isIfStatement);
const controller=app.body.body.splice(0,guard);
const declared=new Set(controller.flatMap(n=>Object.keys(t.getBindingIdentifiers(n))));
const needed=free(t.functionDeclaration(t.identifier('View'),[],t.blockStatement(app.body.body))).filter(n=>declared.has(n));
const hookSource=imports.map(code).join('\n').replaceAll('"./','"../')+'\nexport default function useWorkspace() {\n'+controller.map(code).join('\n')+'\nreturn {'+needed.join(',')+'};\n}';
write('hooks/useWorkspace.js',parse(hookSource));
app.body.body.unshift(parse('const {'+needed.join(',')+'} = useWorkspace();').program.body[0]);
ast.program.body.unshift(parse('import useWorkspace from "./hooks/useWorkspace";').program.body[0]);
write('App.jsx',ast);
// Split infrastructure by responsibility, retaining the existing public import surface.
const storage=read('storage.js');
const groups={
 'lib/crypto.js':['enc','hex','bytes','randomSalt','derive','proof','seal','unseal'],
 'domain/validation.js':['validateData'],
 'lib/api.js':['api'],
 'lib/download.js':['download'],
 'integrations/googleDrive.js':['drive'],
 'domain/currency.js':['currencies','digits','money'],
 'domain/workspace.js':['today','initial'],
};
const owners=new Map(Object.entries(groups).flatMap(([file,names])=>names.map(n=>[n,file])));
for(const [file,names] of Object.entries(groups)) {
  const nodes=storage.program.body.filter(n=>Object.keys(t.getBindingIdentifiers(n)).some(id=>names.includes(id)));
  const module=t.file(t.program(nodes));
  const refs=free(t.functionDeclaration(t.identifier('scope'),[],t.blockStatement(nodes.map(n=>t.isExportNamedDeclaration(n)?n.declaration:n))));
  for(const ref of refs) if(owners.has(ref)&&owners.get(ref)!==file) {
    let relative=path.posix.relative(path.posix.dirname(file),owners.get(ref));if(!relative.startsWith('.'))relative='./'+relative;
    module.program.body.unshift(t.importDeclaration([t.importSpecifier(t.identifier(ref),t.identifier(ref))],t.stringLiteral(relative)));
  }
  write(file,module);
}
fs.writeFileSync(path.join(root,'storage.js'),'// Public storage API. Implementations are grouped by responsibility.\n'+Object.entries(groups).map(([file,names])=>'export { '+names.filter(n=>!['enc','hex','bytes'].includes(n)).join(', ')+' } from "./'+file+'";').join('\n')+'\n');
