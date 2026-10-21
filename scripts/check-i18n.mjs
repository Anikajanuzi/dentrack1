// Verifies every t("…") / tn(n, "…", "…") key used in src/ has an Albanian translation.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve("src");
const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } };
walk(root);

const used = new Map();
const PROPS = new Set(["label", "title", "description", "hint", "heading", "searchPlaceholder", "emptyTitle", "emptyDescription", "sub", "confirmLabel", "body", "k"]);
const OBJ_PROPS = new Set(["label", "header", "title", "description", "hint", "intro", "why", "body"]);
for (const file of files) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ["t", "tn", "translate"].includes(n.expression.text)) {
      const name = n.expression.text;
      const args = name === "t" ? [n.arguments[0]] : name === "tn" ? [n.arguments[1], n.arguments[2]] : [n.arguments[1]];
      for (const a of args) if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) used.set(a.text, path.relative(process.cwd(), file));
    }
    // Strings passed to auto-translating UI props (Field label, PageHeader title, table headers…)
    if (ts.isJsxAttribute(n) && PROPS.has(n.name.getText(sf)) && n.initializer && ts.isStringLiteral(n.initializer) && /[A-Za-z]{2}/.test(n.initializer.text))
      used.set(n.initializer.text, path.relative(process.cwd(), file));
    if (ts.isPropertyAssignment(n) && OBJ_PROPS.has(n.name.getText(sf)) && ts.isStringLiteral(n.initializer) && /^[A-Z]/.test(n.initializer.text) && !/[a-z]-[a-z]|[{}<>]/.test(n.initializer.text))
      used.set(n.initializer.text, path.relative(process.cwd(), file));
    // Tour step bullet lists: points: ["…", "…"]
    if (ts.isPropertyAssignment(n) && n.name.getText(sf) === "points" && ts.isArrayLiteralExpression(n.initializer))
      for (const el of n.initializer.elements) if (ts.isStringLiteral(el)) used.set(el.text, path.relative(process.cwd(), file));
    // Lists of [icon, "label"] pairs and label maps rendered through t()
    if (ts.isArrayLiteralExpression(n) && n.elements.length === 2 && ts.isIdentifier(n.elements[0]) && ts.isStringLiteral(n.elements[1]) && /^[A-Z][a-z]/.test(n.elements[1].text))
      used.set(n.elements[1].text, path.relative(process.cwd(), file));
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

const src = fs.readFileSync("src/lib/i18n/sq.ts", "utf8");
const sf = ts.createSourceFile("sq.ts", src, ts.ScriptTarget.Latest, true);
const have = new Set();
ts.forEachChild(sf, (n) => {
  if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations)
    if (d.name.getText(sf) === "SQ" && d.initializer && ts.isObjectLiteralExpression(d.initializer))
      for (const p of d.initializer.properties) if (ts.isPropertyAssignment(p)) have.add(p.name.text ?? p.name.getText(sf));
});

const missing = [...used].filter(([k]) => !have.has(k));
console.log(`${used.size} keys used, ${have.size} translated, ${missing.length} missing`);
for (const [k, f] of missing) console.log(`  ${JSON.stringify(k)}  (${f})`);
process.exit(missing.length ? 1 : 0);
