
function boopToggleVis(id){
  // Flip the eye/eye-slash icon and the cell's own dimming instantly (CSS class toggles, no DOM
  // swap) and persist in the background -- same idea as boopToggleExport() below. Both icons are
  // always in the DOM (see cell_toolbar()); only 'hidden' moves between them, since unlike a fill
  // color, a CSS class can't morph one icon's path data into another's.
  var btn = document.getElementById('vis-btn-'+id);
  var cellDiv = document.getElementById('cell-'+id);
  if(!btn || !cellDiv) return;
  var eye = btn.querySelector('.vis-eye'), eyeSlash = btn.querySelector('.vis-eye-slash');
  var willBeVisible = cellDiv.classList.contains('opacity-70');  // currently dimmed -> about to become visible
  eye.classList.toggle('hidden', !willBeVisible);
  eyeSlash.classList.toggle('hidden', willBeVisible);
  cellDiv.classList.toggle('opacity-70', !willBeVisible);
  btn.classList.toggle('text-error', !willBeVisible);
  btn.setAttribute('data-tip', willBeVisible ? 'Hide from LLM' : 'Show to LLM');
  fetch('/toggle_vis?id='+id, {method:'POST'}).catch(function(){});
}
function boopToggleExport(id){
  // Flip the bookmark icon's look instantly (pure CSS class toggle, no DOM swap -- see the
  // .icon-fillable/.icon-filled rule in daisy_hdrs) and persist the flag in the background.
  // Replaces an old outerHTML swap of the whole cell just for a one-icon color change, which
  // was visibly flickering the page for something that should be instant.
  var btn = document.getElementById('export-btn-'+id);
  if(!btn) return;
  var svg = btn.querySelector('svg');
  var nowOn = !btn.classList.contains('text-success');
  btn.classList.toggle('text-success', nowOn);
  if(svg) svg.classList.toggle('icon-filled', nowOn);
  btn.setAttribute('data-tip', nowOn ? 'Exported (#| export)' : 'Not exported');
  fetch('/toggle_export?id='+id, {method:'POST'}).catch(function(){});
}
function boopCancelEdit(id){
  // Same request the Cancel button makes -- exits whichever editing mode this cell is in
  // (CodeMirror or the plain textarea) back to its static view, discarding unsaved edits.
  htmx.ajax('GET', '/view_cell?id='+id, {target:'#cell-'+id, swap:'outerHTML'});
}
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
  // A dark overlay from the moment we click through to the moment location.reload() actually
  // fires a real navigation -- covering the whole restart window (not just the reload instant)
  // means there's no way to mistake a still-stale page for the new one; the overlay only ever
  // goes away via a genuine fresh page load, never by JS alone.
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(17,17,17,.92);'
    + 'color:#ccc;display:flex;align-items:center;justify-content:center;font-size:1.1rem;'
    + 'font-family:system-ui,sans-serif;';
  overlay.textContent = 'Restarting boopiter…';
  document.body.appendChild(overlay);
  fetch('/restart_server', {method:'POST'}).catch(function(){});
  // The old process keeps serving _boopiter_ping (and everything else) for as long as
  // nbdev-export takes -- restart_server() runs that in a background thread, so the *first*
  // ping after clicking almost always still hits the *old* server, not the new one. Reloading
  // on that first success reloads too early (looks like a flicker, still stale code). Only
  // reload once we've actually observed a failed ping (the old process is genuinely gone)
  // followed by a success (the new one is up) -- and if we somehow never catch the down-moment
  // in our polling interval, fall back to reloading anyway once we time out.
  var tries = 0, wentDown = false;
  var poll = setInterval(function(){
    tries++;
    fetch('/_boopiter_ping').then(function(r){
      if(r.ok && wentDown){ clearInterval(poll); location.reload(); }
    }).catch(function(){ wentDown = true; });
    if(tries > 60){ clearInterval(poll); location.reload(); }  // ~30s safety timeout -- reload anyway rather than hang forever
  }, 500);
}
function boopShutdownServer(){
  if(!confirm('Shut down boopiter? Unsaved notebook changes will be lost -- Save first if you want to keep them.')) return;
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(17,17,17,.92);'
    + 'color:#ccc;display:flex;align-items:center;justify-content:center;font-size:1.1rem;'
    + 'font-family:system-ui,sans-serif;';
  overlay.textContent = 'Shutting down boopiter…';
  document.body.appendChild(overlay);
  // Unlike restart, the process never comes back -- no reload-on-reconnect polling, just fire
  // the request and leave the overlay up for good.
  fetch('/shutdown_server', {method:'POST'}).catch(function(){});
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
// Guards against a rapid double Ctrl/Cmd-- (key-repeat, or just a fast double-press before the
// first split's DOM swap lands) firing two overlapping /split requests against the same
// pre-split state -- both would read the same not-yet-truncated source and each spawn their own
// new cell, leaving an exact duplicate behind. One in-flight split per source (id, or 'composer')
// at a time; the lock clears once that request settles, success or failure.
var _boopSplitInFlight = new Set();
function boopComposerSplit(cm){
  if(_boopSplitInFlight.has('composer')) return;
  _boopSplitInFlight.add('composer');
  htmx.ajax('POST', '/split', {target:'#notebook', swap:'beforeend',
    values:{source: cm.getValue(), pos: cm.indexFromPos(cm.getCursor())}})
    .finally(function(){ _boopSplitInFlight.delete('composer'); });
}
// `pos` is only meaningful against the exact text it was measured in, so send that text along --
// same as boopComposerSplit() above. Sending pos alone made the server slice its own last-saved
// copy of the cell, which is stale the moment you type anything without saving: the caret offset
// then points into one string while the split happens in another, dropping text on the wrong side.
// These values ride as urlencoded params, not a form submission, so they keep their '\n' newlines
// (a form-submitted <textarea> would CRLF-normalize them -- see the Cell.source setter).
function boopSplitCell(id, pos, source){
  if(_boopSplitInFlight.has(id)) return;
  _boopSplitInFlight.add(id);
  htmx.ajax('POST', '/split_cell?id='+id, {target:'#cell-'+id, swap:'outerHTML', values:{pos: pos, source: source}})
    .finally(function(){ _boopSplitInFlight.delete(id); });
}
function boopMakeCM(ta, isComposer){
  var dark = window._boopDark !== false;
  var id = ta.getAttribute('data-cid');
  var extra = isComposer ? {
      'Shift-Enter': boopComposerSubmit, 'Ctrl-Enter': boopComposerSubmit, 'Cmd-Enter': boopComposerSubmit,
      'Ctrl-/': function(cm){ cm.toggleComment(); }, 'Cmd-/': function(cm){ cm.toggleComment(); },
      'Ctrl--': function(cm){ boopComposerSplit(cm); }, 'Cmd--': function(cm){ boopComposerSplit(cm); }
    } : {
      'Shift-Enter': function(){ boopSave(id); }, 'Ctrl-Enter': function(){ boopSave(id); }, 'Cmd-Enter': function(){ boopSave(id); },
      'Ctrl-/': function(cm){ cm.toggleComment(); }, 'Cmd-/': function(cm){ cm.toggleComment(); },
      'Ctrl--': function(cm){ boopSplitCell(id, cm.indexFromPos(cm.getCursor()), cm.getValue()); },
      'Cmd--': function(cm){ boopSplitCell(id, cm.indexFromPos(cm.getCursor()), cm.getValue()); },
      'Esc': function(){ boopCancelEdit(id); }  // code cells only -- the composer keeps its own default Esc behavior (nothing to "cancel" there)
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
function boopInsertAtCursor(ta, text){
  var s = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + text.length;
}
function boopUploadImage(file, insert){
  // Shared tail of both image entry points (paste + drag-and-drop): read the file as a data URL,
  // upload to /paste_image (which stashes it under the server's .boopiter/images/), and hand the
  // returned markdown tag to `insert` for caret placement (see paste_image() in cells.py).
  var rd = new FileReader();
  rd.onload = function(){
    fetch('/paste_image', {method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:'data='+encodeURIComponent(rd.result)})
    .then(function(r){ if(r.ok) return r.text(); })
    .then(function(md){ if(md) insert(md); })
    .catch(function(){});
  };
  rd.readAsDataURL(file);
}
function boopHandleImagePaste(e, insert){
  // If the clipboard holds an image, claim the paste and upload it. Text-only pastes fall through
  // untouched -- preventDefault only fires once an image item is actually found, so normal pasting
  // never breaks.
  var items = (e.clipboardData && e.clipboardData.items) || [];
  for(var i = 0; i < items.length; i++){
    if(items[i].type && items[i].type.indexOf('image/') === 0){
      e.preventDefault();
      boopUploadImage(items[i].getAsFile(), insert);
      return;
    }
  }
}
function boopWireImageDrop(ta){
  // Drag-and-drop images into an editing textarea: while a file hovers over the area, a green
  // dashed outline + slight brightening signals "drop here"; on drop, every image file uploads
  // and its markdown lands at the current caret (NOT the mouse position -- caret placement in a
  // textarea from drop coordinates is unreliable across browsers, and the user asked for caret).
  // Inline styles rather than Tailwind classes: the precompiled CSS only contains classes seen at
  // build time, so class names minted here in JS could silently compile to nothing.
  function isFileDrag(e){
    var ts = e.dataTransfer && e.dataTransfer.types;
    return ts && Array.prototype.indexOf.call(ts, 'Files') >= 0;
  }
  function off(){ ta.style.outline = ''; ta.style.outlineOffset = ''; ta.style.filter = ''; }
  ta.addEventListener('dragover', function(e){
    if(!isFileDrag(e)) return;
    e.preventDefault();  // required, or the browser refuses the drop entirely
    e.dataTransfer.dropEffect = 'copy';
    ta.style.outline = '3px dashed #22c55e'; ta.style.outlineOffset = '-3px';
    ta.style.filter = 'brightness(1.18)';
  });
  ta.addEventListener('dragleave', off);
  ta.addEventListener('drop', function(e){
    off();
    if(!isFileDrag(e)) return;
    e.preventDefault();  // even for non-image files -- the default is the browser navigating away to open the file
    var fs = e.dataTransfer.files || [];
    for(var i = 0; i < fs.length; i++){
      if(fs[i].type && fs[i].type.indexOf('image/') === 0){
        boopUploadImage(fs[i], function(md){ boopInsertAtCursor(ta, md); });
      }
    }
  });
}
// Same slot and markup the server-side _toast() (cells.py) swaps into for 'Saved', so a copy
// confirmation looks identical to a save one -- but built here in the browser, because copying
// never reaches the server (see boopCopy) and a round-trip just to say 'Copied' would be slower
// than the thing it's confirming. Re-setting innerHTML also restarts the 1.8s timer, so mashing
// the button repeatedly keeps one notice on screen rather than stacking them.
function boopToast(msg, ok){
  var slot = document.getElementById('save-toast');
  if(!slot) return;
  var kind = (ok === false) ? 'alert-error' : 'alert-success';
  slot.innerHTML = '<div class="alert ' + kind + ' shadow-lg text-sm py-2 px-4"></div>';
  slot.firstChild.textContent = msg;  // textContent, not innerHTML -- msg must never be parsed as markup
  clearTimeout(window._booptoastt);
  window._booptoastt = setTimeout(function(){ slot.innerHTML = ''; }, 1800);
}
// Copy an arbitrary string (the share panel's URL) with the same confirmation as boopCopy.
function boopCopyText(text){
  navigator.clipboard.writeText(text).then(function(){ boopToast('Copied'); },
                                          function(){ boopToast('Copy failed', false); });
}
function boopCopy(id, ctype){
  var cm = window['_boopcm_'+id];
  var text;
  if(ctype === 'code' && cm){ text = cm.getValue(); }
  else {
    var btn = document.getElementById('copy-'+id);
    text = btn ? (btn.getAttribute('data-src') || '') : '';
  }
  // Confirm only once the write actually resolves -- the clipboard API can be refused (no permission,
  // or a non-secure origin), and claiming 'Copied' when nothing was would be worse than staying quiet.
  navigator.clipboard.writeText(text).then(function(){ boopToast('Copied'); },
                                          function(){ boopToast('Copy failed', false); });
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
function boopScrollRunAll(root){
  // Run All tags each cell's placeholder with data-runall-scroll (see pending_code_cell) as it
  // starts, so the view follows down the notebook cell-by-cell. Solo play/Shift-Enter runs never
  // set the attribute, so a cell you clicked yourself never jumps around. Fires via the same
  // htmx.onLoad hook that lands the placeholder (works for OOB swaps too, like boopRenderAnsi).
  if(!root || !root.querySelector) return;  // only ever act on the freshly-swapped content -- never a document-wide scan, which could scroll to a stale tag left elsewhere
  var el = (root.matches && root.matches('[data-runall-scroll]')) ? root : root.querySelector('[data-runall-scroll]');
  if(el){ el.removeAttribute('data-runall-scroll'); el.scrollIntoView({behavior:'smooth', block:'center'}); }
}
function boopInitEditors(root){
  var scope = (root && root.querySelectorAll) ? root : document;
  scope.querySelectorAll('textarea[data-cm]:not([data-cminit])').forEach(function(ta){
    ta.setAttribute('data-cminit', '1');
    var kind = ta.getAttribute('data-cm');
    if(kind === 'code'){ if(window.CodeMirror) boopMakeCM(ta, false); }
    else if(kind === 'composer'){ if(window.CodeMirror) boopMakeCM(ta, true); }
    else if(kind === 'composer-plain'){
      // The note/prompt/raw composer: a bare textarea (no CodeMirror), tagged with this kind purely
      // so image paste works there -- it's where prompts usually start life. No focus/keydown setup
      // here: the composer's own inline onkeydown already handles submit, and stealing focus on
      // every htmx swap would be wrong for a bottom-of-page input.
      ta.addEventListener('paste', function(e){ boopHandleImagePaste(e, function(md){ boopInsertAtCursor(ta, md); }); });
      boopWireImageDrop(ta);
    }
    else if(kind === 'edit'){
      ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      ta.addEventListener('paste', function(e){ boopHandleImagePaste(e, function(md){ boopInsertAtCursor(ta, md); }); });
      boopWireImageDrop(ta);
      ta.addEventListener('keydown', function(e){
        if((e.shiftKey||e.ctrlKey||e.metaKey) && e.key === 'Enter'){ e.preventDefault(); boopSave(ta.getAttribute('data-cid')); }
        else if((e.ctrlKey||e.metaKey) && (e.code === 'Minus' || e.key === '-' || e.key === '_')){
          e.preventDefault(); boopSplitCell(ta.getAttribute('data-cid'), ta.selectionStart, ta.value);
        }
        else if(e.key === 'Escape'){ e.preventDefault(); boopCancelEdit(ta.getAttribute('data-cid')); }
      });
    }
  });
  boopRenderAnsi(scope);
  if(window.boopHighlight) boopHighlight(scope);  // static code-cell views + note-cell fences alike
  boopScrollRunAll(root);  // pass root, not scope -- scope falls back to document on full page load, which must never drive a scroll
}
if(window.htmx) htmx.onLoad(boopInitEditors);
