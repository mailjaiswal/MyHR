import React, { useState } from 'react';
import { FlaskConical, Cpu, Radio, CalendarClock, Database, Table2, AlertCircle } from 'lucide-react';
import DeviceSimulatorModal from '../components/DeviceSimulatorModal';
import CustomReportModal from '../components/CustomReportModal';
import AnubhavPartnerHub from './AnubhavPartnerHub';
import ShiftRoster from './ShiftRoster';
import DataSources from './DataSources';

const TABS = [
  { key: 'simulator', label: 'Device Simulator', icon: Cpu },
  { key: 'gateway', label: 'Hardware Gateway', icon: Radio },
  { key: 'roster', label: '24×7 Roster', icon: CalendarClock },
  { key: 'sources', label: 'Data Sources', icon: Database },
  { key: 'reports', label: 'Custom Reports', icon: Table2 }
];

export default function DemoLab({ demoKey }) {
  const [tab, setTab] = useState(demoKey || 'simulator');
  const [simOpen, setSimOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const active = TABS.find(t => t.key === (demoKey && tab === demoKey ? demoKey : tab)) || TABS[0];

  const renderBody = () => {
    switch (tab) {
      case 'simulator':
        return simOpen ? (
          <DeviceSimulatorModal isOpen onClose={() => setSimOpen(false)} />
        ) : (
          <div className="swaniki-card" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', textAlign: 'center' }}>
            <Cpu size={34} style={{ color: 'var(--brand-indigo)' }} />
            <h3>Punch-in simulator</h3>
            <p style={{ maxWidth: 420 }}>Simulate a biometric punch against the live backend — pick an employee, device and verification mode.</p>
            <button className="btn btn-primary" onClick={() => setSimOpen(true)}><Cpu size={15} /> Open simulator</button>
          </div>
        );
      case 'gateway':
        return <AnubhavPartnerHub onOpenSimulator={() => setTab('simulator')} />;
      case 'roster':
        return <ShiftRoster />;
      case 'sources':
        return <DataSources />;
      case 'reports':
        return reportOpen ? (
          <CustomReportModal isOpen onClose={() => setReportOpen(false)} />
        ) : (
          <div className="swaniki-card" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', textAlign: 'center' }}>
            <Table2 size={34} style={{ color: 'var(--brand-amber)' }} />
            <h3>Custom report builder</h3>
            <p style={{ maxWidth: 420 }}>Client-side generation of muster, attendance and payroll registers with PDF printing.</p>
            <button className="btn btn-primary" onClick={() => setReportOpen(true)}><Table2 size={15} /> Generate report</button>
          </div>
        );
      default:
        return <DataSources />;
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-title-wrap">
          <h1>Demo Lab</h1>
          <span className="page-desc">Experimental tools wired to the live backend for concept walkthroughs.</span>
        </div>
      </div>

      <div className="demo-banner">
        <AlertCircle size={16} />
        <span>These tools are demonstration content from the concept build. They talk to real services, but your day-to-day operations live under Main.</span>
      </div>

      <div className="demo-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`demo-tab ${tab === t.key ? 'demo-tab-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      <div key={tab} className="section-card" style={{ padding: '1.5rem' }}>
        <FlaskConical size={16} style={{ color: 'var(--brand-indigo)', marginBottom: '0.75rem' }} />
        {renderBody()}
      </div>
    </div>
  );
}