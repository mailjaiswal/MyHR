import React, { useState, useEffect } from 'react';
import { Activity, ShieldCheck, Sparkles } from 'lucide-react';

export default function SplashScreen({ onFinish }) {
  const [statusText, setStatusText] = useState('Initializing myHR by Swaniki...');
  const [progress, setProgress] = useState(15);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => {
      setProgress(45);
      setStatusText('Syncing eSSL & ZKTeco biometric stream...');
    }, 400);

    const t2 = setTimeout(() => {
      setProgress(85);
      setStatusText('Loading enterprise rosters & statutory rules...');
    }, 800);

    const t3 = setTimeout(() => {
      setProgress(100);
      setStatusText('Workspace Ready');
      setFadeOut(true);
    }, 1200);

    const t4 = setTimeout(() => {
      if (onFinish) onFinish();
    }, 1500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onFinish]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--bg-canvas)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      opacity: fadeOut ? 0 : 1,
      transition: 'opacity 0.35s ease',
      pointerEvents: fadeOut ? 'none' : 'all'
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        maxWidth: '380px',
        padding: '2rem'
      }}>
        {/* Animated Swaniki Brand Emblem */}
        <div style={{
          width: '4.5rem',
          height: '4.5rem',
          borderRadius: '1.25rem',
          background: 'linear-gradient(135deg, #10b981, #059669)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 12px 30px -4px rgba(16, 185, 129, 0.4)',
          marginBottom: '1.5rem',
          position: 'relative'
        }}>
          <Activity size={36} color="#ffffff" />
          <div style={{
            position: 'absolute',
            inset: '-6px',
            borderRadius: '1.5rem',
            border: '2px dashed rgba(16, 185, 129, 0.5)',
            animation: 'spin 12s linear infinite'
          }} />
        </div>

        {/* Brand Name & Typography */}
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 900,
          letterSpacing: '-0.04em',
          color: 'var(--text-heading)',
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem'
        }}>
          <span>myHR</span>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 800,
            background: 'var(--brand-primary)',
            color: '#fff',
            padding: '0.15rem 0.5rem',
            borderRadius: '0.375rem',
            letterSpacing: '0.02em'
          }}>
            BY SWANIKI
          </span>
        </h1>

        {/* Sleek Minimalist Progress Bar */}
        <div style={{
          width: '100%',
          height: '4px',
          background: 'var(--border-color)',
          borderRadius: '9999px',
          overflow: 'hidden',
          marginBottom: '0.75rem'
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            background: 'var(--brand-primary)',
            borderRadius: '9999px',
            transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }} />
        </div>

        <p style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--text-caption)',
          letterSpacing: '-0.01em'
        }}>
          {statusText}
        </p>
      </div>
    </div>
  );
}
