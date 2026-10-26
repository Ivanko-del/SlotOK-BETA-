// ============================================================
// Діалог підтвердження в стилі застосунку (замість системного confirm()).
// confirmAction({ title, text, confirm, cancel, danger }) → Promise<boolean>
// Для критичних дій: ліміти, самовиключення, вивід, поповнення.
// Esc / клік по тлу — скасування; фокус ставиться на «Скасувати», щоб
// випадковий Enter не підтверджував небезпечну дію.
// ============================================================
function confirmAction(opts) {
  opts = opts || {};
  return new Promise(resolve => {
    const prevFocus = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop is-sheet';
    wrap.setAttribute('role', 'presentation');
    const id = 'cfm' + Date.now();
    wrap.innerHTML = `
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="${id}-t" aria-describedby="${id}-d">
        <h2 class="dialog-title" id="${id}-t"></h2>
        <p class="dialog-text" id="${id}-d"></p>
        <div class="dialog-actions">
          <button type="button" class="btn btn-secondary" data-act="no"></button>
          <button type="button" class="btn ${opts.danger ? 'btn-danger is-solid' : 'btn-primary'}" data-act="yes"></button>
        </div>
      </div>`;
    wrap.querySelector('.dialog-title').textContent = opts.title || 'Підтвердити дію?';
    wrap.querySelector('.dialog-text').textContent = opts.text || '';
    wrap.querySelector('[data-act="no"]').textContent = opts.cancel || 'Скасувати';
    wrap.querySelector('[data-act="yes"]').textContent = opts.confirm || 'Підтвердити';
    const done = (val) => {
      document.removeEventListener('keydown', onKey, true);
      wrap.remove();
      if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) {}
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      if (e.key === 'Tab') { // утримуємо фокус у діалозі
        const f = [...wrap.querySelectorAll('button')];
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    };
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) return done(false);
      const act = e.target.closest('[data-act]');
      if (act) done(act.getAttribute('data-act') === 'yes');
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(wrap);
    wrap.querySelector('[data-act="no"]').focus();
  });
}
