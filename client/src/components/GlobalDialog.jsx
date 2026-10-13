// client/src/components/GlobalDialog.jsx
// App-wide themed dialog host. Renders the centered modal triggered via
// utils/dialog.js (window.alert override + dialogConfirm calls). Mounted once
// at the app root; subscribes to the singleton emitter on mount.
import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Info, HelpCircle } from 'lucide-react';
import { __setDialogEmitter } from '../utils/dialog';

const TONE = {
  default:  { color: 'var(--brand-primary-ink)', Icon: Info },
  info:     { color: 'var(--brand-primary-ink)', Icon: Info },
  warn:     { color: 'var(--warning-ink)',        Icon: AlertTriangle },
  danger:   { color: 'var(--danger-ink)',         Icon: AlertTriangle },
  question: { color: 'var(--brand-primary-ink)',  Icon: HelpCircle }
};

export default function GlobalDialog() {
  const [req, setReq] = useState(null);

  useEffect(() => {
    __setDialogEmitter(setReq);
    return () => __setDialogEmitter(null);
  }, []);

  const dismiss = useCallback((result) => {
    setReq((cur) => {
      if (cur && cur.resolve) cur.resolve(result);
      return null;
    });
  }, []);

  // Keyboard: Enter confirms, Escape cancels.
  useEffect(() => {
    if (!req) return;
    const onKey = (e) => {
      if (e.key === 'Escape') dismiss(req.mode === 'confirm' ? false : undefined);
      if (e.key === 'Enter' && req.mode === 'confirm') dismiss(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req, dismiss]);

  if (!req) return null;

  const tone = req.mode === 'confirm'
    ? (TONE[req.tone] || TONE.question)
    : (TONE[req.tone] || TONE.info);
  const { Icon } = tone;
  const isConfirm = req.mode === 'confirm';

  return (
    <div className="modal-overlay" onClick={() => dismiss(isConfirm ? false : undefined)}>
      <div
        className="modal-card dialog-card"
        role="alertdialog"
        aria-modal="true"
        aria-label={req.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-body">
          <span className="dialog-icon" style={{ color: tone.color, borderColor: tone.color }}>
            <Icon size={22} />
          </span>
          <div className="dialog-text">
            <h3 className="dialog-title">{req.title}</h3>
            {req.message ? <p className="dialog-message">{req.message}</p> : null}
          </div>
        </div>
        <div className="dialog-actions">
          {isConfirm && (
            <button className="island-btn" onClick={() => dismiss(false)} autoFocus={false}>
              {req.cancelLabel || 'Cancel'}
            </button>
          )}
          <button
            className={`island-btn is-active${req.tone === 'danger' ? ' dialog-danger' : ''}`}
            onClick={() => dismiss(isConfirm ? true : undefined)}
          >
            {req.confirmLabel || (isConfirm ? 'Confirm' : 'OK')}
          </button>
        </div>
      </div>
    </div>
  );
}
