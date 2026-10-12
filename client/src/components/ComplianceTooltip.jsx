import React, { useState, useRef, useEffect } from 'react';
import { Info, ShieldAlert, ExternalLink } from 'lucide-react';

/**
 * ComplianceTooltip - Interactive (i) statutory guide popover
 * Follows strict Light Theme with emerald accents and explicit non-advisory disclaimer.
 */
export default function ComplianceTooltip({
  title = 'Statutory Compliance Notice',
  rule = '',
  range = '',
  lawCitation = 'The Code on Wages, 2019 / Statutory Guidelines',
  placement = 'top'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <span
      ref={containerRef}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
        position: 'relative',
        marginLeft: '4px'
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        aria-label="Statutory compliance guideline"
        style={{
          background: isOpen ? '#ecfdf5' : '#f1f5f9',
          border: isOpen ? '1px solid #10b981' : '1px solid #cbd5e1',
          borderRadius: '50%',
          width: '18px',
          height: '18px',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: isOpen ? '#047857' : '#64748b',
          transition: 'all 0.15s ease'
        }}
        title="Click to view Indian statutory rule & guidance"
      >
        <Info size={11} strokeWidth={2.5} />
      </button>

      {isOpen && (
        <div
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: placement === 'top' ? 'calc(100% + 8px)' : 'auto',
            top: placement === 'bottom' ? 'calc(100% + 8px)' : 'auto',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '280px',
            maxWidth: '90vw',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
            padding: '12px',
            zIndex: 9999,
            textAlign: 'left',
            fontFamily: 'inherit',
            fontSize: '12px',
            lineHeight: 1.45,
            color: '#1e293b'
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <span
              style={{
                background: '#d1fae5',
                color: '#065f46',
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}
            >
              Statutory Guide
            </span>
            <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '12px' }}>
              {title}
            </span>
          </div>

          {/* Rule description */}
          {rule && (
            <p style={{ margin: '0 0 6px 0', color: '#334155', fontSize: '11.5px' }}>
              {rule}
            </p>
          )}

          {/* Allowed range badge */}
          {range && (
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '6px 8px',
                marginBottom: '8px',
                fontSize: '11px',
                color: '#0f172a'
              }}
            >
              <strong style={{ color: '#059669' }}>Legal / Config Range: </strong> {range}
            </div>
          )}

          {/* Citation */}
          {lawCitation && (
            <div style={{ fontSize: '10px', color: '#64748b', fontStyle: 'italic', marginBottom: '8px' }}>
              Ref: {lawCitation}
            </div>
          )}

          {/* Absolution / Self-serve disclaimer */}
          <div
            style={{
              borderTop: '1px solid #f1f5f9',
              paddingTop: '6px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '4px',
              fontSize: '10px',
              color: '#94a3b8'
            }}
          >
            <ShieldAlert size={12} color="#f59e0b" style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>
              Self-Serve Calculation Tool Notice: Reference only. Verify with your legal counsel or tax consultant.
            </span>
          </div>
        </div>
      )}
    </span>
  );
}
