
window._boopcms = window._boopcms || [];
window._boopFirstLoad = true;  // guards the composer's initial-focus scroll -- see boopMakeCM in edit.js
var _HLJS = {
  dark:  'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release/build/styles/atom-one-dark.min.css',
  light: 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release/build/styles/atom-one-light.min.css'
};
function boopApplyTheme(dark){
  // The data-theme flip below is what you actually SEE (DaisyUI restyles via CSS instantly) --
  // but JS blocks painting until this function returns. setTimeout(fn,0) merely schedules the
  // CodeMirror re-theme soon, it doesn't guarantee a paint happens first. Double-rAF does: the
  // first rAF fires before the *next* paint, the second fires before the paint *after that* --
  // by then the browser has definitely painted the data-theme change already.
  window._boopDark = dark;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  var hl = document.getElementById('hljs-theme');
  if(hl) hl.href = dark ? _HLJS.dark : _HLJS.light;
  try { localStorage.setItem('boopDark', dark ? '1' : '0'); } catch(e){}
  requestAnimationFrame(function(){ requestAnimationFrame(function(){
    // Re-theme on-screen editors first (so the visible part of the page finishes fast), then
    // let the browser paint, then catch up the rest -- rather than one big synchronous sweep.
    var vh = window.innerHeight;
    var onscreen = [], offscreen = [];
    window._boopcms.forEach(function(cm){
      var r = cm.getWrapperElement().getBoundingClientRect();
      (r.bottom >= 0 && r.top <= vh ? onscreen : offscreen).push(cm);
    });
    var retheme = function(cm){ cm.setOption('theme', dark ? 'material-darker' : 'default'); };
    onscreen.forEach(retheme);
    if(window._boopComposerCM) retheme(window._boopComposerCM);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){
      offscreen.forEach(retheme);
    }); });
  }); });
}
function boopThemeToggle(cb){ boopApplyTheme(cb.checked); }
document.addEventListener('DOMContentLoaded', function(){
  var saved = null; try { saved = localStorage.getItem('boopDark'); } catch(e){}
  var dark = (saved === null) ? true : (saved === '1');
  var cb = document.getElementById('theme-toggle');
  if(cb) cb.checked = dark;
  boopApplyTheme(dark);
});

// Right-click anywhere -> the same New/Open/Save/Download/Restart Server menu as the hamburger
// (see context_menu() in cells.py), positioned at the cursor. Any click (an item, or elsewhere)
// closes it again.
document.addEventListener('contextmenu', function(e){
  var menu = document.getElementById('context-menu');
  if(!menu) return;
  e.preventDefault();
  menu.classList.remove('hidden');
  var w = menu.offsetWidth || 160, h = menu.offsetHeight || 200;
  menu.style.left = Math.max(4, Math.min(e.clientX, window.innerWidth - w - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(e.clientY, window.innerHeight - h - 4)) + 'px';
});
document.addEventListener('click', function(e){
  var menu = document.getElementById('context-menu');
  if(!menu || menu.classList.contains('hidden')) return;
  menu.classList.add('hidden');
});
