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
  traverse(ast, { Program(p) { p.scope.crawl(); for (const child of p.get('body')) if(child.isImportDeclaration()) { for(const spec of child.get('specifiers')) if(!p.scope.getBinding(spec.node.local.name)?.referenced) spec.remove(); if(!child.node.specifiers.length) child.remove(); } } });
  fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});
  fs.writeFileSync(path.join(root,file),code(ast)+'\n');
}
const forms=read('components/forms.jsx');
const constants=forms.program.body.filter(n=>t.isExportNamedDeclaration(n)&&t.isVariableDeclaration(n.declaration));
if(constants.length) write('domain/constants.js',t.file(t.program(constants)));
forms.program.body=forms.program.body.filter(n=>!constants.includes(n));
write('components/forms.jsx',forms);
function files(dir) {return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of files(root).filter(f=>/\.(jsx|js)$/.test(f))) {
 const ast=parse(fs.readFileSync(file,'utf8'));
 traverse(ast,{
  ImportDeclaration(p) {if(!p.node.source.value.includes('forms'))return;const matches=p.node.specifiers.filter(s=>['categories','kinds'].includes(s.local.name));if(matches.length){p.node.specifiers=p.node.specifiers.filter(s=>!matches.includes(s));const rel=path.relative(path.dirname(file),path.join(root,'domain/constants.js')).replaceAll('\\','/');p.insertBefore(t.importDeclaration(matches,t.stringLiteral(rel.startsWith('.')?rel:'./'+rel)));if(!p.node.specifiers.length)p.remove();}},
  Identifier(p){if(p.node.name==='current'&&!(p.parent.type==='MemberExpression'&&p.key==='property'&&!p.parent.computed))p.node.name='sessionRef';},
  JSXIdentifier(p){if(p.node.name==='current')p.node.name='sessionRef';},
  VariableDeclaration(p){if(p.node.declarations.length>1&&p.parent.type!=='ForStatement')p.replaceWithMultiple(p.node.declarations.map(d=>t.variableDeclaration(p.node.kind,[d])));}
 });
 write(path.relative(root,file),ast);
}
// Move report calculations out of the application shell.
const app=read('App.jsx');
const body=app.program.body.find(t.isExportDefaultDeclaration).declaration.body.body;
const start=body.findIndex(n=>t.isVariableDeclaration(n)&&n.declarations[0].id.name==='currencyBooks');
const end=body.findIndex(n=>t.isVariableDeclaration(n)&&n.declarations[0].id.name==='nav');
const calculations=body.splice(start,end-start);
const names=calculations.flatMap(n=>Object.keys(t.getBindingIdentifiers(n)));
write('domain/reportSummary.js',parse('import { categories } from "./constants.js";\nexport function getReportSummary({data,unit,book,type,from,to,search}) {\n'+calculations.map(code).join('\n')+'\nreturn {'+names.join(',')+'};}'));
body.splice(start,0,parse('const {'+names.join(',')+'} = getReportSummary({data,unit,book,type,from,to,search});').program.body[0]);
app.program.body.unshift(parse('import { getReportSummary } from "./domain/reportSummary";').program.body[0]);
write('App.jsx',app);
// Each feature page owns its local form state.
const feature=read('Features.jsx');
const imports=feature.program.body.filter(t.isImportDeclaration).map(code).join('\n').replaceAll('"./','"../');
const fn=feature.program.body.find(t.isExportDefaultDeclaration).declaration;
const statements=fn.body.body;
const branches=statements.filter(t.isIfStatement);
const before=statements.slice(0,statements.indexOf(branches[0]));
const tail=statements.slice(statements.indexOf(branches[1])+1);
const common=before.filter(n=>t.isVariableDeclaration(n)&&['books','submit'].includes(n.declarations[0].id.name));
const states=before.filter(n=>!common.includes(n));
const header=imports+'\nimport { Field } from "../components/forms";\n';
for(const [name,content] of [['ImportHistoryPage',[...states,...common.filter(n=>n.declarations[0].id.name==='books'),branches[0].consequent]],['ReceiptsPage',[branches[1].consequent]],['PlanningPage',[...common,...tail]]]) {
 write('pages/'+name+'.jsx',parse(header+'export default function '+name+'({data,save,act}){'+content.map(code).join('\n')+'}'));
}
fs.writeFileSync(path.join(root,'Features.jsx'),'import ImportHistoryPage from "./pages/ImportHistoryPage";\nimport ReceiptsPage from "./pages/ReceiptsPage";\nimport PlanningPage from "./pages/PlanningPage";\n\nexport default function Features({page, ...props}) {\nif(page === "Import & history") return <ImportHistoryPage {...props} />;\nif(page === "Receipts") return <ReceiptsPage {...props} />;\nreturn <PlanningPage {...props} />;\n}\n');
// Extract HTTP route groups while keeping authorization middleware ordering intact.
const server=path.join(__dirname,'../server');
const security=parse(fs.readFileSync(path.join(server,'features.js'),'utf8'));
const factory=security.program.body.find(t.isExpressionStatement).expression.right;
const publicFn=factory.body.body.find(n=>t.isFunctionDeclaration(n)&&n.id.name==='publicRoutes');
const privateFn=factory.body.body.find(n=>t.isFunctionDeclaration(n)&&n.id.name==='privateRoutes');
const split=privateFn.body.body.findIndex(n=>code(n).includes('"/api/shared"'));
const shared=privateFn.body.body.splice(split);
const securityRoutes=privateFn.body.body.splice(0);
function routeModule(name,statements) {
 const deps=new Set();
 const module=parse('module.exports = function '+name+'() {'+statements.map(code).join('\n')+'}');
 traverse(module,{ReferencedIdentifier(p){if(!p.scope.hasBinding(p.node.name)&&!['module','Buffer','process','require'].includes(p.node.name))deps.add(p.node.name);}});
 const args=[...deps];
 module.program.body[0].expression.right.params=[t.objectPattern(args.map(n=>t.objectProperty(t.identifier(n),t.identifier(n),false,true)))];
 fs.mkdirSync(path.join(server,'routes'),{recursive:true});
 fs.writeFileSync(path.join(server,'routes',name+'.js'),code(module)+'\n');
 return parse('require("./routes/'+name+'")({'+args.join(',')+'});').program.body[0];
}
publicFn.body.body=[routeModule('recovery',publicFn.body.body)];
privateFn.body.body=[routeModule('security',securityRoutes),routeModule('sharedBooks',shared)];
fs.writeFileSync(path.join(server,'features.js'),code(security)+'\n');

