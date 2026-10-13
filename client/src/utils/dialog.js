// client/src/utils/dialog.js
// App-wide themed dialog bridge. Lets any module (and the global window.alert
// override) trigger the React <GlobalDialog/> without prop-drilling.
//
// Why an override for alert but explicit calls for confirm:
//   • alert() is fire-and-forget, so replacing window.alert catches all ~60
//     existing call sites with zero edits and shows a centered themed modal.
//   • confirm() must return synchronously in JS, which a DOM modal cannot do,
//     so confirm() call sites are migrated to `await dialogConfirm(...)`
//     (returns a Promise<boolean>).

let emit = null;

// GlobalDialog registers its renderer here on mount.
export function __setDialogEmitter(fn) { emit = fn; }

function show(opts) {
  return new Promise((resolve) => {
    if (!emit) {
      // Dialog host not mounted yet (e.g. very early boot) — fall back to the
      // native control so behaviour is never silently lost.
      if (opts.mode === 'confirm') resolve(true);
      else resolve(undefined);
      return;
    }
    emit({ ...opts, resolve });
  });
}

/** Show a themed centered alert. Resolves when dismissed. */
export function dialogAlert(message, { title = 'Notice', tone = 'default', confirmLabel = 'OK' } = {}) {
  return show({ mode: 'alert', title, message: String(message ?? ''), tone, confirmLabel });
}

/** Show a themed centered confirm. Resolves true (confirmed) / false (cancelled). */
export function dialogConfirm(message, {
  title = 'Please confirm',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default'
} = {}) {
  return show({ mode: 'confirm', title, message: String(message ?? ''), confirmLabel, cancelLabel, tone });
}

let installed = false;
/** Replace native window.alert with the themed dialog. Call once at app boot. */
export function installDialogOverrides() {
  if (installed) return;
  installed = true;
  window.alert = (msg) => { dialogAlert(msg); };
}
