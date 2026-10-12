import React, { useState, useEffect } from 'react';
import { Activity, ShieldCheck, FileSpreadsheet, Building2, Sparkles, ArrowRight } from 'lucide-react';
import BrandLogo from './BrandLogo';

const FEATURES = [
  {
    icon: Activity,
    tag: 'Live Biometrics',
    title: 'Biometric Stream Engine',
    desc: 'Real-time eSSL & ZKTeco device push sync with automated shift matching'
  },
  {
    icon: ShieldCheck,
    tag: 'Statutory Compliance',
    title: 'Indian Labor & Wage Engine',
    desc: 'Code on Wages 2019 min 50% basic, flexible PF 12%–20%, ESI & State PT'
  },
  {
    icon: FileSpreadsheet,
    tag: 'Banking Integration',
    title: 'Multi-Bank Batch NEFT',
    desc: 'Instant salary payment files formatted for HDFC CMS, ICICI CIB & SBI'
  },
  {
    icon: Building2,
    tag: 'Legal Protection',
    title: 'Self-Serve Payroll Vault',
    desc: 'Immutable monthly JSON audit snapshots with pre-flight anomaly radar'
  }
];

export default function SplashScreen({ onFinish }) {
  const [activeStep, setActiveStep] = useState(0);
  const [showBrandReveal, setShowBrandReveal] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Step 0 -> 1 -> 2 -> 3
    const t1 = setTimeout(() => setActiveStep(1), 750);
    const t2 = setTimeout(() => setActiveStep(2), 1500);
    const t3 = setTimeout(() => setActiveStep(3), 2250);

    // Step 4: Brand Reveal
    const t4 = setTimeout(() => {
      setShowBrandReveal(true);
    }, 3000);

    // Step 5: Fade out
    const t5 = setTimeout(() => {
      setFadeOut(true);
    }, 4200);

    // Step 6: Complete
    const t6 = setTimeout(() => {
      if (onFinish) onFinish();
    }, 4600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
      clearTimeout(t6);
    };
  }, [onFinish]);

  const handleSkip = () => {
    setFadeOut(true);
    setTimeout(() => {
      if (onFinish) onFinish();
    }, 200);
  };

  const ActiveIcon = FEATURES[activeStep].icon;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#ffffff',
        backgroundImage: 'radial-gradient(circle at 50% 20%, rgba(16, 185, 129, 0.08) 0%, transparent 60%), radial-gradient(circle at 80% 80%, rgba(59, 130, 246, 0.05) 0%, transparent 50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.4s ease-out',
        pointerEvents: fadeOut ? 'none' : 'all',
        fontFamily: "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      }}
    >
      {/* Top right Skip button */}
      <button
        type="button"
        onClick={handleSkip}
        style={{
          position: 'absolute',
          top: '24px',
          right: '28px',
          background: 'rgba(255, 255, 255, 0.85)',
          border: '1px solid #e2e8f0',
          borderRadius: '9999px',
          padding: '6px 14px',
          fontSize: '12px',
          fontWeight: 600,
          color: '#64748b',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#10b981';
          e.currentTarget.style.color = '#047857';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#e2e8f0';
          e.currentTarget.style.color = '#64748b';
        }}
      >
        <span>Skip to Sign In</span>
        <ArrowRight size={13} />
      </button>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          maxWidth: '520px',
          padding: '24px'
        }}
      >
        {!showBrandReveal ? (
          /* Feature Showcase Phase */
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              animation: 'fadeIn 0.3s ease'
            }}
          >
            {/* Feature Tag Pill */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: '9999px',
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#065f46',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '20px'
              }}
            >
              <Sparkles size={12} />
              <span>{FEATURES[activeStep].tag}</span>
            </div>

            {/* Icon Card */}
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '20px',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                boxShadow: '0 12px 30px -6px rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
                position: 'relative'
              }}
            >
              <ActiveIcon size={36} color="#10b981" />
              <div
                style={{
                  position: 'absolute',
                  inset: '-4px',
                  borderRadius: '24px',
                  border: '2px solid rgba(16, 185, 129, 0.25)',
                  animation: 'pulse 2s infinite'
                }}
              />
            </div>

            {/* Feature Title */}
            <h2
              style={{
                fontSize: '1.45rem',
                fontWeight: 700,
                letterSpacing: '-0.03em',
                color: '#0f172a',
                margin: '0 0 10px 0'
              }}
            >
              {FEATURES[activeStep].title}
            </h2>

            {/* Feature Description */}
            <p
              style={{
                fontSize: '0.925rem',
                color: '#475569',
                lineHeight: 1.5,
                margin: '0 0 28px 0',
                maxWidth: '420px'
              }}
            >
              {FEATURES[activeStep].desc}
            </p>

            {/* Step Indicators */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              {FEATURES.map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    width: activeStep === idx ? '28px' : '8px',
                    height: '6px',
                    borderRadius: '9999px',
                    background: activeStep === idx ? '#10b981' : '#cbd5e1',
                    transition: 'all 0.3s ease'
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          /* Brand Reveal Phase */
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              animation: 'scaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {/* Logo Emblem */}
            <div
              style={{
                width: '84px',
                height: '84px',
                borderRadius: '24px',
                background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 16px 40px -8px rgba(16, 185, 129, 0.4)',
                marginBottom: '20px'
              }}
            >
              <BrandLogo size={48} />
            </div>

            {/* Name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span
                style={{
                  fontSize: '2.5rem',
                  fontWeight: 800,
                  letterSpacing: '-0.05em',
                  color: '#0f172a'
                }}
              >
                myHR
              </span>
              <span
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  background: '#10b981',
                  color: '#ffffff',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  letterSpacing: '0.04em'
                }}
              >
                BY SWANIKI
              </span>
            </div>

            {/* Subtitle */}
            <p
              style={{
                fontSize: '1rem',
                color: '#64748b',
                fontWeight: 500,
                letterSpacing: '-0.02em',
                margin: 0
              }}
            >
              Self-Serve Biometric Attendance & Statutory Payroll Platform
            </p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.08); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
