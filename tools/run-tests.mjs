import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const htmlPath = new URL('../index.html', import.meta.url);
const html = readFileSync(htmlPath, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('NO_SCRIPT_FOUND'); process.exit(2); }
const code = m[1];

const logs = [];
function mkEl(tag) {
  const e = {
    tagName: tag, id: '', className: '', innerHTML: '', textContent: '',
    style: {}, children: [],
    setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, removeChild() {}, firstChild: null,
    appendChild(c) { this.children.push(c); if (c && c.id) els[c.id] = c; return c; }
  };
  return e;
}
const els = {};
['app','svg','info','tools','legend'].forEach(id => { const e = mkEl('div'); e.id = id; els[id] = e; });

const domHandlers = [];
const documentShim = {
  getElementById: (id) => els[id] || null,
  createElement: (t) => {
    const e = mkEl(t);
    return new Proxy(e, { set(o, k, v) { o[k] = v; if (k === 'id' && v) els[v] = o; return true; } });
  },
  createElementNS: (_ns, t) => mkEl(t),
  body: { appendChild(c) { if (c && c.id) els[c.id] = c; return c; } },
  addEventListener: (type, cb) => { if (type === 'DOMContentLoaded') domHandlers.push(cb); }
};
const windowShim = { addEventListener: (type, cb) => { if (type === 'DOMContentLoaded') domHandlers.push(cb); } };
const ctx = {
  window: windowShim, document: documentShim,
  location: { search: '?test' },
  console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')) },
  Math, Date, JSON, parseFloat, parseInt, isNaN, isFinite,
  Array, Object, String, Number, Boolean
};
windowShim.document = documentShim;
vm.createContext(ctx);
vm.runInContext(code, ctx);
domHandlers.forEach(h => h());
const out = logs.join('\n');
console.log(out);
const mt = out.match(/TESTS: (\d+)\/(\d+) passed/);
if (!mt) { console.error('NO_TESTS_LINE'); process.exit(3); }
process.exit(mt[1] === mt[2] ? 0 : 1);
