
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import katex from "https://cdn.jsdelivr.net/npm/katex/dist/katex.mjs";

const renderMath = (tex, displayMode) => katex.renderToString(tex, {
    throwOnError: false, displayMode: displayMode, output: 'html', trust: true
});

const processLatexEnvironments = (content) => content.replace(/\\begin{(\w+)}([\s\S]*?)\\end{\1}/g, (match, env) => {
    return ['equation','align','gather','multline'].includes(env) ? `$$${match}$$` : match;
});

function boopHighlight(root){
    if (!window.hljs) return;
    root.querySelectorAll('pre code:not([data-highlighted])').forEach(c => hljs.highlightElement(c));
}
window.boopHighlight = boopHighlight;  // this file loads as an ES module, so expose it -- other (non-module) scripts call it too

// proc_htmx (fasthtml-js) has no dedup of its own -- it refires on *every* htmx swap anywhere
// on the page. Guard with :not([data-md-done]) so already-rendered cells are never re-parsed
// (their innerHTML is no longer the raw markdown source, so re-parsing would corrupt them).
proc_htmx('.marked:not([data-md-done])', e => {
    let content = processLatexEnvironments(e.textContent);
    content = content.replace(/\$\$([\s\S]+?)\$\$/gm, (_, tex) => renderMath(tex.trim(), true));
    content = content.replace(/(?<!\w)\$([^\$\s](?:[^\$]*[^\$\s])?)\$(?!\w)/g, (_, tex) => renderMath(tex.trim(), false));
    e.innerHTML = marked.parse(content);
    e.setAttribute('data-md-done', '1');
    boopHighlight(e);
});
