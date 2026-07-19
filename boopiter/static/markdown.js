
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

const COPY_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:14px;height:14px"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15"/></svg>';

// GitHub-style hover-to-copy button on rendered fenced code blocks (not the live CodeMirror
// editor -- this is only for the static markdown view of Note/Prompt/Assistant cells).
function boopAddCopyButtons(root){
    root.querySelectorAll('pre code').forEach(code => {
        const pre = code.parentElement;
        if (pre.querySelector('.boop-copy-btn')) return;
        pre.style.position = 'relative';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'boop-copy-btn';
        btn.title = 'Copy to clipboard';
        btn.innerHTML = COPY_ICON;
        btn.style.cssText = 'position:absolute;top:6px;right:6px;padding:4px;border-radius:6px;'
            + 'background:rgba(0,0,0,.35);color:inherit;opacity:.55;cursor:pointer;line-height:0;';
        btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
        btn.addEventListener('mouseleave', () => { btn.style.opacity = '.55'; });
        btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();  // don't let the click bubble into the cell's edit-on-click handler
            navigator.clipboard.writeText(code.textContent).catch(() => {});
            btn.innerHTML = '✓';
            setTimeout(() => { btn.innerHTML = COPY_ICON; }, 1000);
        });
        pre.appendChild(btn);
    });
}
window.boopAddCopyButtons = boopAddCopyButtons;

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
    boopAddCopyButtons(e);
});
