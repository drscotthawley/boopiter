
function boopSave(id){
  var cm = window['_boopcm_'+id];
  if(cm) cm.save();
  window._boopFocusAfter = id;
  var ta = document.getElementById('ta-'+id);
  if(ta && ta.form) ta.form.requestSubmit();
}
function boopComposerSubmit(){
  var ta = document.getElementById('compose-input');
  var cm = window._boopComposerCM;
  if(cm && cm.getWrapperElement && cm.getWrapperElement().isConnected) cm.save();
  if(ta && ta.form) ta.form.requestSubmit();
}
function boopRestartServer(){
  if(!confirm('Restart boopiter? Unsaved notebook changes will be lost -- Save first if you want to keep them.')) return;
  fetch('/restart_server', {method:'POST'}).catch(function(){});
  var tries = 0;
  var poll = setInterval(function(){
    tries++;
    fetch('/_boopiter_ping').then(function(r){ if(r.ok){ clearInterval(poll); location.reload(); } }).catch(function(){});
    if(tries > 60) clearInterval(poll);  // ~30s safety timeout
  }, 500);
}
function boopSyncAllEditors(){
  // Flush every currently-open editor's text to the server (no execution) before Save writes to disk --
  // otherwise an edit that was never Shift-Entered would silently vanish, unlike real Jupyter's WYSIWYG save.
  var jobs = [];
  (window._boopcms || []).forEach(function(cm){
    cm.save();
    var id = cm.getTextArea().getAttribute('data-cid');
    if(id) jobs.push(fetch('/sync_cell?id='+id, {method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:'source='+encodeURIComponent(cm.getValue())}));
  });
  document.querySelectorAll('textarea[data-cm="edit"]').forEach(function(ta){
    var id = ta.getAttribute('data-cid');
    if(id) jobs.push(fetch('/sync_cell?id='+id, {method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:'source='+encodeURIComponent(ta.value)}));
  });
  return Promise.all(jobs);
}
function boopSaveNotebook(){
  boopSyncAllEditors().then(function(){ htmx.ajax('POST', '/save_now', {swap:'none'}); });
}
function boopComposerSplit(cm){
  htmx.ajax('POST', '/split', {target:'#notebook', swap:'beforeend',
    values:{source: cm.getValue(), pos: cm.indexFromPos(cm.getCursor())}});
}
function boopSplitCell(id, pos){
  htmx.ajax('POST', '/split_cell?id='+id, {target:'#cell-'+id, swap:'outerHTML', values:{pos: pos}});
}
function boopMakeCM(ta, isComposer){
  var dark = window._boopDark !== false;
  var id = ta.getAttribute('data-cid');
  var extra = isComposer ? {
      'Shift-Enter': boopComposerSubmit, 'Ctrl-Enter': boopComposerSubmit, 'Cmd-Enter': boopComposerSubmit,
      'Ctrl-/': function(cm){ cm.toggleComment(); }, 'Cmd-/': function(cm){ cm.toggleComment(); },
      'Shift-Ctrl--': function(cm){ boopComposerSplit(cm); }, 'Shift-Cmd--': function(cm){ boopComposerSplit(cm); }
    } : {
      'Shift-Enter': function(){ boopSave(id); }, 'Ctrl-Enter': function(){ boopSave(id); }, 'Cmd-Enter': function(){ boopSave(id); },
      'Ctrl-/': function(cm){ cm.toggleComment(); }, 'Cmd-/': function(cm){ cm.toggleComment(); },
      'Shift-Ctrl--': function(cm){ boopSplitCell(id, cm.indexFromPos(cm.getCursor())); },
      'Shift-Cmd--': function(cm){ boopSplitCell(id, cm.indexFromPos(cm.getCursor())); }
    };
  var cm = CodeMirror.fromTextArea(ta, {
    mode:'python', theme: dark?'material-darker':'default',
    lineNumbers:true, lineWrapping:false, viewportMargin:Infinity, indentUnit:4, extraKeys: extra
  });
  if(isComposer){
    window._boopComposerCM = cm; cm.focus();
    // Focusing the composer (bottom of the page) auto-scrolls it into view -- fine after the
    // user's own actions (e.g. Boop-ing a cell re-inits the composer), but on the very first
    // page load it means you land at the bottom of the notebook instead of the top, like Jupyter.
    if (window._boopFirstLoad) {
      window._boopFirstLoad = false;
      var scroller = document.querySelector('.overflow-y-auto');
      requestAnimationFrame(function(){ requestAnimationFrame(function(){
        window.scrollTo(0, 0);
        if (scroller) scroller.scrollTop = 0;
      }); });
    }
  }
  else {
    window['_boopcm_'+id] = cm; (window._boopcms = window._boopcms || []).push(cm);
    if(String(window._boopFocusAfter) === String(id)){
      window._boopFocusAfter = null; cm.focus(); cm.setCursor(cm.lineCount(), 0);
    }
  }
  return cm;
}
function boopCopy(id, ctype){
  var cm = window['_boopcm_'+id];
  var text;
  if(ctype === 'code' && cm){ text = cm.getValue(); }
  else {
    var btn = document.getElementById('copy-'+id);
    text = btn ? (btn.getAttribute('data-src') || '') : '';
  }
  navigator.clipboard.writeText(text).catch(function(){});
}
function boopRenderAnsi(root){
  if(!window.AnsiUp) return;  // module still loading; a later retry will pick these up
  var scope = (root && root.querySelectorAll) ? root : document;
  scope.querySelectorAll('.ansi-out:not([data-ansi-done])').forEach(function(el){
    el.setAttribute('data-ansi-done', '1');
    var au = new window.AnsiUp(); au.use_classes = false;
    el.innerHTML = au.ansi_to_html(el.textContent);
  });
}
function boopInitEditors(root){
  var scope = (root && root.querySelectorAll) ? root : document;
  scope.querySelectorAll('textarea[data-cm]:not([data-cminit])').forEach(function(ta){
    ta.setAttribute('data-cminit', '1');
    var kind = ta.getAttribute('data-cm');
    if(kind === 'code'){ if(window.CodeMirror) boopMakeCM(ta, false); }
    else if(kind === 'composer'){ if(window.CodeMirror) boopMakeCM(ta, true); }
    else if(kind === 'edit'){
      ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      ta.addEventListener('keydown', function(e){
        if((e.shiftKey||e.ctrlKey||e.metaKey) && e.key === 'Enter'){ e.preventDefault(); boopSave(ta.getAttribute('data-cid')); }
        else if((e.ctrlKey||e.metaKey) && e.shiftKey && (e.code === 'Minus' || e.key === '-' || e.key === '_')){
          e.preventDefault(); boopSplitCell(ta.getAttribute('data-cid'), ta.selectionStart);
        }
      });
    }
  });
  boopRenderAnsi(scope);
  if(window.boopHighlight) boopHighlight(scope);  // static code-cell views + note-cell fences alike
}
if(window.htmx) htmx.onLoad(boopInitEditors);
