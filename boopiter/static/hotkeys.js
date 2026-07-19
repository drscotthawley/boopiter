
(function(){
  let lastD = 0;
  const act = (url) => htmx.ajax('POST', url, {target:'#notebook', swap:'outerHTML'});

  // Toggle '# ' comments on the selected lines of a textarea (Cmd/Ctrl+/).
  const toggleComment = (ta) => {
    const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    let le = v.indexOf('\n', e); if (le === -1) le = v.length;
    const lines = v.slice(ls, le).split('\n');
    const commented = lines.every(l => l.trim() === '' || l.trimStart().startsWith('#'));
    const out = commented
      ? lines.map(l => l.replace(/^(\s*)#\s?/, '$1')).join('\n')
      : lines.map(l => l.trim() === '' ? l : l.replace(/^(\s*)/, '$1# ')).join('\n');
    ta.value = v.slice(0, ls) + out + v.slice(le);
    ta.selectionStart = ls; ta.selectionEnd = ls + out.length;
  };

  document.addEventListener('keydown', (e) => {
    const a = document.activeElement;
    if (a && a.closest && a.closest('.CodeMirror')) return;  // CodeMirror handles its own keys
    const inEditor = a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT' || a.isContentEditable);
    const mod = e.metaKey || e.ctrlKey;

    // --- editor shortcuts (fire while typing) ---
    if (mod && !e.shiftKey && e.key === '/') {
      if (a && a.tagName === 'TEXTAREA') { toggleComment(a); e.preventDefault(); }
      return;
    }
    if (mod && e.shiftKey && (e.code === 'Minus' || e.key === '-' || e.key === '_')) {
      if (a && a.id === 'compose-input') {
        htmx.ajax('POST', '/split', {target:'#app', swap:'outerHTML',
                   values:{source: a.value, pos: a.selectionStart}});
        e.preventDefault();
      }
      return;
    }

    // --- command-mode shortcuts (only when not editing) ---
    if (inEditor || e.metaKey || e.ctrlKey || e.altKey) return;
    let handled = true;
    switch (e.key) {
      case 'a': act('/insert?where=above'); break;
      case 'b': act('/insert?where=below'); break;
      case 'j': case 'ArrowDown': act('/select_delta?delta=1');  break;
      case 'k': case 'ArrowUp':   act('/select_delta?delta=-1'); break;
      case 'm': act('/settype_selected?t=note'); break;
      case 'y': act('/settype_selected?t=code'); break;
      case 'r': act('/settype_selected?t=raw');  break;
      case 's': boopSaveNotebook(); break;
      case 'x': act('/cut_selected'); break;
      case 'c': htmx.ajax('POST', '/copy_selected', {swap:'none'}); break;
      case 'v': act('/paste_selected'); break;
      case 'd': { const n = Date.now();
        if (n - lastD < 500) { lastD = 0; act('/del_selected'); }
        else { lastD = n; handled = false; }
        break; }
      default: handled = false;
    }
    if (handled) e.preventDefault();
  });
})();
