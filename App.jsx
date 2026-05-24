import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Calendar, Users, MapPin, X, Edit2, Trash2,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronRight, ChevronLeft,
  Briefcase, Clock, Settings, LayoutDashboard, ListChecks,
  Banknote, ArrowDownLeft, ArrowUpRight, Search, AlertCircle,
  Wallet, ReceiptText, FileText, CalendarDays, Building2, Download,
  Printer, ArrowLeft, Check
} from 'lucide-react';

import { createClient } from '@supabase/supabase-js';

// Supabase client — reads from .env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
// If not configured the app falls back to localStorage automatically.
const _sbUrl = import.meta.env?.VITE_SUPABASE_URL;
const _sbKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;
const supabase = (_sbUrl && _sbKey) ? createClient(_sbUrl, _sbKey) : null;

// ---------- Helpers ----------
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (isoDate, days) => {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + (days || 0));
  return d.toISOString().slice(0, 10);
};
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtDateShort = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};
const daysFromToday = (iso) => {
  if (!iso) return 0;
  const today = new Date(todayISO() + 'T00:00:00');
  const target = new Date(iso + 'T00:00:00');
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
};

// Time math for templates
function parseTime(t) {
  if (!t || typeof t !== 'string') return null;
  const [h, m] = t.split(':').map(Number);
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
}
function timeDiffHours(start, end) {
  const s = parseTime(start);
  const e = parseTime(end);
  if (!s || !e) return 0;
  let sm = s.h * 60 + s.m;
  let em = e.h * 60 + e.m;
  if (em <= sm) em += 24 * 60; // wraps overnight
  return Math.round((em - sm) / 60 * 100) / 100;
}

// Pastel colour palette for shift templates
const TEMPLATE_PALETTE = [
  { bg: '#FED7AA', text: '#9A3412', border: '#FB923C' }, // orange
  { bg: '#FBCFE8', text: '#9D174D', border: '#F472B6' }, // pink
  { bg: '#BFDBFE', text: '#1E40AF', border: '#60A5FA' }, // blue
  { bg: '#BBF7D0', text: '#166534', border: '#4ADE80' }, // green
  { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' }, // amber
  { bg: '#DDD6FE', text: '#5B21B6', border: '#A78BFA' }, // purple
  { bg: '#FECACA', text: '#991B1B', border: '#F87171' }, // red
  { bg: '#A7F3D0', text: '#065F46', border: '#34D399' }, // emerald
];
function paletteAt(i) { return TEMPLATE_PALETTE[((i % TEMPLATE_PALETTE.length) + TEMPLATE_PALETTE.length) % TEMPLATE_PALETTE.length]; }

// ---------- Storage ----------
const STORAGE_KEY = 'security-tracker-v1';

// Local storage adapter (artifact + browser fallback)
const localAdapter = (() => {
  const hasArtifactStorage = typeof window !== 'undefined' && window.storage && typeof window.storage.get === 'function';
  if (hasArtifactStorage) return window.storage;
  return {
    async get(key) {
      try { const v = localStorage.getItem(key); return v ? { key, value: v } : null; } catch { return null; }
    },
    async set(key, value) {
      try { localStorage.setItem(key, value); return { key, value }; } catch { return null; }
    },
  };
})();

const defaultData = {
  clients: [],
  workers: [],
  sites: [],
  shifts: [],
  invoices: [],
  shiftTemplates: [],
  settings: { currency: '£', invoiceCounter: 1 }
};

// Migrate older data shapes into the current one without losing anything.
function migrate(raw) {
  const d = { ...defaultData, ...raw };
  d.settings = { ...defaultData.settings, ...(raw.settings || {}) };
  if (!Array.isArray(d.clients)) d.clients = [];
  if (!Array.isArray(d.invoices)) d.invoices = [];
  if (!Array.isArray(d.shiftTemplates)) d.shiftTemplates = [];

  // Migration: if sites have a `client` string but no clientId, create matching clients
  const byName = new Map();
  for (const c of d.clients) byName.set((c.name || '').toLowerCase(), c);

  d.sites = (d.sites || []).map(site => {
    if (site.clientId) return site;
    const clientName = (site.client || '').trim();
    if (!clientName) return site;
    let existing = byName.get(clientName.toLowerCase());
    if (!existing) {
      existing = {
        id: uid(),
        name: clientName,
        contact: site.contact || '',
        paymentTermsDays: site.paymentTermsDays || 30,
        notes: ''
      };
      d.clients.push(existing);
      byName.set(clientName.toLowerCase(), existing);
    }
    return { ...site, clientId: existing.id };
  });

  // Ensure shifts have invoiceId, payslipId, templateId fields (null by default)
  d.shifts = (d.shifts || []).map(s => ({ invoiceId: null, payslipId: null, templateId: null, ...s }));

  // Ensure invoices have a type ('client' or 'worker'). Older data assumed client.
  d.invoices = (d.invoices || []).map(inv => ({ type: 'client', ...inv }));

  return d;
}

async function loadLocal() {
  try {
    const r = await localAdapter.get(STORAGE_KEY);
    if (r && r.value) return migrate(JSON.parse(r.value));
  } catch {}
  return defaultData;
}

async function saveLocal(data) {
  try { await localAdapter.set(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

// ---------- Main App ----------
export default function App() {
  const [data, setData] = useState(defaultData);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState('overview');
  const [modal, setModal] = useState(null);

  // Supabase auth state
  const [session, setSession] = useState(undefined); // undefined = checking, null = not logged in
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const saveTimer = useRef(null);

  // ── Auth listener (only when Supabase is configured) ──
  useEffect(() => {
    if (!supabase) {
      setSession(null); // no supabase → skip auth
      loadLocal().then(d => { setData(d); setLoaded(true); });
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadFromCloud(session.user.id);
      else setLoaded(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadFromCloud(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load user data from Supabase ──
  const loadFromCloud = async (userId) => {
    try {
      const { data: row, error } = await supabase
        .from('user_data')
        .select('data')
        .eq('id', userId)
        .maybeSingle();
      if (row?.data) setData(migrate(row.data));
      else setData(defaultData);
    } catch {}
    setLoaded(true);
  };

  // ── Save on data changes ──
  useEffect(() => {
    if (!loaded) return;
    if (supabase && session) {
      // Cloud save with debounce
      setSyncStatus('saving');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          const { error } = await supabase.from('user_data').upsert({
            id: session.user.id,
            data,
            updated_at: new Date().toISOString()
          });
          setSyncStatus(error ? 'error' : 'saved');
          if (!error) setTimeout(() => setSyncStatus('idle'), 2000);
        } catch { setSyncStatus('error'); }
      }, 1200);
    } else {
      saveLocal(data);
    }
  }, [data, loaded]);

  // ── Sign out ──
  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setData(defaultData);
    setLoaded(false);
    setSession(null);
  };

  // ── Auth gate — show login if Supabase configured but not signed in ──
  if (supabase && session === null && loaded) {
    return <AuthScreen />;
  }
  if (supabase && session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8FAFC', fontFamily: 'Geist, system-ui, sans-serif' }}>
        <div style={{ fontSize: 13, color: '#94A3B8', letterSpacing: '-0.01em' }}>Connecting…</div>
      </div>
    );
  }

  const cur = data.settings.currency || '£';
  const fmtMoney = (n) => `${cur}${(Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Mutations
  const upsertClient = (client) => {
    setData(d => {
      const exists = d.clients.find(c => c.id === client.id);
      const clients = exists
        ? d.clients.map(c => c.id === client.id ? client : c)
        : [...d.clients, { ...client, id: client.id || uid() }];
      return { ...d, clients };
    });
  };
  const deleteClient = (id) => {
    setData(d => ({
      ...d,
      clients: d.clients.filter(c => c.id !== id),
      // Unlink sites
      sites: d.sites.map(s => s.clientId === id ? { ...s, clientId: null } : s)
    }));
  };
  const upsertWorker = (worker) => {
    setData(d => {
      const exists = d.workers.find(w => w.id === worker.id);
      const workers = exists
        ? d.workers.map(w => w.id === worker.id ? worker : w)
        : [...d.workers, { ...worker, id: worker.id || uid() }];
      return { ...d, workers };
    });
  };
  const deleteWorker = (id) => {
    setData(d => ({ ...d, workers: d.workers.filter(w => w.id !== id) }));
  };
  const upsertSite = (site) => {
    setData(d => {
      const exists = d.sites.find(s => s.id === site.id);
      const sites = exists
        ? d.sites.map(s => s.id === site.id ? site : s)
        : [...d.sites, { ...site, id: site.id || uid() }];
      return { ...d, sites };
    });
  };
  const deleteSite = (id) => {
    setData(d => ({ ...d, sites: d.sites.filter(s => s.id !== id) }));
  };
  const upsertShift = (shift) => {
    setData(d => {
      const exists = d.shifts.find(s => s.id === shift.id);
      const shifts = exists
        ? d.shifts.map(s => s.id === shift.id ? shift : s)
        : [...d.shifts, { invoiceId: null, ...shift, id: shift.id || uid() }];
      return { ...d, shifts };
    });
  };
  const deleteShift = (id) => {
    setData(d => ({ ...d, shifts: d.shifts.filter(s => s.id !== id) }));
  };
  const toggleShiftFlag = (id, flag) => {
    setData(d => ({
      ...d,
      shifts: d.shifts.map(s => {
        if (s.id !== id) return s;
        const next = { ...s, [flag]: !s[flag] };
        if (flag === 'workerPaid') next.workerPaidDate = next.workerPaid ? (s.workerPaidDate || todayISO()) : null;
        if (flag === 'clientPaid') next.clientPaidDate = next.clientPaid ? (s.clientPaidDate || todayISO()) : null;
        return next;
      })
    }));
  };

  // Invoice helpers (handles both client invoices and worker payslips)
  const createInvoice = ({ type = 'client', clientId, workerId, dateFrom, dateTo, shiftIds, notes }) => {
    const id = uid();
    setData(d => {
      const counter = d.settings.invoiceCounter || 1;
      const prefix = type === 'worker' ? 'PAY' : 'INV';
      const number = `${prefix}-${String(counter).padStart(4, '0')}`;
      const invoice = {
        id, type, clientId: clientId || null, workerId: workerId || null,
        dateFrom, dateTo, shiftIds, notes: notes || '',
        invoiceNumber: number,
        issueDate: todayISO(),
        status: 'draft',
        sentDate: null,
        paidDate: null
      };
      const linkField = type === 'worker' ? 'payslipId' : 'invoiceId';
      return {
        ...d,
        invoices: [...d.invoices, invoice],
        shifts: d.shifts.map(s => shiftIds.includes(s.id) ? { ...s, [linkField]: id } : s),
        settings: { ...d.settings, invoiceCounter: counter + 1 }
      };
    });
    return id;
  };
  const updateInvoice = (id, patch) => {
    setData(d => ({
      ...d,
      invoices: d.invoices.map(inv => inv.id === id ? { ...inv, ...patch } : inv)
    }));
  };
  const markInvoicePaid = (id, paidDate) => {
    setData(d => {
      const inv = d.invoices.find(i => i.id === id);
      if (!inv) return d;
      const date = paidDate || todayISO();
      const shiftFlag = inv.type === 'worker' ? 'workerPaid' : 'clientPaid';
      const dateField = inv.type === 'worker' ? 'workerPaidDate' : 'clientPaidDate';
      return {
        ...d,
        invoices: d.invoices.map(i => i.id === id ? { ...i, status: 'paid', paidDate: date } : i),
        shifts: d.shifts.map(s => inv.shiftIds.includes(s.id) ? { ...s, [shiftFlag]: true, [dateField]: date } : s)
      };
    });
  };
  const markInvoiceUnpaid = (id) => {
    setData(d => {
      const inv = d.invoices.find(i => i.id === id);
      if (!inv) return d;
      const shiftFlag = inv.type === 'worker' ? 'workerPaid' : 'clientPaid';
      const dateField = inv.type === 'worker' ? 'workerPaidDate' : 'clientPaidDate';
      return {
        ...d,
        invoices: d.invoices.map(i => i.id === id ? { ...i, status: 'sent', paidDate: null } : i),
        shifts: d.shifts.map(s => inv.shiftIds.includes(s.id) ? { ...s, [shiftFlag]: false, [dateField]: null } : s)
      };
    });
  };
  const deleteInvoice = (id) => {
    setData(d => {
      const inv = d.invoices.find(i => i.id === id);
      const linkField = inv?.type === 'worker' ? 'payslipId' : 'invoiceId';
      return {
        ...d,
        invoices: d.invoices.filter(i => i.id !== id),
        shifts: d.shifts.map(s => s[linkField] === id ? { ...s, [linkField]: null } : s)
      };
    });
  };
  // Shift template helpers
  const upsertShiftTemplate = (tmpl) => {
    setData(d => {
      const exists = d.shiftTemplates.find(t => t.id === tmpl.id);
      if (exists) {
        return { ...d, shiftTemplates: d.shiftTemplates.map(t => t.id === tmpl.id ? tmpl : t) };
      }
      // Assign next color in palette
      const colorIndex = d.shiftTemplates.length % TEMPLATE_PALETTE.length;
      const next = { ...tmpl, id: tmpl.id || uid(), colorIndex: tmpl.colorIndex ?? colorIndex };
      return { ...d, shiftTemplates: [...d.shiftTemplates, next] };
    });
  };
  const deleteShiftTemplate = (id) => {
    setData(d => ({
      ...d,
      shiftTemplates: d.shiftTemplates.filter(t => t.id !== id),
      // Unlink any shifts using this template (they keep their data, lose the template link)
      shifts: d.shifts.map(s => s.templateId === id ? { ...s, templateId: null } : s)
    }));
  };
  // Create a shift from a template on a specific date
  const createShiftFromTemplate = (template, date) => {
    const hours = timeDiffHours(template.startTime, template.endTime);
    setData(d => {
      const site = d.sites.find(s => s.id === template.siteId);
      return {
        ...d,
        shifts: [...d.shifts, {
          id: uid(),
          date,
          workerId: null,
          siteId: template.siteId,
          templateId: template.id,
          hours,
          workerRate: 0,
          clientRate: site?.rate || 0,
          workerPaid: false,
          clientPaid: false,
          workerPaidDate: null,
          clientPaidDate: null,
          invoiceId: null,
          payslipId: null,
          notes: ''
        }]
      };
    });
  };
  // Remove the most recently added shift on a given date that uses this template
  const removeLastShiftFromTemplate = (templateId, date) => {
    setData(d => {
      // Find shifts matching template + date, prefer the last-added (highest id)
      const matches = d.shifts.filter(s => s.templateId === templateId && s.date === date);
      if (matches.length === 0) return d;
      // Remove the last one in array order
      const target = matches[matches.length - 1];
      return { ...d, shifts: d.shifts.filter(s => s.id !== target.id) };
    });
  };

  const updateSettings = (patch) => {
    setData(d => ({ ...d, settings: { ...d.settings, ...patch } }));
  };

  // Computed totals
  const totals = useMemo(() => {
    let owedByClients = 0;
    let owedToWorkers = 0;
    let paidOutToWorkers = 0;
    let receivedFromClients = 0;
    let overdueAmount = 0;
    let overdueCount = 0;
    const today = todayISO();

    for (const s of data.shifts) {
      const site = data.sites.find(x => x.id === s.siteId);
      const workerCharge = (Number(s.hours) || 0) * (Number(s.workerRate) || 0);
      const clientCharge = (Number(s.hours) || 0) * (Number(s.clientRate) || 0);

      if (!s.clientPaid) {
        owedByClients += clientCharge;
        const dueDays = site ? Number(site.paymentTermsDays || 0) : 0;
        const dueDate = addDays(s.date, dueDays);
        if (dueDate < today) {
          overdueAmount += clientCharge;
          overdueCount += 1;
        }
      } else {
        receivedFromClients += clientCharge;
      }

      if (!s.workerPaid) {
        owedToWorkers += workerCharge;
      } else {
        paidOutToWorkers += workerCharge;
      }
    }

    const float = paidOutToWorkers - receivedFromClients; // your out-of-pocket exposure right now
    return { owedByClients, owedToWorkers, paidOutToWorkers, receivedFromClients, float, overdueAmount, overdueCount };
  }, [data]);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8FAFC', fontFamily: 'Geist, system-ui, sans-serif' }}>
        <div style={{ fontSize: 13, color: '#94A3B8', letterSpacing: '-0.01em' }}>Loading…</div>
      </div>
    );
  }

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'shifts', label: 'Shifts', icon: ListChecks },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'setup', label: 'Setup', icon: Settings },
  ];

  const ctx = {
    data, setData, modal, setModal, view, setView,
    fmtMoney, cur, totals,
    upsertClient, deleteClient,
    upsertWorker, deleteWorker,
    upsertSite, deleteSite,
    upsertShift, deleteShift, toggleShiftFlag,
    upsertShiftTemplate, deleteShiftTemplate,
    createShiftFromTemplate, removeLastShiftFromTemplate,
    createInvoice, updateInvoice, markInvoicePaid, markInvoiceUnpaid, deleteInvoice,
    updateSettings,
  };

  return (
    <div className="app-shell font-sans" style={{ backgroundColor: '#F8FAFC', color: '#0F172A' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap');
        body, .font-sans { font-family: 'Geist', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
        html, body, #root { height: 100%; }
        .font-display { font-family: 'Geist', sans-serif; font-weight: 600; letter-spacing: -0.025em; }
        .font-mono { font-family: 'Geist Mono', ui-monospace, monospace; }
        .tabular { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum'; }
        .card-border { border: 1px solid #E2E8F0; }
        .ink { color: #0F172A; }
        .ink-muted { color: #64748B; }
        .ink-soft { color: #94A3B8; }
        .surface { background-color: #FFFFFF; }
        .surface-2 { background-color: #F1F5F9; }
        .accent { color: #0F172A; }
        .accent-bg { background-color: #0F172A; }
        .accent-bg-soft { background-color: #F1F5F9; }
        .warning { color: #B45309; }
        .warning-bg-soft { background-color: #FEF3C7; }
        .danger { color: #DC2626; }
        .danger-bg-soft { background-color: #FEE2E2; }
        .success { color: #16A34A; }
        .success-bg-soft { background-color: #DCFCE7; }
        button { transition: all 0.15s ease; }
        input, select, textarea { font-family: inherit; }
        input:focus, select:focus, textarea:focus { border-color: #0F172A !important; box-shadow: 0 0 0 3px rgba(15,23,42,0.07); }
        .hover-row:hover { background-color: #F8FAFC; }
        .pulse-dot { animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .print-only { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          .print-only, .print-only * { visibility: visible !important; }
          .print-only { display: block !important; position: absolute !important; top: 0; left: 0; right: 0; width: 100% !important; padding: 40px !important; background: white !important; color: black !important; font-family: 'Geist', system-ui, sans-serif !important; }
          .print-only table { width: 100%; border-collapse: collapse; }
          .print-only th { text-align: left; padding: 10px 6px; border-bottom: 2px solid #111; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
          .print-only td { padding: 10px 6px; border-bottom: 1px solid #e5e5e5; font-size: 14px; }
          .no-print { display: none !important; }
        }
        .calendar-day { aspect-ratio: 1 / 1; }

        /* ── App shell ── */
        .app-shell { display: flex; min-height: 100vh; }

        /* Sidebar */
        .app-sidebar {
          width: 240px;
          min-width: 240px;
          background: #0F172A;
          display: flex;
          flex-direction: column;
          position: fixed;
          top: 0; left: 0; bottom: 0;
          z-index: 40;
          overflow: hidden;
        }
        .app-sidebar-inner {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow-y: auto;
          scrollbar-width: none;
        }
        .app-sidebar-inner::-webkit-scrollbar { display: none; }

        /* Main area */
        .app-body {
          flex: 1;
          margin-left: 240px;
          min-width: 0;
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background: #F8FAFC;
        }

        /* Top bar */
        .app-topbar {
          background: rgba(248,250,252,0.96);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border-bottom: 1px solid #E2E8F0;
          position: sticky;
          top: 0;
          z-index: 30;
          padding: 0 40px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        /* Page content */
        .app-main {
          flex: 1;
          padding: 40px 40px 64px;
          max-width: 1280px;
          width: 100%;
        }

        /* Sidebar nav items */
        .nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          border-radius: 7px;
          font-size: 13.5px;
          font-weight: 500;
          color: #64748B;
          transition: background 0.12s ease, color 0.12s ease;
          cursor: pointer;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
          letter-spacing: -0.01em;
          white-space: nowrap;
        }
        .nav-item:hover { background: rgba(255,255,255,0.06); color: #CBD5E1; }
        .nav-item.nav-active { background: rgba(255,255,255,0.10); color: #FFFFFF; }

        /* Sidebar "owed" area */
        .sidebar-owed {
          cursor: pointer;
          padding: 14px 16px;
          border-radius: 8px;
          transition: background 0.12s ease;
          margin: 0 4px;
        }
        .sidebar-owed:hover { background: rgba(255,255,255,0.05); }

        /* Mobile */
        @media (max-width: 768px) {
          .app-sidebar { display: none; }
          .app-body { margin-left: 0; }
          .app-main { padding: 20px 16px 88px; }
          .app-topbar { padding: 0 16px; height: 54px; }
          .mobile-nav { display: flex !important; }
        }

        /* Mobile bottom nav */
        .mobile-nav {
          display: none;
          position: fixed;
          bottom: 0; left: 0; right: 0;
          background: rgba(15,23,42,0.97);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          padding: 6px 0 calc(env(safe-area-inset-bottom, 0px) + 6px);
          z-index: 50;
          border-top: 1px solid rgba(255,255,255,0.07);
        }
        .mobile-nav-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          padding: 6px 4px;
          background: none;
          border: none;
          cursor: pointer;
          color: #475569;
          font-size: 10px;
          font-weight: 500;
          font-family: 'Geist', sans-serif;
          transition: color 0.12s ease;
        }
        .mobile-nav-item.nav-active { color: #FFFFFF; }
      `}</style>

      {/* ── Sidebar ── */}
      <aside className="app-sidebar no-print">
        <div className="app-sidebar-inner">

          {/* Brand */}
          <div style={{ padding: '24px 20px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34,
                background: 'linear-gradient(145deg, #3B82F6, #1E40AF)',
                borderRadius: 9,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 10px rgba(59,130,246,0.35)',
                flexShrink: 0
              }}>
                <div style={{ width: 13, height: 13, borderRadius: 4, background: 'white', opacity: 0.92 }} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 600, color: '#F8FAFC', letterSpacing: '-0.03em', lineHeight: 1 }}>Ledger</div>
                <div style={{ fontSize: 9.5, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 3 }}>Security Shifts</div>
              </div>
            </div>
          </div>

          {/* Nav items */}
          <nav style={{ flex: 1, padding: '0 10px 12px' }}>
            <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#334155', padding: '4px 12px 8px', fontWeight: 600 }}>Navigation</div>
            {navItems.map(item => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`nav-item${active ? ' nav-active' : ''}`}
                >
                  <Icon size={15} strokeWidth={active ? 2.25 : 1.75} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Financial summary */}
          <div style={{ padding: '0 6px 8px' }}>
            <div className="sidebar-owed" onClick={() => setModal({ type: 'breakdown', mode: 'client-owed' })}>
              <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#475569', marginBottom: 6, fontWeight: 600 }}>Owed to you</div>
              <div style={{ fontSize: 26, fontWeight: 600, color: '#F8FAFC', letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {fmtMoney(totals.owedByClients)}
              </div>
              {totals.overdueAmount > 0 && (
                <div style={{ fontSize: 11, color: '#F87171', marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#F87171', display: 'inline-block', flexShrink: 0 }} />
                  {fmtMoney(totals.overdueAmount)} overdue
                </div>
              )}
            </div>
          </div>

          {/* Sync + auth */}
          <div style={{ padding: '12px 20px 20px', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 4 }}>
            {supabase && session ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: syncStatus === 'saving' ? '#F59E0B' : syncStatus === 'saved' ? '#10B981' : syncStatus === 'error' ? '#EF4444' : '#334155'
                }} />
                <span style={{ fontSize: 11, color: '#475569' }}>
                  {syncStatus === 'saving' ? 'Saving…' : syncStatus === 'error' ? 'Error' : 'Synced'}
                </span>
                <button onClick={handleSignOut} style={{ fontSize: 11, color: '#475569', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', padding: 0 }}>
                  Sign out
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#334155', textAlign: 'center', letterSpacing: '0.02em' }}>Local storage</div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Right panel ── */}
      <div className="app-body">

        {/* Top bar */}
        <header className="app-topbar no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#94A3B8', letterSpacing: '-0.01em' }}>
              {navItems.find(n => n.id === view)?.label}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {(view === 'shifts' || view === 'overview' || view === 'calendar') && (
              <>
                {view === 'shifts' && (
                  <button
                    onClick={() => setModal({ type: 'shift-bulk' })}
                    style={{ fontSize: 13, padding: '7px 14px', borderRadius: 7, display: 'inline-flex', alignItems: 'center', gap: 6, color: '#64748B', background: 'white', border: '1px solid #E2E8F0', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    <CalendarDays size={14} /> Log multiple
                  </button>
                )}
                <button
                  onClick={() => setModal({ type: 'shift' })}
                  style={{ fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 7, color: 'white', background: '#0F172A', display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer', letterSpacing: '-0.01em', fontFamily: 'inherit' }}
                >
                  <Plus size={14} strokeWidth={2.5} /> Log shift
                </button>
              </>
            )}
            {view === 'invoices' && (
              <button
                onClick={() => setModal({ type: 'invoice-new', invoiceType: 'client' })}
                style={{ fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 7, color: 'white', background: '#0F172A', display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer', letterSpacing: '-0.01em', fontFamily: 'inherit' }}
              >
                <Plus size={14} strokeWidth={2.5} /> New invoice
              </button>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="app-main">
          {view === 'overview' && <Overview ctx={ctx} />}
          {view === 'calendar' && <CalendarView ctx={ctx} />}
          {view === 'shifts' && <Shifts ctx={ctx} />}
          {view === 'invoices' && <Invoices ctx={ctx} />}
          {view === 'setup' && <Setup ctx={ctx} />}
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav className="mobile-nav no-print">
        {navItems.map(item => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`mobile-nav-item${active ? ' nav-active' : ''}`}
            >
              <Icon size={20} strokeWidth={active ? 2.25 : 1.5} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Modals */}
      {modal?.type === 'shift' && <ShiftModal ctx={ctx} onClose={() => setModal(null)} editId={modal.id} prefillDate={modal.prefillDate} />}
      {modal?.type === 'shift-bulk' && <BulkShiftModal ctx={ctx} onClose={() => setModal(null)} />}
      {modal?.type === 'worker' && <WorkerModal ctx={ctx} onClose={() => setModal(null)} editId={modal.id} />}
      {modal?.type === 'site' && <SiteModal ctx={ctx} onClose={() => setModal(null)} editId={modal.id} />}
      {modal?.type === 'client' && <ClientModal ctx={ctx} onClose={() => setModal(null)} editId={modal.id} />}
      {modal?.type === 'shift-template' && <ShiftTemplateModal ctx={ctx} onClose={() => setModal(null)} editId={modal.id} />}
      {modal?.type === 'invoice-new' && <InvoiceBuilderModal ctx={ctx} onClose={() => setModal(null)} prefillClientId={modal.clientId} invoiceType={modal.invoiceType || 'client'} prefillWorkerId={modal.workerId} />}
      {modal?.type === 'invoice-view' && <InvoiceDetailModal ctx={ctx} onClose={() => setModal(null)} invoiceId={modal.id} />}
      {modal?.type === 'breakdown' && <BreakdownModal ctx={ctx} onClose={() => setModal(null)} mode={modal.mode} />}
      {modal?.type === 'settings' && <SettingsModal ctx={ctx} onClose={() => setModal(null)} />}
    </div>
  );
}

// ---------- Overview ----------
function Overview({ ctx }) {
  const { data, fmtMoney, totals, setView, setModal } = ctx;

  const recentShifts = [...data.shifts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const overdue = data.shifts
    .filter(s => {
      if (s.clientPaid) return false;
      const site = data.sites.find(x => x.id === s.siteId);
      const due = addDays(s.date, site?.paymentTermsDays || 0);
      return due < todayISO();
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const isEmpty = data.shifts.length === 0;

  if (isEmpty && data.workers.length === 0 && data.sites.length === 0) {
    return <EmptyState ctx={ctx} />;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl sm:text-[34px] leading-none">Overview</h1>
        <p className="ink-muted text-sm mt-2">Where your money sits today.</p>
      </div>

      {/* This Month */}
      <ThisMonthCard ctx={ctx} />

      {/* Key numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Owed by clients"
          value={fmtMoney(totals.owedByClients)}
          sublabel="Tap to see details"
          icon={ArrowDownLeft}
          tone="ink"
          onClick={() => setModal({ type: 'breakdown', mode: 'client-owed' })}
        />
        <StatCard
          label="Owed to workers"
          value={fmtMoney(totals.owedToWorkers)}
          sublabel="Tap to see details"
          icon={ArrowUpRight}
          tone="warning"
          onClick={() => setModal({ type: 'breakdown', mode: 'worker-owed' })}
        />
        <StatCard
          label="Your float"
          value={fmtMoney(totals.float)}
          sublabel={totals.float > 0 ? "Money you're fronting" : "You're ahead"}
          icon={Wallet}
          tone={totals.float > 0 ? 'danger' : 'success'}
          onClick={() => setModal({ type: 'breakdown', mode: 'float' })}
        />
        <StatCard
          label="Overdue"
          value={fmtMoney(totals.overdueAmount)}
          sublabel={`${totals.overdueCount} shift${totals.overdueCount === 1 ? '' : 's'} past due`}
          icon={AlertTriangle}
          tone={totals.overdueAmount > 0 ? 'danger' : 'muted'}
          onClick={() => totals.overdueCount > 0 ? setModal({ type: 'breakdown', mode: 'overdue' }) : null}
        />
      </div>

      {totals.float > 0 && (
        <div className="card-border surface rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertCircle size={18} className="warning mt-0.5 shrink-0" />
          <div className="text-sm">
            <span className="font-medium">You're fronting {fmtMoney(totals.float)} of your own money.</span>
            <span className="ink-muted"> That's how much more you've paid workers than you've collected from clients. Tap "Overdue" above to see who needs chasing.</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Overdue */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-display text-base tracking-tight">Past due</h2>
            {overdue.length > 0 && (
              <button onClick={() => setModal({ type: 'breakdown', mode: 'overdue' })} className="text-xs ink-muted hover:ink">View all →</button>
            )}
          </div>
          {overdue.length === 0 ? (
            <div className="card-border surface rounded-lg p-6 text-center text-sm ink-muted">
              Nothing overdue. Nice.
            </div>
          ) : (
            <div className="space-y-2">
              {overdue.slice(0, 5).map(s => <OverdueRow key={s.id} shift={s} ctx={ctx} />)}
            </div>
          )}
        </section>

        {/* Recent shifts */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-display text-base tracking-tight">Recent shifts</h2>
            <button onClick={() => setView('shifts')} className="text-xs ink-muted hover:ink">View all →</button>
          </div>
          {recentShifts.length === 0 ? (
            <div className="card-border surface rounded-lg p-6 text-center text-sm ink-muted">
              No shifts yet. <button onClick={() => setModal({ type: 'shift' })} className="accent underline">Log one</button>.
            </div>
          ) : (
            <div className="space-y-2">
              {recentShifts.map(s => <ShiftMiniRow key={s.id} shift={s} ctx={ctx} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ThisMonthCard({ ctx }) {
  const { data, fmtMoney, setView } = ctx;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthName = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const stats = useMemo(() => {
    let earned = 0, paidOut = 0, hours = 0, count = 0, unpaidByClient = 0, unpaidToWorker = 0;
    for (const s of data.shifts) {
      const d = new Date(s.date + 'T00:00:00');
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const h = Number(s.hours) || 0;
      const charge = h * (Number(s.clientRate) || 0);
      const pay = h * (Number(s.workerRate) || 0);
      earned += charge;
      paidOut += pay;
      hours += h;
      count += 1;
      if (!s.clientPaid) unpaidByClient += charge;
      if (!s.workerPaid) unpaidToWorker += pay;
    }
    return { earned, paidOut, hours, count, margin: earned - paidOut, unpaidByClient, unpaidToWorker };
  }, [data, year, month]);

  if (stats.count === 0) {
    return (
      <div className="card-border surface rounded-xl p-5 mb-6">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[10px] uppercase tracking-[0.15em] ink-muted">This month</span>
          <span className="text-xs ink-muted">{monthName}</span>
        </div>
        <div className="text-sm ink-muted mt-3">No shifts logged this month yet.</div>
      </div>
    );
  }

  return (
    <div className="card-border surface rounded-xl p-5 mb-6">
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <span className="text-[10px] uppercase tracking-[0.15em] ink-muted">This month</span>
          <span className="font-medium text-sm">{monthName}</span>
        </div>
        <button
          onClick={() => setView('calendar')}
          className="text-xs ink-muted hover:ink"
        >
          Calendar →
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider ink-muted">Earned</div>
          <div className="font-display text-2xl tabular mt-1">{fmtMoney(stats.earned)}</div>
          <div className="text-[11px] ink-soft mt-0.5">{stats.count} shift{stats.count === 1 ? '' : 's'}, {stats.hours}h</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider ink-muted">Paid out</div>
          <div className="font-display text-2xl tabular mt-1">{fmtMoney(stats.paidOut)}</div>
          <div className="text-[11px] ink-soft mt-0.5">to workers</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider ink-muted">Net margin</div>
          <div className="font-display text-2xl tabular mt-1">{fmtMoney(stats.margin)}</div>
          <div className="text-[11px] ink-soft mt-0.5">earned − paid out</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider ink-muted">Open</div>
          <div className="font-display text-2xl tabular mt-1 warning">{fmtMoney(stats.unpaidByClient)}</div>
          <div className="text-[11px] mt-0.5">
            {stats.unassigned > 0
              ? <span className="danger">{stats.unassigned} unassigned</span>
              : <span className="ink-soft">awaiting client payment</span>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sublabel, icon: Icon, tone, onClick }) {
  const toneCls = {
    accent: 'accent',
    warning: 'warning',
    danger: 'danger',
    success: 'success',
    ink: 'ink',
    muted: 'ink-muted'
  }[tone] || 'ink';
  const clickable = !!onClick;
  return (
    <button
      onClick={onClick}
      disabled={!clickable}
      className={`card-border surface rounded-lg p-4 text-left w-full ${clickable ? 'hover:border-stone-400 cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-[10px] uppercase tracking-[0.12em] ink-muted">{label}</span>
        <Icon size={14} className={toneCls} strokeWidth={1.75} />
      </div>
      <div className={`font-display text-2xl sm:text-[26px] leading-tight tabular ${toneCls}`}>{value}</div>
      <div className="text-[11px] ink-muted mt-1">{sublabel}</div>
    </button>
  );
}

function OverdueRow({ shift, ctx }) {
  const { data, fmtMoney, toggleShiftFlag } = ctx;
  const worker = data.workers.find(w => w.id === shift.workerId);
  const site = data.sites.find(s => s.id === shift.siteId);
  const due = addDays(shift.date, site?.paymentTermsDays || 0);
  const daysOver = -daysFromToday(due);
  const charge = (Number(shift.hours) || 0) * (Number(shift.clientRate) || 0);

  return (
    <div className="card-border surface rounded-lg p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{site?.name || 'Site'}</span>
          <span className="text-xs ink-muted">{fmtDateShort(shift.date)}</span>
        </div>
        <div className="text-xs ink-muted truncate">
          {worker?.name || 'Worker'} · {shift.hours}h · <span className="danger">{daysOver}d overdue</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="tabular font-medium text-sm">{fmtMoney(charge)}</div>
        <button
          onClick={() => toggleShiftFlag(shift.id, 'clientPaid')}
          className="text-[11px] accent hover:underline mt-1"
        >
          Mark paid
        </button>
      </div>
    </div>
  );
}

function ShiftMiniRow({ shift, ctx }) {
  const { data, fmtMoney, setModal } = ctx;
  const worker = data.workers.find(w => w.id === shift.workerId);
  const site = data.sites.find(s => s.id === shift.siteId);
  const charge = (Number(shift.hours) || 0) * (Number(shift.clientRate) || 0);
  const fullyPaid = shift.workerPaid && shift.clientPaid;

  return (
    <button
      onClick={() => setModal({ type: 'shift', id: shift.id })}
      className="card-border surface rounded-lg p-3 flex items-center justify-between gap-3 w-full text-left hover:bg-stone-50"
    >
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{site?.name || 'Site'}</span>
          <span className="text-xs ink-muted">{fmtDateShort(shift.date)}</span>
        </div>
        <div className="text-xs ink-muted truncate">{worker?.name || 'Worker'} · {shift.hours}h</div>
      </div>
      <div className="text-right shrink-0 flex items-center gap-2">
        <div className="tabular font-medium text-sm">{fmtMoney(charge)}</div>
        {fullyPaid ? (
          <CheckCircle2 size={14} className="success" />
        ) : (
          <ChevronRight size={14} className="ink-soft" />
        )}
      </div>
    </button>
  );
}

// ---------- Empty State ----------
function EmptyState({ ctx }) {
  const { setModal } = ctx;
  return (
    <div className="text-center max-w-xl mx-auto py-12">
      <h1 className="font-display text-3xl sm:text-[34px] mb-3 leading-tight">Set up in three steps.</h1>
      <p className="ink-muted text-sm mb-10">Add who works for you, where they work, then log shifts as they happen.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <button
          onClick={() => setModal({ type: 'worker' })}
          className="card-border surface rounded-lg p-5 hover:bg-stone-50 text-left"
        >
          <div className="flex items-center justify-between mb-3">
            <Users size={18} className="accent" strokeWidth={1.75} />
            <span className="text-xs ink-soft tabular">01</span>
          </div>
          <div className="font-medium text-sm mb-1">Add a worker</div>
          <div className="text-xs ink-muted">Yourself or someone you send out, with their pay rate.</div>
        </button>
        <button
          onClick={() => setModal({ type: 'site' })}
          className="card-border surface rounded-lg p-5 hover:bg-stone-50 text-left"
        >
          <div className="flex items-center justify-between mb-3">
            <MapPin size={18} className="accent" strokeWidth={1.75} />
            <span className="text-xs ink-soft tabular">02</span>
          </div>
          <div className="font-medium text-sm mb-1">Add a site</div>
          <div className="text-xs ink-muted">The client's location, their rate, and when they pay.</div>
        </button>
        <button
          onClick={() => setModal({ type: 'shift' })}
          className="card-border surface rounded-lg p-5 hover:bg-stone-50 text-left"
        >
          <div className="flex items-center justify-between mb-3">
            <Clock size={18} className="accent" strokeWidth={1.75} />
            <span className="text-xs ink-soft tabular">03</span>
          </div>
          <div className="font-medium text-sm mb-1">Log a shift</div>
          <div className="text-xs ink-muted">Who, where, how many hours. The maths happens for you.</div>
        </button>
      </div>

      <div className="text-xs ink-soft">Your data lives in this browser. Nothing leaves your device.</div>
    </div>
  );
}

// ---------- Shifts View ----------
function Shifts({ ctx }) {
  const { data, fmtMoney, setModal, toggleShiftFlag } = ctx;
  const [filter, setFilter] = useState('all'); // all | unpaid-client | unpaid-worker | overdue | settled
  const [search, setSearch] = useState('');
  const [workerFilter, setWorkerFilter] = useState('all');
  const [siteFilter, setSiteFilter] = useState('all');

  const filtered = useMemo(() => {
    const today = todayISO();
    return data.shifts
      .filter(s => {
        if (workerFilter !== 'all' && s.workerId !== workerFilter) return false;
        if (siteFilter !== 'all' && s.siteId !== siteFilter) return false;
        if (filter === 'unpaid-client' && s.clientPaid) return false;
        if (filter === 'unpaid-worker' && s.workerPaid) return false;
        if (filter === 'unassigned' && s.workerId) return false;
        if (filter === 'settled' && !(s.clientPaid && s.workerPaid)) return false;
        if (filter === 'overdue') {
          if (s.clientPaid) return false;
          const site = data.sites.find(x => x.id === s.siteId);
          const due = addDays(s.date, site?.paymentTermsDays || 0);
          if (due >= today) return false;
        }
        if (search) {
          const worker = data.workers.find(w => w.id === s.workerId);
          const site = data.sites.find(x => x.id === s.siteId);
          const blob = `${worker?.name || ''} ${site?.name || ''} ${site?.client || ''} ${s.notes || ''}`.toLowerCase();
          if (!blob.includes(search.toLowerCase())) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data, filter, search, workerFilter, siteFilter]);

  const filterTotals = useMemo(() => {
    let clientCharge = 0, workerPay = 0;
    for (const s of filtered) {
      clientCharge += (Number(s.hours) || 0) * (Number(s.clientRate) || 0);
      workerPay += (Number(s.hours) || 0) * (Number(s.workerRate) || 0);
    }
    return { clientCharge, workerPay, margin: clientCharge - workerPay };
  }, [filtered]);

  if (data.shifts.length === 0) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="font-display text-3xl sm:text-[34px] leading-none">Shifts</h1>
          <p className="ink-muted text-sm mt-2">Every hour worked, every pound earned.</p>
        </div>
        <div className="card-border surface rounded-lg p-10 text-center">
          <Clock size={28} className="mx-auto ink-soft mb-3" strokeWidth={1.5} />
          <p className="text-sm ink-muted mb-4">No shifts logged yet.</p>
          <button
            onClick={() => setModal({ type: 'shift' })}
            className="accent-bg text-white text-sm px-4 py-2 rounded-md inline-flex items-center gap-2"
          >
            <Plus size={14} /> Log your first shift
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="font-display text-3xl sm:text-[34px] leading-none">Shifts</h1>
          <p className="ink-muted text-sm mt-2">Every hour worked, every pound earned.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setModal({ type: 'shift-bulk' })}
            className="text-sm px-3 py-2 rounded-md card-border surface ink-muted hover:ink inline-flex items-center gap-1.5"
          >
            <CalendarDays size={14} /> Log multiple
          </button>
          <button
            onClick={() => setModal({ type: 'shift' })}
            className="text-sm px-3 py-2 rounded-md accent-bg text-white font-medium inline-flex items-center gap-1.5"
          >
            <Plus size={14} /> Log one
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3 mb-5">
        <div className="flex gap-1 flex-wrap">
          {[
            { id: 'all', label: 'All' },
            { id: 'unpaid-client', label: 'Client owes' },
            { id: 'unpaid-worker', label: 'Worker owed' },
            { id: 'overdue', label: 'Overdue' },
            { id: 'unassigned', label: 'Unassigned' },
            { id: 'settled', label: 'Settled' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`text-xs px-3 py-1.5 rounded-full border ${filter === f.id ? 'accent-bg text-white border-transparent' : 'card-border surface ink-muted hover:ink'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 ink-soft" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search worker, site, notes…"
              className="w-full pl-9 pr-3 py-2 text-sm card-border surface rounded-md outline-none "
            />
          </div>
          <select
            value={workerFilter}
            onChange={e => setWorkerFilter(e.target.value)}
            className="text-sm card-border surface rounded-md px-3 py-2 outline-none "
          >
            <option value="all">All workers</option>
            {data.workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select
            value={siteFilter}
            onChange={e => setSiteFilter(e.target.value)}
            className="text-sm card-border surface rounded-md px-3 py-2 outline-none "
          >
            <option value="all">All sites</option>
            {data.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {/* Totals strip */}
      {filtered.length > 0 && (
        <div className="surface-2 rounded-lg px-4 py-3 mb-3 flex items-center justify-between text-xs flex-wrap gap-3">
          <div className="ink-muted">
            Showing <span className="font-medium ink">{filtered.length}</span> shift{filtered.length === 1 ? '' : 's'}
          </div>
          <div className="flex gap-5 tabular">
            <div><span className="ink-muted">Client total:</span> <span className="font-medium">{fmtMoney(filterTotals.clientCharge)}</span></div>
            <div><span className="ink-muted">Worker pay:</span> <span className="font-medium">{fmtMoney(filterTotals.workerPay)}</span></div>
            <div><span className="ink-muted">Margin:</span> <span className="font-medium accent">{fmtMoney(filterTotals.margin)}</span></div>
          </div>
        </div>
      )}

      {/* Shift list */}
      {filtered.length === 0 ? (
        <div className="card-border surface rounded-lg p-8 text-center text-sm ink-muted">
          No shifts match these filters.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => <ShiftRow key={s.id} shift={s} ctx={ctx} />)}
        </div>
      )}
    </div>
  );
}

function ShiftRow({ shift, ctx }) {
  const { data, fmtMoney, setModal, toggleShiftFlag } = ctx;
  const [expanded, setExpanded] = useState(false);
  const worker = data.workers.find(w => w.id === shift.workerId);
  const site = data.sites.find(s => s.id === shift.siteId);
  const charge = (Number(shift.hours) || 0) * (Number(shift.clientRate) || 0);
  const pay = (Number(shift.hours) || 0) * (Number(shift.workerRate) || 0);
  const due = addDays(shift.date, site?.paymentTermsDays || 0);
  const daysToDue = daysFromToday(due);
  const isOverdue = !shift.clientPaid && due < todayISO();

  return (
    <div className="card-border surface rounded-lg overflow-hidden">
      <div
        className="p-3 sm:p-4 flex items-start sm:items-center gap-3 cursor-pointer hover:bg-stone-50"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="text-center shrink-0 w-12">
          <div className="font-display text-base leading-none tabular">{new Date(shift.date + 'T00:00:00').getDate()}</div>
          <div className="text-[9px] uppercase tracking-[0.1em] ink-muted mt-1 font-medium">
            {new Date(shift.date + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short' })}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{site?.name || <span className="ink-soft">No site</span>}</span>
            <span className="text-xs ink-muted">·</span>
            {shift.workerId
              ? <span className="text-xs ink-muted truncate">{worker?.name || 'Unknown'}</span>
              : <span className="text-[10px] danger-bg-soft danger px-1.5 py-0.5 rounded inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>Unassigned</span>
            }
          </div>
          <div className="text-xs ink-muted mt-0.5 flex items-center gap-2 flex-wrap">
            <span>{shift.hours}h</span>
            <span>·</span>
            <span className="tabular">{fmtMoney(charge)} in</span>
            <span>·</span>
            <span className="tabular">{fmtMoney(pay)} out</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex gap-1">
            <PaidPill paid={shift.clientPaid} overdue={isOverdue} label="Client" daysLeft={daysToDue} />
            <PaidPill paid={shift.workerPaid} label="Worker" />
          </div>
        </div>
      </div>

      {expanded && (
        <div className="surface-2 border-t card-border px-4 py-3 text-sm space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="ink-muted">Worker rate</div>
              <div className="tabular font-medium">{fmtMoney(shift.workerRate)}/h</div>
            </div>
            <div>
              <div className="ink-muted">Client rate</div>
              <div className="tabular font-medium">{fmtMoney(shift.clientRate)}/h</div>
            </div>
            <div>
              <div className="ink-muted">Margin</div>
              <div className="tabular font-medium accent">{fmtMoney(charge - pay)}</div>
            </div>
            <div>
              <div className="ink-muted">Due from client</div>
              <div className={`tabular font-medium ${isOverdue ? 'danger' : ''}`}>{fmtDateShort(due)}</div>
            </div>
          </div>
          {shift.notes && (
            <div className="text-xs">
              <div className="ink-muted mb-0.5">Notes</div>
              <div>{shift.notes}</div>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {shift.workerId ? (
              <button
                onClick={(e) => { e.stopPropagation(); toggleShiftFlag(shift.id, 'workerPaid'); }}
                className={`text-xs px-3 py-1.5 rounded-md ${shift.workerPaid ? 'warning-bg-soft warning' : 'success-bg-soft success'}`}
              >
                {shift.workerPaid ? 'Mark worker unpaid' : 'Mark worker paid'}
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setModal({ type: 'shift', id: shift.id }); }}
                className="text-xs px-3 py-1.5 rounded-md danger-bg-soft danger inline-flex items-center gap-1"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span> Assign worker first
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); toggleShiftFlag(shift.id, 'clientPaid'); }}
              className={`text-xs px-3 py-1.5 rounded-md ${shift.clientPaid ? 'warning-bg-soft warning' : 'success-bg-soft success'}`}
            >
              {shift.clientPaid ? 'Mark client unpaid' : 'Mark client paid'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setModal({ type: 'shift', id: shift.id }); }}
              className="text-xs px-3 py-1.5 rounded-md card-border ink-muted hover:ink ml-auto inline-flex items-center gap-1"
            >
              <Edit2 size={12} /> Edit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PaidPill({ paid, overdue, label, daysLeft }) {
  if (paid) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded success-bg-soft success inline-flex items-center gap-1">
        <CheckCircle2 size={9} strokeWidth={2.5} />
        {label}
      </span>
    );
  }
  if (overdue) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded danger-bg-soft danger">
        {label} overdue
      </span>
    );
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded warning-bg-soft warning">
      {label} unpaid{typeof daysLeft === 'number' && label === 'Client' && daysLeft >= 0 ? ` · ${daysLeft}d` : ''}
    </span>
  );
}

// ---------- Calendar View ----------
function CalendarView({ ctx }) {
  const { data, fmtMoney, setModal, createShiftFromTemplate, removeLastShiftFromTemplate } = ctx;

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [mode, setMode] = useState('month'); // 'month' | 'year'
  const [activeTemplateId, setActiveTemplateId] = useState(null);

  const templates = data.shiftTemplates;
  const monthName = new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  // All shifts in the current month
  const monthShifts = useMemo(() => {
    return data.shifts.filter(s => {
      const d = new Date(s.date + 'T00:00:00');
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [data.shifts, year, month]);

  // Shifts grouped by date
  const shiftsByDate = useMemo(() => {
    const map = new Map();
    for (const s of monthShifts) {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date).push(s);
    }
    return map;
  }, [monthShifts]);

  // Calendar grid cells
  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = (firstDay.getDay() + 6) % 7; // Mon=0
    const out = [];
    for (let i = 0; i < startWeekday; i++) out.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateObj = new Date(year, month, d);
      const iso = dateObj.toISOString().slice(0, 10);
      out.push({ day: d, iso, weekday: dateObj.getDay() });
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [year, month]);

  // Month stats
  const monthStats = useMemo(() => {
    let earned = 0, paidOut = 0, hours = 0, unassigned = 0;
    for (const s of monthShifts) {
      const h = Number(s.hours) || 0;
      earned += h * (Number(s.clientRate) || 0);
      paidOut += h * (Number(s.workerRate) || 0);
      hours += h;
      if (!s.workerId) unassigned++;
    }
    return { earned, paidOut, hours, count: monthShifts.length, unassigned };
  }, [monthShifts]);

  // Year overview stats (for year mode)
  const yearStats = useMemo(() => {
    const stats = {};
    for (let m = 0; m < 12; m++) stats[m] = { earned: 0, paidOut: 0, hours: 0, count: 0 };
    for (const s of data.shifts) {
      const d = new Date(s.date + 'T00:00:00');
      if (d.getFullYear() !== year) continue;
      const m = d.getMonth();
      stats[m].earned += (Number(s.hours) || 0) * (Number(s.clientRate) || 0);
      stats[m].paidOut += (Number(s.hours) || 0) * (Number(s.workerRate) || 0);
      stats[m].hours += (Number(s.hours) || 0);
      stats[m].count++;
    }
    return stats;
  }, [data.shifts, year]);

  const handleCellTap = (iso) => {
    if (!activeTemplateId) {
      // No template active — open day detail / new shift for this date
      setModal({ type: 'shift', id: undefined, prefillDate: iso });
      return;
    }
    const activeTemplate = templates.find(t => t.id === activeTemplateId);
    if (!activeTemplate) return;
    const existing = (shiftsByDate.get(iso) || []).filter(s => s.templateId === activeTemplateId);
    if (existing.length > 0) {
      // Tap again = remove last
      removeLastShiftFromTemplate(activeTemplateId, iso);
    } else {
      createShiftFromTemplate(activeTemplate, iso);
    }
  };

  const handleShiftTap = (e, shiftId) => {
    e.stopPropagation();
    setModal({ type: 'shift', id: shiftId });
  };

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const weekdayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  const activeTemplate = templates.find(t => t.id === activeTemplateId);

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 rounded-md hover:bg-stone-100"><ChevronLeft size={16}/></button>
          <div className="font-display text-xl tracking-tight min-w-[160px] text-center">{mode === 'month' ? monthName : year}</div>
          <button onClick={nextMonth} className="p-2 rounded-md hover:bg-stone-100"><ChevronRight size={16}/></button>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'month' && monthStats.unassigned > 0 && (
            <div className="text-xs danger inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
              {monthStats.unassigned} unassigned
            </div>
          )}
          <div className="flex card-border surface rounded-lg overflow-hidden">
            <button
              onClick={() => setMode('month')}
              className={`text-xs px-3 py-1.5 ${mode === 'month' ? 'accent-bg text-white' : 'ink-muted hover:ink'}`}
            >Month</button>
            <button
              onClick={() => setMode('year')}
              className={`text-xs px-3 py-1.5 ${mode === 'year' ? 'accent-bg text-white' : 'ink-muted hover:ink'}`}
            >Year</button>
          </div>
        </div>
      </div>

      {/* ── YEAR MODE ── */}
      {mode === 'year' && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <button onClick={() => setYear(y => y - 1)} className="p-1.5 rounded hover:bg-stone-100"><ChevronLeft size={14}/></button>
            <span className="text-sm font-medium">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="p-1.5 rounded hover:bg-stone-100"><ChevronRight size={14}/></button>
          </div>
          <div className="space-y-2">
            {monthNames.map((name, m) => {
              const s = yearStats[m];
              const isCurrent = year === today.getFullYear() && m === today.getMonth();
              return (
                <button
                  key={m}
                  onClick={() => { setMonth(m); setMode('month'); }}
                  className={`w-full card-border surface rounded-lg p-3 text-left hover:border-stone-400 flex items-center justify-between gap-3 ${isCurrent ? 'ring-1 ring-stone-300' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm w-8">{name}</span>
                    {isCurrent && <span className="text-[10px] ink-muted uppercase tracking-wider">Now</span>}
                    <span className="text-xs ink-muted">{s.count > 0 ? `${s.count} shifts, ${s.hours}h` : 'No shifts'}</span>
                  </div>
                  <div className="flex gap-4 text-sm tabular">
                    <span className="ink-muted text-xs">{fmtMoney(s.earned)}</span>
                    <ChevronRight size={12} className="ink-soft self-center"/>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── MONTH MODE ── */}
      {mode === 'month' && (
        <>
          {/* Month stats */}
          {monthStats.count > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-3">
              {[
                { label: 'Shifts', value: monthStats.count },
                { label: 'Hours', value: monthStats.hours },
                { label: 'Earned', value: fmtMoney(monthStats.earned) },
                { label: 'Paid out', value: fmtMoney(monthStats.paidOut) },
              ].map(s => (
                <div key={s.label} className="surface-2 rounded-md p-2 text-center">
                  <div className="text-[9px] uppercase tracking-wider ink-muted">{s.label}</div>
                  <div className="text-sm font-medium tabular mt-0.5">{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Instruction */}
          <div className="text-xs ink-muted text-center mb-2 min-h-[18px]">
            {activeTemplate
              ? <span>Tap a day to add <span className="font-medium" style={{ color: paletteAt(activeTemplate.colorIndex || 0).text }}>{activeTemplate.label || data.sites.find(s => s.id === activeTemplate.siteId)?.name}</span>. Tap again to remove.</span>
              : templates.length > 0
                ? 'Select a shift template below, then tap days to add shifts. Tap a shift chip to edit.'
                : 'Tap + to add templates for quick scheduling, or tap any day to log a shift manually.'
            }
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {weekdayLabels.map(l => (
              <div key={l} className="text-[10px] uppercase ink-soft text-center py-1">{l}</div>
            ))}
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-7 gap-0.5 mb-4">
            {cells.map((c, i) => {
              if (!c) return <div key={i} className="rounded-md" style={{ minHeight: 56 }}></div>;
              const isToday = c.iso === todayISO();
              const dayShifts = shiftsByDate.get(c.iso) || [];
              const isWeekend = c.weekday === 0 || c.weekday === 6;

              return (
                <div
                  key={c.iso}
                  onClick={() => handleCellTap(c.iso)}
                  className={`rounded-md p-1 cursor-pointer transition-colors ${
                    isToday ? 'ring-2 ring-black ring-inset' : ''
                  } ${activeTemplateId ? 'hover:bg-stone-100' : 'hover:bg-stone-50'}`}
                  style={{ minHeight: 56, backgroundColor: isToday ? '#F5F5F4' : undefined }}
                >
                  <div className={`text-[11px] font-medium mb-0.5 ${
                    isToday ? 'ink' : isWeekend ? 'ink-muted' : 'ink'
                  }`}>
                    {c.day}
                  </div>
                  <div className="space-y-0.5 overflow-hidden">
                    {dayShifts.slice(0, 3).map(s => (
                      <ShiftChip
                        key={s.id}
                        shift={s}
                        templates={templates}
                        sites={data.sites}
                        workers={data.workers}
                        onClick={(e) => handleShiftTap(e, s.id)}
                      />
                    ))}
                    {dayShifts.length > 3 && (
                      <div className="text-[9px] ink-muted text-center">+{dayShifts.length - 3}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Template picker */}
          <div className="card-border surface rounded-xl p-3 mb-2">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-wider ink-muted">Shift templates</div>
              <button
                onClick={() => setModal({ type: 'shift-template' })}
                className="text-[11px] ink-muted hover:ink inline-flex items-center gap-1"
              >
                <Plus size={11} /> Add
              </button>
            </div>
            {templates.length === 0 ? (
              <button
                onClick={() => setModal({ type: 'shift-template' })}
                className="w-full p-3 card-border rounded-lg text-sm ink-muted text-center hover:border-stone-400 hover:ink"
              >
                No templates yet. Tap here to add your first one.
              </button>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {templates.map(tmpl => {
                  const site = data.sites.find(s => s.id === tmpl.siteId);
                  const color = paletteAt(tmpl.colorIndex || 0);
                  const label = tmpl.label || site?.name || '?';
                  const isActive = activeTemplateId === tmpl.id;
                  return (
                    <button
                      key={tmpl.id}
                      onClick={() => setActiveTemplateId(isActive ? null : tmpl.id)}
                      onContextMenu={(e) => { e.preventDefault(); setModal({ type: 'shift-template', id: tmpl.id }); }}
                      className="flex-shrink-0 px-3 py-2 rounded-lg text-left transition-all"
                      style={{
                        backgroundColor: color.bg,
                        color: color.text,
                        outline: isActive ? `2px solid ${color.border}` : 'none',
                        outlineOffset: 2,
                        boxShadow: isActive ? `0 0 0 1px ${color.border}` : 'none'
                      }}
                    >
                      <div className="text-xs font-semibold">{label}</div>
                      <div className="text-[10px] opacity-70 tabular mt-0.5">{tmpl.startTime} – {tmpl.endTime}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="text-[10px] ink-soft text-center">Hold (right-click on desktop) a template to edit it</div>
        </>
      )}
    </div>
  );
}

// Small shift chip for the calendar grid
function ShiftChip({ shift, templates, sites, workers, onClick }) {
  const template = templates.find(t => t.id === shift.templateId);
  const site = sites.find(s => s.id === shift.siteId);
  const worker = workers.find(w => w.id === shift.workerId);
  const color = template ? paletteAt(template.colorIndex || 0) : { bg: '#E7E5E4', text: '#525252', border: '#A3A3A3' };
  const label = template?.label || site?.name || '?';
  const abbreviation = label.length <= 4 ? label : label.slice(0, 4);
  const unassigned = !shift.workerId;

  return (
    <div
      className="relative rounded text-[9px] font-semibold px-1 py-0.5 truncate cursor-pointer leading-tight"
      style={{ backgroundColor: color.bg, color: color.text }}
      onClick={onClick}
      title={`${label} · ${shift.hours}h · ${worker?.name || 'Unassigned'}`}
    >
      {abbreviation}
      {unassigned && (
        <span
          className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-red-500 translate-x-0.5 -translate-y-0.5"
          title="No worker assigned"
        />
      )}
    </div>
  );
}


// ---------- Invoices View (handles client invoices + worker payslips) ----------
function Invoices({ ctx }) {
  const { data, fmtMoney, setModal } = ctx;
  const [activeType, setActiveType] = useState('client'); // 'client' | 'worker'
  const [filter, setFilter] = useState('all');

  const isClient = activeType === 'client';

  // Headline numbers — what is actually owed (across ALL shifts, not just invoiced)
  const position = useMemo(() => {
    let totalOwed = 0;
    let totalOwedShifts = 0;
    let uninvoicedAmount = 0;
    let uninvoicedShifts = 0;
    const linkField = isClient ? 'invoiceId' : 'payslipId';
    const paidFlag = isClient ? 'clientPaid' : 'workerPaid';
    const rate = isClient ? 'clientRate' : 'workerRate';

    for (const s of data.shifts) {
      if (s[paidFlag]) continue;
      const amount = (Number(s.hours) || 0) * (Number(s[rate]) || 0);
      totalOwed += amount;
      totalOwedShifts += 1;
      if (!s[linkField]) {
        uninvoicedAmount += amount;
        uninvoicedShifts += 1;
      }
    }
    return { totalOwed, totalOwedShifts, uninvoicedAmount, uninvoicedShifts };
  }, [data.shifts, isClient]);

  const invoices = useMemo(() => {
    let list = data.invoices.filter(i => (i.type || 'client') === activeType);
    if (filter !== 'all') list = list.filter(i => i.status === filter);
    return list.sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
  }, [data.invoices, filter, activeType]);

  const totalByStatus = useMemo(() => {
    const sums = { draft: 0, sent: 0, paid: 0 };
    for (const inv of data.invoices.filter(i => (i.type || 'client') === activeType)) {
      const total = inv.shiftIds.reduce((sum, sid) => {
        const s = data.shifts.find(x => x.id === sid);
        if (!s) return sum;
        const r = isClient ? s.clientRate : s.workerRate;
        return sum + (Number(s.hours) || 0) * (Number(r) || 0);
      }, 0);
      sums[inv.status] = (sums[inv.status] || 0) + total;
    }
    return sums;
  }, [data.invoices, data.shifts, activeType, isClient]);

  if (data.shifts.length === 0) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="font-display text-3xl sm:text-[34px] leading-none">Invoices &amp; payslips</h1>
          <p className="ink-muted text-sm mt-2">Bill clients, track what you pay workers.</p>
        </div>
        <div className="card-border surface rounded-lg p-10 text-center">
          <FileText size={28} className="mx-auto ink-soft mb-3" strokeWidth={1.5} />
          <p className="text-sm ink-muted">Log some shifts first, then come back here to bill clients or create payslips for workers.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-[34px] leading-none">Invoices &amp; payslips</h1>
        <p className="ink-muted text-sm mt-2">Bill clients, track what you pay workers.</p>
      </div>

      {/* Type sub-tabs */}
      <div className="flex card-border surface rounded-lg p-1 mb-6 w-full sm:w-fit">
        <button
          onClick={() => { setActiveType('client'); setFilter('all'); }}
          className={`text-sm px-4 py-2 rounded-md flex-1 sm:flex-none ${activeType === 'client' ? 'accent-bg text-white font-medium' : 'ink-muted hover:ink'}`}
        >
          Client invoices
        </button>
        <button
          onClick={() => { setActiveType('worker'); setFilter('all'); }}
          className={`text-sm px-4 py-2 rounded-md flex-1 sm:flex-none ${activeType === 'worker' ? 'accent-bg text-white font-medium' : 'ink-muted hover:ink'}`}
        >
          Worker payslips
        </button>
      </div>

      {/* Headline position card */}
      <div className="card-border surface rounded-xl p-5 mb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] ink-muted">
              {isClient ? 'Clients owe you' : "You owe workers"}
            </div>
            <div className="font-display text-3xl tabular mt-2">{fmtMoney(position.totalOwed)}</div>
            <div className="text-xs ink-muted mt-1">
              Across {position.totalOwedShifts} unpaid shift{position.totalOwedShifts === 1 ? '' : 's'}.
              {position.uninvoicedShifts > 0 && (
                <> <span className="warning font-medium">{position.uninvoicedShifts}</span> not yet {isClient ? 'invoiced' : 'on a payslip'} ({fmtMoney(position.uninvoicedAmount)}).</>
              )}
            </div>
          </div>
          <button
            onClick={() => setModal({ type: 'invoice-new', invoiceType: activeType })}
            className="accent-bg text-white text-sm px-4 py-2.5 rounded-md inline-flex items-center gap-2 font-medium shrink-0"
          >
            <Plus size={14} /> New {isClient ? 'invoice' : 'payslip'}
          </button>
        </div>
      </div>

      {/* Status totals strip */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="card-border surface rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider ink-muted">Draft</div>
          <div className="tabular font-medium mt-1">{fmtMoney(totalByStatus.draft || 0)}</div>
        </div>
        <div className="card-border surface rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider warning">{isClient ? 'Awaiting payment' : 'Issued, not paid'}</div>
          <div className="tabular font-medium mt-1">{fmtMoney(totalByStatus.sent || 0)}</div>
        </div>
        <div className="card-border surface rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider success">Paid</div>
          <div className="tabular font-medium mt-1">{fmtMoney(totalByStatus.paid || 0)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {[
          { id: 'all', label: 'All' },
          { id: 'draft', label: 'Drafts' },
          { id: 'sent', label: isClient ? 'Sent' : 'Issued' },
          { id: 'paid', label: 'Paid' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`text-xs px-3 py-1.5 rounded-full border ${filter === f.id ? 'accent-bg text-white border-transparent' : 'card-border surface ink-muted hover:ink'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {invoices.length === 0 ? (
        <div className="card-border surface rounded-lg p-8 text-center text-sm ink-muted">
          {data.invoices.filter(i => (i.type || 'client') === activeType).length === 0
            ? `No ${isClient ? 'invoices' : 'payslips'} yet. Create your first one with the button above.`
            : 'Nothing matches this filter.'}
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => <InvoiceRow key={inv.id} invoice={inv} ctx={ctx} />)}
        </div>
      )}
    </div>
  );
}

function InvoiceRow({ invoice, ctx }) {
  const { data, fmtMoney, setModal } = ctx;
  const type = invoice.type || 'client';
  const isClient = type === 'client';
  const entity = isClient
    ? data.clients.find(c => c.id === invoice.clientId)
    : data.workers.find(w => w.id === invoice.workerId);
  const total = invoice.shiftIds.reduce((sum, sid) => {
    const s = data.shifts.find(x => x.id === sid);
    if (!s) return sum;
    const r = isClient ? s.clientRate : s.workerRate;
    return sum + (Number(s.hours) || 0) * (Number(r) || 0);
  }, 0);

  const statusBadge = isClient ? {
    draft: { cls: 'card-border ink-muted', label: 'Draft' },
    sent: { cls: 'warning-bg-soft warning', label: 'Awaiting payment' },
    paid: { cls: 'success-bg-soft success', label: 'Paid' }
  }[invoice.status] : {
    draft: { cls: 'card-border ink-muted', label: 'Draft' },
    sent: { cls: 'warning-bg-soft warning', label: 'Issued' },
    paid: { cls: 'success-bg-soft success', label: 'Paid' }
  }[invoice.status] || { cls: 'card-border ink-muted', label: invoice.status };

  return (
    <button
      onClick={() => setModal({ type: 'invoice-view', id: invoice.id })}
      className="w-full card-border surface rounded-lg p-4 text-left hover-row flex items-center justify-between gap-3"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-sm tabular">{invoice.invoiceNumber}</span>
          <span className="text-xs ink-muted">·</span>
          <span className="text-sm truncate">{entity?.name || (isClient ? 'Unknown client' : 'Unknown worker')}</span>
        </div>
        <div className="text-xs ink-muted mt-0.5">
          {fmtDateShort(invoice.dateFrom)} → {fmtDateShort(invoice.dateTo)} · {invoice.shiftIds.length} shift{invoice.shiftIds.length === 1 ? '' : 's'}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="tabular font-medium">{fmtMoney(total)}</div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded mt-1 inline-block ${statusBadge.cls}`}>{statusBadge.label}</span>
      </div>
    </button>
  );
}

// ---------- Setup ----------
function Setup({ ctx }) {
  const { data, setModal, deleteWorker, deleteSite, deleteClient, deleteShiftTemplate, fmtMoney, updateSettings, cur } = ctx;

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl sm:text-[34px] leading-none">Setup</h1>
        <p className="ink-muted text-sm mt-2">Templates, clients, workers, sites, backups.</p>
      </div>

      {/* Shift Templates */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="font-display text-lg tracking-tight">Shift templates</h2>
          <button
            onClick={() => setModal({ type: 'shift-template' })}
            className="text-xs ink inline-flex items-center gap-1 hover:underline"
          >
            <Plus size={12} /> Add template
          </button>
        </div>
        <p className="text-xs ink-muted mb-3">Reusable shift shapes — site, start time, end time. Tap them on the calendar to log shifts instantly.</p>
        {data.shiftTemplates.length === 0 ? (
          <button
            onClick={() => setModal({ type: 'shift-template' })}
            className="w-full card-border surface rounded-lg p-5 text-sm ink-muted text-center hover:border-stone-400 hover:ink"
          >
            No templates yet. Add one to enable the tap-to-schedule calendar.
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.shiftTemplates.map((tmpl, i) => {
              const site = data.sites.find(s => s.id === tmpl.siteId);
              const color = paletteAt(tmpl.colorIndex ?? i);
              const label = tmpl.label || site?.name || '?';
              const hours = timeDiffHours(tmpl.startTime, tmpl.endTime);
              return (
                <div
                  key={tmpl.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ backgroundColor: color.bg, color: color.text }}
                >
                  <div>
                    <div className="text-xs font-semibold">{label}</div>
                    <div className="text-[10px] opacity-70 tabular">{tmpl.startTime} – {tmpl.endTime} ({hours}h)</div>
                    {site && <div className="text-[10px] opacity-60">{site.name}</div>}
                  </div>
                  <button
                    onClick={() => setModal({ type: 'shift-template', id: tmpl.id })}
                    className="ml-2 p-1 rounded hover:bg-black hover:bg-opacity-10"
                  >
                    <Edit2 size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Clients */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <h2 className="font-display text-lg tracking-tight">Clients</h2>
            <p className="text-xs ink-muted mt-0.5">The companies that pay you. One client can have many sites.</p>
          </div>
          <button
            onClick={() => setModal({ type: 'client' })}
            className="text-xs ink inline-flex items-center gap-1 hover:underline"
          >
            <Plus size={12} /> Add client
          </button>
        </div>
        {data.clients.length === 0 ? (
          <div className="card-border surface rounded-lg p-5 text-sm ink-muted text-center">
            No clients yet. Add one to enable invoicing.
          </div>
        ) : (
          <div className="card-border surface rounded-lg divide-y" style={{ borderColor: '#E7E5E4' }}>
            {data.clients.map(c => {
              const siteCount = data.sites.filter(s => s.clientId === c.id).length;
              return (
                <div key={c.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm">{c.name}</div>
                    <div className="text-xs ink-muted">
                      Pays in {c.paymentTermsDays || 0}d · {siteCount} site{siteCount === 1 ? '' : 's'}
                      {c.contact && <span> · {c.contact}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setModal({ type: 'client', id: c.id })}
                      className="p-1.5 rounded hover:bg-stone-100"
                    >
                      <Edit2 size={13} className="ink-muted" />
                    </button>
                    <button
                      onClick={() => {
                        if (siteCount > 0 && !confirm(`${siteCount} site(s) linked. They'll be unlinked. Continue?`)) return;
                        deleteClient(c.id);
                      }}
                      className="p-1.5 rounded hover:bg-stone-100"
                    >
                      <Trash2 size={13} className="ink-muted" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Workers */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-lg tracking-tight">Workers</h2>
          <button
            onClick={() => setModal({ type: 'worker' })}
            className="text-xs ink inline-flex items-center gap-1 hover:underline"
          >
            <Plus size={12} /> Add worker
          </button>
        </div>
        {data.workers.length === 0 ? (
          <div className="card-border surface rounded-lg p-5 text-sm ink-muted text-center">
            No workers yet. Add yourself and anyone you send out.
          </div>
        ) : (
          <div className="card-border surface rounded-lg divide-y" style={{ borderColor: '#E7E5E4' }}>
            {data.workers.map(w => (
              <div key={w.id} className="p-3 flex items-center justify-between gap-3" style={{ borderBottomColor: '#E7E5E4' }}>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm">{w.name}</div>
                  <div className="text-xs ink-muted">
                    {fmtMoney(w.rate)}/h
                    {w.phone && <span> · {w.phone}</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setModal({ type: 'worker', id: w.id })}
                    className="p-1.5 rounded hover:bg-stone-100"
                  >
                    <Edit2 size={13} className="ink-muted" />
                  </button>
                  <button
                    onClick={() => {
                      const used = data.shifts.some(s => s.workerId === w.id);
                      if (used && !confirm(`${w.name} has shifts logged. Delete anyway? (Shifts will keep their data but the name will show as "Unknown".)`)) return;
                      deleteWorker(w.id);
                    }}
                    className="p-1.5 rounded hover:bg-stone-100"
                  >
                    <Trash2 size={13} className="ink-muted" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Sites */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-lg tracking-tight">Sites</h2>
          <button
            onClick={() => setModal({ type: 'site' })}
            className="text-xs ink inline-flex items-center gap-1 hover:underline"
          >
            <Plus size={12} /> Add site
          </button>
        </div>
        {data.sites.length === 0 ? (
          <div className="card-border surface rounded-lg p-5 text-sm ink-muted text-center">
            No sites yet. Add a client location with their hourly rate and payment terms.
          </div>
        ) : (
          <div className="card-border surface rounded-lg divide-y">
            {data.sites.map(s => {
              const client = data.clients.find(c => c.id === s.clientId);
              return (
                <div key={s.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm">{s.name}</div>
                    <div className="text-xs ink-muted">
                      {client && <span>{client.name} · </span>}
                      {fmtMoney(s.rate)}/h · pays in {s.paymentTermsDays || 0}d
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setModal({ type: 'site', id: s.id })}
                      className="p-1.5 rounded hover:bg-stone-100"
                    >
                      <Edit2 size={13} className="ink-muted" />
                    </button>
                    <button
                      onClick={() => {
                        const used = data.shifts.some(sh => sh.siteId === s.id);
                        if (used && !confirm(`${s.name} has shifts logged. Delete anyway?`)) return;
                        deleteSite(s.id);
                      }}
                      className="p-1.5 rounded hover:bg-stone-100"
                    >
                      <Trash2 size={13} className="ink-muted" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Backup */}
      <section className="mb-10">
        <h2 className="font-display text-lg tracking-tight mb-3">Backup &amp; restore</h2>

        <div className="card-border surface rounded-lg p-4 mb-3">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle size={16} className="warning mt-0.5 shrink-0" />
            <div className="text-xs ink-muted leading-relaxed">
              Your data lives in this browser only. To protect against losing it — or to move between phone and laptop — download a backup file regularly and save it to <span className="ink font-medium">iCloud Drive, Google Drive, or Dropbox</span>. You can import it again any time, on any device.
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ledger-backup-${todayISO()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                ctx.setData(d => ({ ...d, settings: { ...d.settings, lastBackup: new Date().toISOString() } }));
              }}
              className="text-sm px-4 py-2 rounded-md accent-bg text-white font-medium inline-flex items-center gap-2"
            >
              <Download size={14} /> Download backup
            </button>

            <label className="text-sm px-4 py-2 rounded-md card-border surface ink-muted hover:ink inline-flex items-center gap-2 cursor-pointer">
              <ArrowUpRight size={14} /> Restore from file
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    try {
                      const parsed = JSON.parse(ev.target.result);
                      if (!Array.isArray(parsed.workers) || !Array.isArray(parsed.sites) || !Array.isArray(parsed.shifts)) {
                        throw new Error('Not a valid backup file');
                      }
                      const summary = `Restore will REPLACE all current data with:\n• ${(parsed.clients || []).length} clients\n• ${parsed.workers.length} workers\n• ${parsed.sites.length} sites\n• ${parsed.shifts.length} shifts\n• ${(parsed.invoices || []).length} invoices\n\nContinue?`;
                      if (confirm(summary)) {
                        ctx.setData(migrate(parsed));
                        alert('Backup restored.');
                      }
                    } catch (err) {
                      alert("Couldn't read this file. Make sure it's a Ledger backup (.json).");
                    }
                  };
                  reader.readAsText(file);
                  e.target.value = '';
                }}
              />
            </label>

            <button
              onClick={() => {
                // CSV export of all shifts
                const rows = [
                  ['Date', 'Worker', 'Site', 'Client', 'Hours', 'Worker rate', 'Worker pay', 'Client rate', 'Client charge', 'Margin', 'Worker paid', 'Worker paid date', 'Client paid', 'Client paid date', 'Invoice', 'Notes']
                ];
                for (const s of [...data.shifts].sort((a, b) => a.date.localeCompare(b.date))) {
                  const w = data.workers.find(x => x.id === s.workerId);
                  const site = data.sites.find(x => x.id === s.siteId);
                  const client = site ? data.clients.find(c => c.id === site.clientId) : null;
                  const inv = s.invoiceId ? data.invoices.find(i => i.id === s.invoiceId) : null;
                  const hours = Number(s.hours) || 0;
                  const pay = hours * (Number(s.workerRate) || 0);
                  const charge = hours * (Number(s.clientRate) || 0);
                  rows.push([
                    s.date, w?.name || '', site?.name || '', client?.name || '',
                    hours, s.workerRate || 0, pay.toFixed(2),
                    s.clientRate || 0, charge.toFixed(2), (charge - pay).toFixed(2),
                    s.workerPaid ? 'yes' : 'no', s.workerPaidDate || '',
                    s.clientPaid ? 'yes' : 'no', s.clientPaidDate || '',
                    inv?.invoiceNumber || '', (s.notes || '').replace(/\n/g, ' ')
                  ]);
                }
                const csv = rows.map(r => r.map(cell => {
                  const str = String(cell ?? '');
                  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
                  return str;
                }).join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ledger-shifts-${todayISO()}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              className="text-sm px-4 py-2 rounded-md card-border surface ink-muted hover:ink inline-flex items-center gap-2"
            >
              <FileText size={14} /> Export CSV
            </button>
          </div>

          {ctx.data.settings?.lastBackup && (
            <div className="text-[11px] ink-soft mt-3">
              Last backup: {new Date(ctx.data.settings.lastBackup).toLocaleString('en-GB')}
            </div>
          )}
        </div>

        <details className="card-border surface rounded-lg">
          <summary className="text-sm cursor-pointer hover:bg-stone-50 p-4">
            Want fully automatic sync across phone &amp; laptop?
          </summary>
          <div className="px-4 pb-4 text-sm ink-muted leading-relaxed space-y-2">
            <p>This tool can't sync automatically on its own — that needs a server. Two good options if you grow out of backup files:</p>
            <p><span className="ink font-medium">Easy path:</span> rebuild this same setup in <span className="ink">Airtable</span> (free, syncs everywhere, has phone apps). Ask me and I'll walk you through it.</p>
            <p><span className="ink font-medium">Power path:</span> have this exact app deployed as a real web app with a cloud database. Costs a few pounds/month.</p>
            <p>For most one-person operations, weekly backup files to iCloud or Drive is plenty safe and zero hassle.</p>
          </div>
        </details>
      </section>

      {/* Preferences */}
      <section>
        <h2 className="font-display text-lg tracking-tight mb-3">Preferences</h2>
        <div className="card-border surface rounded-lg p-4">
          <label className="block">
            <div className="text-xs ink-muted mb-1.5 font-medium">Currency symbol</div>
            <input
              type="text"
              value={cur}
              onChange={e => updateSettings({ currency: e.target.value })}
              maxLength={3}
              className="w-20 px-3 py-2 text-sm card-border rounded-md outline-none"
              style={{ backgroundColor: '#FFFFFF' }}
            />
          </label>
        </div>

        <div className="mt-6 text-xs ink-soft">
          <details>
            <summary className="cursor-pointer hover:ink">Danger zone</summary>
            <button
              onClick={() => {
                if (confirm('Delete ALL data? This cannot be undone. (Tip: download a backup first.)')) {
                  ctx.setData(defaultData);
                }
              }}
              className="mt-2 text-xs danger hover:underline"
            >
              Erase everything
            </button>
          </details>
        </div>
      </section>
    </div>
  );
}

// ---------- Modal Shell ----------
function Modal({ title, onClose, children, onSave, onDelete, saveLabel = 'Save', wide }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }} onClick={onClose}>
      <div
        className={`bg-white rounded-t-2xl sm:rounded-xl w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[92vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b card-border">
          <h2 className="font-display text-lg tracking-tight">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-stone-100">
            <X size={18} className="ink-muted" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 sm:p-5 flex-1">{children}</div>
        <div className="p-4 sm:p-5 border-t card-border flex items-center justify-between gap-2">
          <div>
            {onDelete && (
              <button onClick={onDelete} className="text-sm danger hover:underline">Delete</button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-md card-border ink-muted hover:ink">
              Cancel
            </button>
            <button onClick={onSave} className="text-sm px-4 py-2 rounded-md accent-bg text-white font-medium">
              {saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <div className="text-xs ink-muted mb-1.5 font-medium">{label}</div>
      {children}
      {hint && <div className="text-[11px] ink-soft mt-1">{hint}</div>}
    </label>
  );
}

const inputCls = "w-full px-3 py-2 text-sm card-border rounded-md outline-none focus:border-stone-500";


// ---------- Custom DatePicker (reliable across browsers/iframes) ----------
function DatePicker({ value, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);
  const buttonRef = useRef(null);

  // View state inside the picker
  const initial = value ? new Date(value + 'T00:00:00') : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target) &&
          buttonRef.current && !buttonRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const displayValue = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
    : 'Pick a date';

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const cells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const startWeekday = (firstDay.getDay() + 6) % 7;
    const out = [];
    for (let i = 0; i < startWeekday; i++) out.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateObj = new Date(viewYear, viewMonth, d);
      out.push({ day: d, iso: dateObj.toISOString().slice(0, 10), weekday: dateObj.getDay() });
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [viewYear, viewMonth]);

  const select = (iso) => {
    onChange(iso);
    setOpen(false);
  };

  const weekdayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2 text-sm card-border rounded-md text-left flex items-center justify-between gap-2 hover:border-stone-400"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <span className={value ? 'ink' : 'ink-soft'}>{displayValue}</span>
        <CalendarDays size={14} className="ink-muted" />
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute z-50 mt-1 bg-white card-border rounded-lg shadow-xl p-3 w-[280px]"
          style={{ backgroundColor: '#FFFFFF', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.2)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => {
                if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
                else setViewMonth(m => m - 1);
              }}
              className="p-1 rounded hover:bg-stone-100"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="text-sm font-medium">{monthName}</div>
            <button
              type="button"
              onClick={() => {
                if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
                else setViewMonth(m => m + 1);
              }}
              className="p-1 rounded hover:bg-stone-100"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {weekdayLabels.map((l, i) => (
              <div key={i} className="text-[10px] uppercase ink-soft text-center py-1">{l}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((c, i) => {
              if (!c) return <div key={i} className="aspect-square"></div>;
              const isSelected = c.iso === value;
              const isToday = c.iso === todayISO();
              return (
                <button
                  key={c.iso}
                  type="button"
                  onClick={() => select(c.iso)}
                  className={`aspect-square text-xs rounded flex items-center justify-center transition-colors font-medium ${
                    isSelected
                      ? 'accent-bg text-white'
                      : isToday
                        ? 'ink ring-1 ring-stone-300 bg-stone-50'
                        : 'ink hover:bg-stone-100'
                  }`}
                >
                  {c.day}
                </button>
              );
            })}
          </div>

          <div className="flex gap-1 mt-2 pt-2 border-t card-border">
            <button
              type="button"
              onClick={() => select(todayISO())}
              className="text-[11px] px-2 py-1 rounded ink-muted hover:ink hover:bg-stone-100 flex-1"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                const d = new Date(); d.setDate(d.getDate() - 1);
                select(d.toISOString().slice(0, 10));
              }}
              className="text-[11px] px-2 py-1 rounded ink-muted hover:ink hover:bg-stone-100 flex-1"
            >
              Yesterday
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Shift Template Modal ----------
function ShiftTemplateModal({ ctx, onClose, editId }) {
  const { data, upsertShiftTemplate, deleteShiftTemplate, setModal } = ctx;
  const existing = editId ? data.shiftTemplates.find(t => t.id === editId) : null;
  const [form, setForm] = useState(existing || {
    label: '',
    siteId: data.sites[0]?.id || '',
    startTime: '18:00',
    endTime: '06:00',
    colorIndex: data.shiftTemplates.length % TEMPLATE_PALETTE.length
  });

  const site = data.sites.find(s => s.id === form.siteId);
  const computedHours = timeDiffHours(form.startTime, form.endTime);
  const color = paletteAt(form.colorIndex || 0);

  const handleSave = () => {
    if (!form.siteId) { alert('Pick a site.'); return; }
    if (!form.startTime || !form.endTime) { alert('Set start and end times.'); return; }
    upsertShiftTemplate({ ...form, id: editId });
    onClose();
  };

  if (data.sites.length === 0) {
    return (
      <Modal title="Add a site first" onClose={onClose} onSave={() => { onClose(); setModal({ type: 'site' }); }} saveLabel="Add site">
        <p className="text-sm ink-muted">Shift templates need a site (which carries the client rate). Add a site first.</p>
      </Modal>
    );
  }

  return (
    <Modal
      title={editId ? 'Edit shift template' : 'New shift template'}
      onClose={onClose}
      onSave={handleSave}
      onDelete={editId ? () => {
        if (!confirm('Delete this template? Existing shifts using it stay but lose the template link.')) return;
        deleteShiftTemplate(editId); onClose();
      } : null}
    >
      <div className="space-y-4">
        {/* Preview chip */}
        <div className="flex items-center justify-center py-3">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium"
            style={{ backgroundColor: color.bg, color: color.text }}
          >
            <span>{form.label || site?.name || 'Template'}</span>
            <span className="opacity-60 text-xs tabular">{form.startTime} – {form.endTime}</span>
          </div>
        </div>

        <Field label="Site" hint="Which site is this for. Determines the client rate.">
          <select
            value={form.siteId}
            onChange={e => setForm({ ...form, siteId: e.target.value })}
            className={inputCls}
            style={{ backgroundColor: '#FFFFFF' }}
          >
            {data.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>

        <Field label="Label (optional)" hint="A short name like 'Night' or 'Day'. Defaults to the site name.">
          <input
            type="text"
            value={form.label || ''}
            onChange={e => setForm({ ...form, label: e.target.value })}
            placeholder={site?.name || 'Template name'}
            className={inputCls}
            style={{ backgroundColor: '#FFFFFF' }}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start time">
            <input
              type="time"
              value={form.startTime}
              onChange={e => setForm({ ...form, startTime: e.target.value })}
              className={inputCls}
              style={{ backgroundColor: '#FFFFFF' }}
            />
          </Field>
          <Field label="End time" hint={form.endTime && form.startTime && parseTime(form.endTime).h * 60 + parseTime(form.endTime).m <= parseTime(form.startTime).h * 60 + parseTime(form.startTime).m ? 'Wraps overnight' : ''}>
            <input
              type="time"
              value={form.endTime}
              onChange={e => setForm({ ...form, endTime: e.target.value })}
              className={inputCls}
              style={{ backgroundColor: '#FFFFFF' }}
            />
          </Field>
        </div>

        <div className="surface-2 rounded-md p-3 flex items-center justify-between text-sm">
          <span className="ink-muted">Hours per shift</span>
          <span className="tabular font-medium">{computedHours}h</span>
        </div>

        <Field label="Colour">
          <div className="flex gap-2 flex-wrap">
            {TEMPLATE_PALETTE.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setForm({ ...form, colorIndex: i })}
                className={`w-8 h-8 rounded-md transition-all ${form.colorIndex === i ? 'ring-2 ring-offset-1 ring-stone-700' : ''}`}
                style={{ backgroundColor: c.bg }}
              />
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}


// ---------- Worker Modal ----------
function WorkerModal({ ctx, onClose, editId }) {
  const { data, upsertWorker, deleteWorker } = ctx;
  const existing = editId ? data.workers.find(w => w.id === editId) : null;
  const [form, setForm] = useState(existing || { name: '', rate: '', phone: '', notes: '' });

  const handleSave = () => {
    if (!form.name?.trim()) return;
    upsertWorker({ ...form, id: editId, rate: Number(form.rate) || 0 });
    onClose();
  };

  return (
    <Modal
      title={editId ? 'Edit worker' : 'Add worker'}
      onClose={onClose}
      onSave={handleSave}
      onDelete={editId ? () => {
        const used = data.shifts.some(s => s.workerId === editId);
        if (used && !confirm('This worker has shifts logged. Delete anyway?')) return;
        deleteWorker(editId); onClose();
      } : null}
    >
      <div className="space-y-4">
        <Field label="Name">
          <input
            autoFocus
            type="text"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. James K, or 'Me'"
            className={inputCls}
            style={{ backgroundColor: '#FFFFFF' }}
          />
        </Field>
        <Field label="Default hourly rate" hint="What you pay them per hour. Can be overridden per shift.">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 ink-muted text-sm">{ctx.cur}</span>
            <input
              type="number"
              step="0.01"
              value={form.rate}
              onChange={e => setForm({ ...form, rate: e.target.value })}
              placeholder="12.50"
              className={`${inputCls} pl-7`}
              style={{ backgroundColor: '#FFFFFF' }}
            />
          </div>
        </Field>
        <Field label="Phone (optional)">
          <input
            type="tel"
            value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value })}
            className={inputCls}
            style={{ backgroundColor: '#FFFFFF' }}
          />
        </Field>
        <Field label="Notes (optional)">
          <textarea
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className={inputCls}
            style={{ backgroundColor: '#FFFFFF' }}
          />
        </Field>
      </div>
    </Modal>
  );
}

// ---------- Site Modal ----------
function SiteModal({ ctx, onClose, editId }) {
  const { data, upsertSite, deleteSite, setModal } = ctx;
  const existing = editId ? data.sites.find(s => s.id === editId) : null;
  const [form, setForm] = useState(existing || { name: '', clientId: '', rate: '', paymentTermsDays: 30, contact: '', notes: '' });

  const handleSave = () => {
    if (!form.name?.trim()) return;
    upsertSite({
      ...form,
      id: editId,
      clientId: form.clientId || null,
      rate: Number(form.rate) || 0,
      paymentTermsDays: Number(form.paymentTermsDays) || 0
    });
    onClose();
  };

  // When client changes, optionally inherit their payment terms
  const onClientChange = (clientId) => {
    const client = data.clients.find(c => c.id === clientId);
    setForm(f => ({
      ...f,
      clientId,
      paymentTermsDays: (!editId && client?.paymentTermsDays) ? client.paymentTermsDays : f.paymentTermsDays
    }));
  };

  return (
    <Modal
      title={editId ? 'Edit site' : 'Add site'}
      onClose={onClose}
      onSave={handleSave}
      onDelete={editId ? () => {
        const used = data.shifts.some(s => s.siteId === editId);
        if (used && !confirm('This site has shifts logged. Delete anyway?')) return;
        deleteSite(editId); onClose();
      } : null}
    >
      <div className="space-y-4">
        <Field label="Site name">
          <input
            autoFocus
            type="text"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Riverside Office, Bull Ring Mall"
            className={inputCls}
            style={{ backgroundColor: '#FFFFFF' }}
          />
        </Field>
        <Field label="Client" hint="Who pays you for this site. Leave blank if the site itself is the client.">
          <div className="flex gap-2">
            <select
              value={form.clientId || ''}
              onChange={e => onClientChange(e.target.value)}
              className={inputCls + ' flex-1'}
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <option value="">— No client / site is client —</option>
              {data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button
              type="button"
              onClick={() => { onClose(); setModal({ type: 'client' }); }}
              className="text-xs px-3 py-2 rounded-md card-border ink-muted hover:ink whitespace-nowrap"
            >
              + Add client
            </button>
          </div>
        </Field>
        <Field label="Hourly rate charged to client" hint="What you bill them per hour worked at this site.">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 ink-muted text-sm">{ctx.cur}</span>
            <input
              type="number"
              step="0.01"
              value={form.rate}
              onChange={e => setForm({ ...form, rate: e.target.value })}
              placeholder="18.00"
              className={`${inputCls} pl-7`}
              style={{ backgroundColor: '#FFFFFF' }}
            />
          </div>
        </Field>
        <Field label="Payment terms" hint="How many days after the shift this client typically pays.">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={form.paymentTermsDays}
              onChange={e => setForm({ ...form, paymentTermsDays: e.target.value })}
              className={`${inputCls} w-24`}
              style={{ backgroundColor: '#FFFFFF' }}
            />
            <span className="text-sm ink-muted">days</span>
          </div>
        </Field>
        <Field label="Site contact (optional)">
          <input
            type="text"
            value={form.contact}
            onChange={e => setForm({ ...form, contact: e.target.value })}
            placeholder="Site manager phone, etc."
            className={inputCls}
            style={{ backgroundColor: '#FFFFFF' }}
          />
        </Field>
        <Field label="Notes (optional)">
          <textarea
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className={inputCls}
            style={{ backgroundColor: '#FFFFFF' }}
          />
        </Field>
      </div>
    </Modal>
  );
}

// ---------- Shift Modal ----------
function ShiftModal({ ctx, onClose, editId, prefillDate }) {
  const { data, upsertShift, deleteShift, fmtMoney, setModal } = ctx;
  const existing = editId ? data.shifts.find(s => s.id === editId) : null;

  const [form, setForm] = useState(
    existing || {
      date: prefillDate || todayISO(),
      workerId: null,
      siteId: data.sites[0]?.id || '',
      hours: '',
      workerRate: '',
      clientRate: data.sites[0]?.rate || '',
      workerPaid: false,
      clientPaid: false,
      workerPaidDate: null,
      clientPaidDate: null,
      notes: ''
    }
  );

  const onWorkerChange = (workerId) => {
    const w = workerId ? data.workers.find(x => x.id === workerId) : null;
    setForm(f => ({ ...f, workerId: workerId || null, workerRate: w?.rate != null ? w.rate : f.workerRate }));
  };
  const onSiteChange = (siteId) => {
    const s = data.sites.find(x => x.id === siteId);
    setForm(f => ({ ...f, siteId, clientRate: s?.rate ?? f.clientRate }));
  };

  const handleSave = () => {
    if (!form.siteId || !form.hours) {
      alert('Please fill in site and hours.');
      return;
    }
    upsertShift({
      ...form,
      id: editId,
      hours: Number(form.hours) || 0,
      workerRate: Number(form.workerRate) || 0,
      clientRate: Number(form.clientRate) || 0,
    });
    onClose();
  };

  const charge = (Number(form.hours) || 0) * (Number(form.clientRate) || 0);
  const pay = (Number(form.hours) || 0) * (Number(form.workerRate) || 0);
  const margin = charge - pay;

  // Inline prompts if no sites
  if (data.sites.length === 0) {
    return (
      <Modal title="Add a site first" onClose={onClose} onSave={() => { onClose(); setModal({ type: 'site' }); }} saveLabel="Add site">
        <p className="text-sm ink-muted">You need at least one site before logging shifts.</p>
      </Modal>
    );
  }

  // Show which template this shift came from (info only)
  const linkedTemplate = form.templateId ? data.shiftTemplates?.find(t => t.id === form.templateId) : null;
  const linkedTemplateSite = linkedTemplate ? data.sites.find(s => s.id === linkedTemplate.siteId) : null;
  const templateColor = linkedTemplate ? paletteAt(linkedTemplate.colorIndex || 0) : null;

  return (
    <Modal
      title={editId ? 'Edit shift' : 'Log shift'}
      onClose={onClose}
      onSave={handleSave}
      onDelete={editId ? () => { if (confirm('Delete this shift?')) { deleteShift(editId); onClose(); } } : null}
      wide
    >
      <div className="space-y-4">
        {/* Template badge */}
        {linkedTemplate && (
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium"
            style={{ backgroundColor: templateColor.bg, color: templateColor.text }}
          >
            <span>From template:</span>
            <span className="font-semibold">{linkedTemplate.label || linkedTemplateSite?.name}</span>
            <span className="opacity-60">{linkedTemplate.startTime} – {linkedTemplate.endTime}</span>
          </div>
        )}
        {/* Date — prominent with DatePicker */}
        <Field label="Date">
          <DatePicker value={form.date} onChange={d => setForm(f => ({ ...f, date: d }))} />
        </Field>

        <Field label="Hours worked">
          <input
            type="number"
            step="0.25"
            value={form.hours}
            onChange={e => setForm({ ...form, hours: e.target.value })}
            placeholder="8"
            className={inputCls}
            style={{ backgroundColor: '#FFFFFF' }}
            autoFocus={!editId}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Worker">
            <select
              value={form.workerId || ''}
              onChange={e => onWorkerChange(e.target.value || null)}
              className={inputCls}
              style={{ backgroundColor: '#FFFFFF' }}
            >
              <option value="">— Unassigned —</option>
              {data.workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          <Field label="Site">
            <select
              value={form.siteId}
              onChange={e => onSiteChange(e.target.value)}
              className={inputCls}
              style={{ backgroundColor: '#FFFFFF' }}
            >
              {data.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Worker rate (/hour)" hint="What you pay this worker">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 ink-muted text-sm">{ctx.cur}</span>
              <input
                type="number"
                step="0.01"
                value={form.workerRate}
                onChange={e => setForm({ ...form, workerRate: e.target.value })}
                className={`${inputCls} pl-7`}
                style={{ backgroundColor: '#FFFFFF' }}
              />
            </div>
          </Field>
          <Field label="Client rate (/hour)" hint="What the client pays you">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 ink-muted text-sm">{ctx.cur}</span>
              <input
                type="number"
                step="0.01"
                value={form.clientRate}
                onChange={e => setForm({ ...form, clientRate: e.target.value })}
                className={`${inputCls} pl-7`}
                style={{ backgroundColor: '#FFFFFF' }}
              />
            </div>
          </Field>
        </div>

        {/* Live calc */}
        <div className="surface-2 rounded-lg p-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-wider ink-muted">Worker pay</div>
            <div className="font-display text-lg tabular mt-0.5">{fmtMoney(pay)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider ink-muted">Client owes</div>
            <div className="font-display text-lg tabular mt-0.5">{fmtMoney(charge)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider ink-muted">Your margin</div>
            <div className="font-display text-lg tabular mt-0.5 ink">{fmtMoney(margin)}</div>
          </div>
        </div>

        <Field label="Notes (optional)">
          <textarea
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            rows={2}
            placeholder="Anything to remember about this shift"
            className={inputCls}
            style={{ backgroundColor: '#FFFFFF' }}
          />
        </Field>

        {editId && (
          <div className="pt-2 border-t card-border space-y-2">
            <div className="text-xs ink-muted font-medium">Payment status</div>
            <div className="flex gap-2 flex-wrap">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.workerPaid}
                  onChange={e => setForm({ ...form, workerPaid: e.target.checked, workerPaidDate: e.target.checked ? (form.workerPaidDate || todayISO()) : null })}
                />
                Worker paid
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.clientPaid}
                  onChange={e => setForm({ ...form, clientPaid: e.target.checked, clientPaidDate: e.target.checked ? (form.clientPaidDate || todayISO()) : null })}
                />
                Client paid
              </label>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function SettingsModal({ ctx, onClose }) {
  return null; // Settings live in Setup view
}

// ---------- Bulk Shift Modal ----------
function BulkShiftModal({ ctx, onClose }) {
  const { data, fmtMoney, upsertShift, setModal } = ctx;
  const [workerId, setWorkerId] = useState(data.workers[0]?.id || '');
  const [siteId, setSiteId] = useState(data.sites[0]?.id || '');
  const [hours, setHours] = useState('8');
  const [workerRate, setWorkerRate] = useState(data.workers[0]?.rate || '');
  const [clientRate, setClientRate] = useState(data.sites[0]?.rate || '');
  const [notes, setNotes] = useState('');
  const [selectedDates, setSelectedDates] = useState(new Set());

  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const onWorkerChange = (id) => {
    setWorkerId(id);
    const w = data.workers.find(x => x.id === id);
    if (w?.rate != null) setWorkerRate(w.rate);
  };
  const onSiteChange = (id) => {
    setSiteId(id);
    const s = data.sites.find(x => x.id === id);
    if (s?.rate != null) setClientRate(s.rate);
  };

  const toggleDate = (dateStr) => {
    setSelectedDates(prev => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  // Calendar grid: 6 weeks x 7 days
  const calendarCells = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth + 1, 0);
    const startWeekday = (firstDay.getDay() + 6) % 7; // Mon=0
    const cells = [];
    // Leading blanks
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    // Days
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateObj = new Date(calYear, calMonth, d);
      const iso = dateObj.toISOString().slice(0, 10);
      cells.push({ day: d, iso, weekday: dateObj.getDay() });
    }
    // Trailing blanks
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calYear, calMonth]);

  const monthName = new Date(calYear, calMonth, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const handleSelectAllWeekdays = () => {
    const next = new Set(selectedDates);
    for (const c of calendarCells) {
      if (c && c.weekday >= 1 && c.weekday <= 5) next.add(c.iso);
    }
    setSelectedDates(next);
  };
  const handleSelectAllWeekends = () => {
    const next = new Set(selectedDates);
    for (const c of calendarCells) {
      if (c && (c.weekday === 0 || c.weekday === 6)) next.add(c.iso);
    }
    setSelectedDates(next);
  };
  const handleClearMonth = () => {
    const next = new Set(selectedDates);
    for (const c of calendarCells) {
      if (c) next.delete(c.iso);
    }
    setSelectedDates(next);
  };

  const handleSave = () => {
    if (!workerId || !siteId) { alert('Pick a worker and site.'); return; }
    if (!hours || Number(hours) <= 0) { alert('Set the hours per shift.'); return; }
    if (selectedDates.size === 0) { alert('Select at least one date by tapping days on the calendar.'); return; }
    const dates = [...selectedDates];
    for (const date of dates) {
      upsertShift({
        date,
        workerId,
        siteId,
        hours: Number(hours),
        workerRate: Number(workerRate) || 0,
        clientRate: Number(clientRate) || 0,
        workerPaid: false,
        clientPaid: false,
        workerPaidDate: null,
        clientPaidDate: null,
        notes
      });
    }
    onClose();
  };

  const totalAmount = (Number(hours) || 0) * (Number(clientRate) || 0) * selectedDates.size;
  const totalPay = (Number(hours) || 0) * (Number(workerRate) || 0) * selectedDates.size;

  if (data.workers.length === 0) {
    return (
      <Modal title="Add a worker first" onClose={onClose} onSave={() => { onClose(); setModal({ type: 'worker' }); }} saveLabel="Add worker">
        <p className="text-sm ink-muted">You need at least one worker before logging shifts.</p>
      </Modal>
    );
  }
  if (data.sites.length === 0) {
    return (
      <Modal title="Add a site first" onClose={onClose} onSave={() => { onClose(); setModal({ type: 'site' }); }} saveLabel="Add site">
        <p className="text-sm ink-muted">You need at least one site before logging shifts.</p>
      </Modal>
    );
  }

  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <Modal title="Log multiple shifts" onClose={onClose} onSave={handleSave} saveLabel={`Log ${selectedDates.size} shift${selectedDates.size === 1 ? '' : 's'}`} wide>
      <div className="space-y-5">
        {/* Common details */}
        <div>
          <div className="text-xs ink-muted font-medium mb-3">These details apply to every shift you select.</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Worker">
              <select
                value={workerId}
                onChange={e => onWorkerChange(e.target.value)}
                className={inputCls}
                style={{ backgroundColor: '#FFFFFF' }}
              >
                {data.workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
            <Field label="Site">
              <select
                value={siteId}
                onChange={e => onSiteChange(e.target.value)}
                className={inputCls}
                style={{ backgroundColor: '#FFFFFF' }}
              >
                {data.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Hours per shift">
              <input
                type="number"
                step="0.25"
                value={hours}
                onChange={e => setHours(e.target.value)}
                className={inputCls}
                style={{ backgroundColor: '#FFFFFF' }}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Worker rate">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 ink-muted text-sm">{ctx.cur}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={workerRate}
                    onChange={e => setWorkerRate(e.target.value)}
                    className={`${inputCls} pl-7`}
                    style={{ backgroundColor: '#FFFFFF' }}
                  />
                </div>
              </Field>
              <Field label="Client rate">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 ink-muted text-sm">{ctx.cur}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={clientRate}
                    onChange={e => setClientRate(e.target.value)}
                    className={`${inputCls} pl-7`}
                    style={{ backgroundColor: '#FFFFFF' }}
                  />
                </div>
              </Field>
            </div>
          </div>
        </div>

        {/* Calendar picker */}
        <div>
          <div className="text-xs ink-muted font-medium mb-3">Tap each day this person worked.</div>

          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => {
                if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
                else setCalMonth(m => m - 1);
              }}
              className="p-1.5 rounded-md hover:bg-stone-100"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="font-medium">{monthName}</div>
            <button
              type="button"
              onClick={() => {
                if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
                else setCalMonth(m => m + 1);
              }}
              className="p-1.5 rounded-md hover:bg-stone-100"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Quick-pick buttons */}
          <div className="flex gap-1 mb-3 flex-wrap">
            <button type="button" onClick={handleSelectAllWeekdays} className="text-[11px] px-2.5 py-1 rounded card-border ink-muted hover:ink">+ All weekdays</button>
            <button type="button" onClick={handleSelectAllWeekends} className="text-[11px] px-2.5 py-1 rounded card-border ink-muted hover:ink">+ All weekends</button>
            <button type="button" onClick={handleClearMonth} className="text-[11px] px-2.5 py-1 rounded card-border ink-muted hover:ink">Clear month</button>
          </div>

          {/* Calendar grid */}
          <div className="card-border surface rounded-lg p-2">
            <div className="grid grid-cols-7 gap-1 mb-1">
              {weekdayLabels.map(l => (
                <div key={l} className="text-[10px] uppercase tracking-wider ink-soft text-center py-1">{l}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((c, i) => {
                if (!c) return <div key={i} className="calendar-day"></div>;
                const isSelected = selectedDates.has(c.iso);
                const isToday = c.iso === todayISO();
                const isWeekend = c.weekday === 0 || c.weekday === 6;
                return (
                  <button
                    key={c.iso}
                    type="button"
                    onClick={() => toggleDate(c.iso)}
                    className={`calendar-day text-sm rounded-md transition-colors flex items-center justify-center font-medium ${
                      isSelected
                        ? 'accent-bg text-white'
                        : isToday
                          ? 'card-border ink ring-1 ring-stone-300'
                          : isWeekend
                            ? 'ink-muted hover:bg-stone-100'
                            : 'ink hover:bg-stone-100'
                    }`}
                  >
                    {c.day}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live total */}
        <div className="surface-2 rounded-lg p-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-wider ink-muted">Shifts</div>
            <div className="font-display text-lg tabular mt-0.5">{selectedDates.size}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider ink-muted">Total pay out</div>
            <div className="font-display text-lg tabular mt-0.5">{fmtMoney(totalPay)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider ink-muted">Total income</div>
            <div className="font-display text-lg tabular mt-0.5">{fmtMoney(totalAmount)}</div>
          </div>
        </div>

        <Field label="Notes (optional, applied to all shifts)">
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Regular night shift cover"
            className={inputCls}
            style={{ backgroundColor: '#FFFFFF' }}
          />
        </Field>

        <div className="text-xs ink-muted">
          Tip: once logged, you can edit any individual shift from the Shifts list (hours, notes, etc.).
        </div>
      </div>
    </Modal>
  );
}

// ---------- Client Modal ----------
function ClientModal({ ctx, onClose, editId }) {
  const { data, upsertClient, deleteClient } = ctx;
  const existing = editId ? data.clients.find(c => c.id === editId) : null;
  const [form, setForm] = useState(existing || { name: '', contact: '', paymentTermsDays: 30, notes: '' });

  const handleSave = () => {
    if (!form.name?.trim()) return;
    upsertClient({
      ...form,
      id: editId,
      paymentTermsDays: Number(form.paymentTermsDays) || 0
    });
    onClose();
  };

  const linkedSites = editId ? data.sites.filter(s => s.clientId === editId) : [];

  return (
    <Modal
      title={editId ? 'Edit client' : 'Add client'}
      onClose={onClose}
      onSave={handleSave}
      onDelete={editId ? () => {
        if (linkedSites.length > 0 && !confirm(`${linkedSites.length} site(s) are linked to this client. They will be unlinked. Continue?`)) return;
        deleteClient(editId); onClose();
      } : null}
    >
      <div className="space-y-4">
        <Field label="Client name">
          <input
            autoFocus
            type="text"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Acme Security Ltd, BullRing Management"
            className={inputCls}
            style={{ backgroundColor: '#FFFFFF' }}
          />
        </Field>
        <Field label="Payment terms" hint="Default days they take to pay you. Sites can override this.">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={form.paymentTermsDays}
              onChange={e => setForm({ ...form, paymentTermsDays: e.target.value })}
              className={`${inputCls} w-24`}
              style={{ backgroundColor: '#FFFFFF' }}
            />
            <span className="text-sm ink-muted">days</span>
          </div>
        </Field>
        <Field label="Contact (optional)" hint="Email or phone of who pays the bills.">
          <input
            type="text"
            value={form.contact}
            onChange={e => setForm({ ...form, contact: e.target.value })}
            placeholder="accounts@acme.com or 0121 555 1234"
            className={inputCls}
            style={{ backgroundColor: '#FFFFFF' }}
          />
        </Field>
        <Field label="Notes (optional)">
          <textarea
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className={inputCls}
            style={{ backgroundColor: '#FFFFFF' }}
          />
        </Field>

        {editId && linkedSites.length > 0 && (
          <div className="text-xs ink-muted pt-2 border-t card-border">
            <div className="font-medium ink mb-1">{linkedSites.length} site{linkedSites.length === 1 ? '' : 's'} linked:</div>
            <div>{linkedSites.map(s => s.name).join(', ')}</div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------- Invoice / Payslip Builder Modal ----------
function InvoiceBuilderModal({ ctx, onClose, prefillClientId, prefillWorkerId, invoiceType = 'client' }) {
  const { data, fmtMoney, createInvoice } = ctx;
  const isClient = invoiceType === 'client';
  const isWorker = invoiceType === 'worker';

  // Default range: last 30 days through today
  const defaultFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);

  const [clientId, setClientId] = useState(prefillClientId || (isClient ? data.clients[0]?.id : '') || '');
  const [workerId, setWorkerId] = useState(prefillWorkerId || (isWorker ? data.workers[0]?.id : '') || '');
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(todayISO());
  const [excluded, setExcluded] = useState(new Set());
  const [notes, setNotes] = useState('');

  // Eligible shifts:
  // - For client invoices: shifts at any of this client's sites, in date range, not on another invoice
  // - For worker payslips: shifts by this worker, in date range, not on another payslip
  const eligibleShifts = useMemo(() => {
    if (isClient) {
      if (!clientId) return [];
      const siteIds = new Set(data.sites.filter(s => s.clientId === clientId).map(s => s.id));
      return data.shifts
        .filter(s => siteIds.has(s.siteId))
        .filter(s => s.date >= dateFrom && s.date <= dateTo)
        .filter(s => !s.invoiceId)
        .sort((a, b) => a.date.localeCompare(b.date));
    } else {
      if (!workerId) return [];
      return data.shifts
        .filter(s => s.workerId === workerId)
        .filter(s => s.date >= dateFrom && s.date <= dateTo)
        .filter(s => !s.payslipId)
        .sort((a, b) => a.date.localeCompare(b.date));
    }
  }, [isClient, clientId, workerId, dateFrom, dateTo, data.shifts, data.sites]);

  const includedShifts = eligibleShifts.filter(s => !excluded.has(s.id));
  const total = includedShifts.reduce((sum, s) => {
    const r = isClient ? s.clientRate : s.workerRate;
    return sum + (Number(s.hours) || 0) * (Number(r) || 0);
  }, 0);
  const totalHours = includedShifts.reduce((sum, s) => sum + (Number(s.hours) || 0), 0);

  const toggleExclude = (id) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    if (isClient && !clientId) { alert('Pick a client first.'); return; }
    if (isWorker && !workerId) { alert('Pick a worker first.'); return; }
    if (includedShifts.length === 0) { alert('No shifts selected.'); return; }
    createInvoice({
      type: invoiceType,
      clientId: isClient ? clientId : null,
      workerId: isWorker ? workerId : null,
      dateFrom,
      dateTo,
      shiftIds: includedShifts.map(s => s.id),
      notes
    });
    onClose();
  };

  // Empty-state guards
  if (isClient && data.clients.length === 0) {
    return (
      <Modal title="No clients yet" onClose={onClose} onSave={() => { onClose(); ctx.setModal({ type: 'client' }); }} saveLabel="Add client">
        <p className="text-sm ink-muted">You need at least one client before creating an invoice. Add one now?</p>
      </Modal>
    );
  }
  if (isWorker && data.workers.length === 0) {
    return (
      <Modal title="No workers yet" onClose={onClose} onSave={() => { onClose(); ctx.setModal({ type: 'worker' }); }} saveLabel="Add worker">
        <p className="text-sm ink-muted">You need at least one worker before creating a payslip. Add one now?</p>
      </Modal>
    );
  }

  return (
    <Modal
      title={isClient ? 'New invoice' : 'New worker payslip'}
      onClose={onClose}
      onSave={handleSave}
      saveLabel={isClient ? 'Create invoice' : 'Create payslip'}
      wide
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label={isClient ? 'Client' : 'Worker'}>
            {isClient ? (
              <select
                value={clientId}
                onChange={e => { setClientId(e.target.value); setExcluded(new Set()); }}
                className={inputCls}
                style={{ backgroundColor: '#FFFFFF' }}
              >
                {data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <select
                value={workerId}
                onChange={e => { setWorkerId(e.target.value); setExcluded(new Set()); }}
                className={inputCls}
                style={{ backgroundColor: '#FFFFFF' }}
              >
                {data.workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            )}
          </Field>
          <Field label="From date">
            <DatePicker value={dateFrom} onChange={setDateFrom} />
          </Field>
          <Field label="To date">
            <DatePicker value={dateTo} onChange={setDateTo} />
          </Field>
        </div>

        {/* Quick range buttons */}
        <div className="flex gap-1 flex-wrap">
          {[
            { label: 'This month', getRange: () => {
              const d = new Date();
              const from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
              return { from, to: todayISO() };
            }},
            { label: 'Last month', getRange: () => {
              const d = new Date();
              const from = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10);
              const to = new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10);
              return { from, to };
            }},
            { label: 'Last 7 days', getRange: () => {
              const d = new Date(); d.setDate(d.getDate() - 7);
              return { from: d.toISOString().slice(0, 10), to: todayISO() };
            }},
            { label: 'Last 30 days', getRange: () => {
              const d = new Date(); d.setDate(d.getDate() - 30);
              return { from: d.toISOString().slice(0, 10), to: todayISO() };
            }},
          ].map(q => (
            <button
              key={q.label}
              onClick={() => {
                const r = q.getRange();
                setDateFrom(r.from);
                setDateTo(r.to);
                setExcluded(new Set());
              }}
              className="text-[11px] px-2.5 py-1 rounded card-border ink-muted hover:ink"
            >
              {q.label}
            </button>
          ))}
        </div>

        {/* Shift selection */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-xs ink-muted font-medium">
              Shifts in range ({includedShifts.length} of {eligibleShifts.length} included)
            </div>
            {eligibleShifts.length > 0 && (
              <button
                onClick={() => {
                  if (excluded.size === 0) setExcluded(new Set(eligibleShifts.map(s => s.id)));
                  else setExcluded(new Set());
                }}
                className="text-xs ink-muted hover:ink"
              >
                {excluded.size === 0 ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          {eligibleShifts.length === 0 ? (
            <div className="card-border surface rounded-lg p-5 text-sm ink-muted">
              {isClient && clientId && data.sites.filter(s => s.clientId === clientId).length === 0 ? (
                <div>
                  <p className="font-medium ink mb-1">No sites linked to this client.</p>
                  <p>When you add or edit a site, pick this client from the dropdown. Shifts at those sites will then appear here.</p>
                </div>
              ) : (
                <div>
                  <p className="font-medium ink mb-1">No uninvoiced shifts in this range.</p>
                  <p>Try extending the date range, or check that shifts have been logged for {isClient ? 'this client\'s sites' : 'this worker'}.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="card-border surface rounded-lg divide-y" style={{ borderColor: '#E7E5E4' }}>
              {eligibleShifts.map(s => {
                const site = data.sites.find(x => x.id === s.siteId);
                const worker = data.workers.find(w => w.id === s.workerId);
                const r = isClient ? s.clientRate : s.workerRate;
                const amount = (Number(s.hours) || 0) * (Number(r) || 0);
                const included = !excluded.has(s.id);
                const paidFlag = isClient ? s.clientPaid : s.workerPaid;
                return (
                  <label
                    key={s.id}
                    className="flex items-center gap-3 p-3 cursor-pointer hover-row"
                    style={{ borderBottomColor: '#E7E5E4' }}
                  >
                    <input
                      type="checkbox"
                      checked={included}
                      onChange={() => toggleExclude(s.id)}
                      className="w-4 h-4 accent-black"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">
                        <span className="tabular font-medium">{fmtDate(s.date)}</span>
                        <span className="ink-muted"> · {site?.name}{isClient ? ` · ${worker?.name || ''}` : ''} · {s.hours}h</span>
                      </div>
                      {paidFlag && (
                        <div className="text-[11px] success mt-0.5">⚠ Already marked as paid — be careful</div>
                      )}
                      {!isClient && (Number(s.workerRate) || 0) === 0 && (
                        <div className="text-[11px] warning mt-0.5">⚠ Worker rate is £0 — edit shift to set rate</div>
                      )}
                    </div>
                    <div className="tabular text-sm font-medium shrink-0">{fmtMoney(amount)}</div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Total */}
        <div className="surface-2 rounded-lg p-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">{isClient ? 'Invoice total' : 'Payslip total'}</div>
            <div className="text-xs ink-muted">{totalHours} hours</div>
          </div>
          <span className="font-display text-2xl tabular">{fmtMoney(total)}</span>
        </div>

        <Field label="Notes (optional)" hint={isClient ? 'Anything to print at the bottom of the invoice (e.g. payment details).' : 'Anything to print on the payslip (e.g. payment method).'}>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className={inputCls}
            placeholder={isClient ? 'e.g. Payment to: HSBC, sort 40-00-00, acc 12345678' : 'e.g. Paid in cash, 15th of month'}
            style={{ backgroundColor: '#FFFFFF' }}
          />
        </Field>
      </div>
    </Modal>
  );
}

// ---------- Invoice / Payslip Detail Modal ----------
function InvoiceDetailModal({ ctx, onClose, invoiceId }) {
  const { data, fmtMoney, updateInvoice, markInvoicePaid, markInvoiceUnpaid, deleteInvoice, cur } = ctx;
  const inv = data.invoices.find(i => i.id === invoiceId);

  if (!inv) {
    return (
      <Modal title="Not found" onClose={onClose} onSave={onClose} saveLabel="Close">
        <p className="text-sm ink-muted">This may have been deleted.</p>
      </Modal>
    );
  }

  const type = inv.type || 'client';
  const isClient = type === 'client';
  const entity = isClient
    ? data.clients.find(c => c.id === inv.clientId)
    : data.workers.find(w => w.id === inv.workerId);
  const shifts = inv.shiftIds.map(sid => data.shifts.find(s => s.id === sid)).filter(Boolean);
  const total = shifts.reduce((sum, s) => {
    const r = isClient ? s.clientRate : s.workerRate;
    return sum + (Number(s.hours) || 0) * (Number(r) || 0);
  }, 0);
  const totalHours = shifts.reduce((sum, s) => sum + (Number(s.hours) || 0), 0);

  // Determine due date
  let dueDate = null;
  if (isClient && entity) {
    dueDate = addDays(inv.issueDate, entity.paymentTermsDays || 30);
  }

  const handleMarkSent = () => updateInvoice(inv.id, { status: 'sent', sentDate: todayISO() });
  const handleMarkPaid = () => markInvoicePaid(inv.id);
  const handleMarkUnpaid = () => markInvoiceUnpaid(inv.id);
  const handleDelete = () => {
    if (!confirm(`Delete ${inv.invoiceNumber}? Shifts will be unlinked but not deleted.`)) return;
    deleteInvoice(inv.id);
    onClose();
  };
  const handlePrint = () => {
    // Print uses the .print-only block at end of document — body * hidden via CSS
    window.print();
  };

  const statusBadge = isClient ? {
    draft: { cls: 'card-border ink-muted', label: 'Draft' },
    sent: { cls: 'warning-bg-soft warning', label: 'Awaiting payment' },
    paid: { cls: 'success-bg-soft success', label: 'Paid' }
  }[inv.status] : {
    draft: { cls: 'card-border ink-muted', label: 'Draft' },
    sent: { cls: 'warning-bg-soft warning', label: 'Issued' },
    paid: { cls: 'success-bg-soft success', label: 'Paid' }
  }[inv.status] || { cls: 'card-border ink-muted', label: inv.status };

  const docLabel = isClient ? 'Invoice' : 'Payslip';
  const billedToLabel = isClient ? 'Billed to' : 'Paid to';

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 no-print" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }} onClick={onClose}>
        <div
          className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-2xl max-h-[92vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
          style={{ backgroundColor: '#FFFFFF' }}
        >
          <div className="p-4 sm:p-5 border-b card-border">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h2 className="font-display text-xl tabular tracking-tight">{inv.invoiceNumber}</h2>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusBadge.cls}`}>{statusBadge.label}</span>
                  <span className="text-[10px] uppercase tracking-wider ink-muted">{docLabel}</span>
                </div>
                <div className="text-sm ink-muted mt-1">{entity?.name || 'Unknown'}</div>
              </div>
              <button onClick={onClose} className="p-1 rounded hover:bg-stone-100">
                <X size={18} className="ink-muted" />
              </button>
            </div>
            <div className="font-display text-3xl tabular mt-3">{fmtMoney(total)}</div>
            <div className="text-xs ink-muted mt-1">
              Issued {fmtDate(inv.issueDate)}
              {inv.status === 'sent' && dueDate && <> · Due {fmtDate(dueDate)}</>}
              {inv.status === 'paid' && inv.paidDate && <> · Paid {fmtDate(inv.paidDate)}</>}
            </div>
          </div>

          <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-4">
            <div>
              <div className="text-xs ink-muted font-medium mb-2">Period covered</div>
              <div className="text-sm">{fmtDate(inv.dateFrom)} → {fmtDate(inv.dateTo)}</div>
            </div>

            <div>
              <div className="text-xs ink-muted font-medium mb-2">Shifts ({shifts.length}, {totalHours} hours)</div>
              <div className="card-border surface rounded-lg divide-y" style={{ borderColor: '#E7E5E4' }}>
                {shifts.map(s => {
                  const site = data.sites.find(x => x.id === s.siteId);
                  const worker = data.workers.find(w => w.id === s.workerId);
                  const r = isClient ? s.clientRate : s.workerRate;
                  const amount = (Number(s.hours) || 0) * (Number(r) || 0);
                  return (
                    <div key={s.id} className="p-3 flex items-center justify-between gap-3" style={{ borderBottomColor: '#E7E5E4' }}>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm tabular font-medium">{fmtDate(s.date)}</div>
                        <div className="text-xs ink-muted truncate">
                          {site?.name}
                          {isClient && worker && <> · {worker.name}</>}
                          {' · '}{s.hours}h @ {fmtMoney(r)}/h
                        </div>
                      </div>
                      <div className="tabular text-sm shrink-0">{fmtMoney(amount)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {inv.notes && (
              <div>
                <div className="text-xs ink-muted font-medium mb-1">Notes</div>
                <div className="text-sm whitespace-pre-wrap surface-2 rounded-md p-3">{inv.notes}</div>
              </div>
            )}

            <div className="surface-2 rounded-md p-3 text-xs ink-muted">
              <span className="font-medium ink">Tip:</span> Tap "Print / PDF" then in the print dialog choose <span className="font-medium ink">"Save as PDF"</span> as the destination to get a PDF file you can email.
            </div>
          </div>

          <div className="p-4 sm:p-5 border-t card-border flex items-center justify-between gap-2 flex-wrap">
            <button onClick={handleDelete} className="text-sm danger hover:underline">Delete</button>
            <div className="flex gap-2 flex-wrap">
              <button onClick={handlePrint} className="text-sm px-3 py-2 rounded-md card-border ink-muted hover:ink inline-flex items-center gap-1.5">
                <Printer size={13} /> Print / PDF
              </button>
              {inv.status === 'draft' && (
                <>
                  <button onClick={handleMarkSent} className="text-sm px-3 py-2 rounded-md card-border ink hover:bg-stone-50 inline-flex items-center gap-1.5">
                    <Check size={13} /> Mark as {isClient ? 'sent' : 'issued'}
                  </button>
                  <button onClick={handleMarkPaid} className="text-sm px-4 py-2 rounded-md success-bg-soft success font-medium inline-flex items-center gap-1.5">
                    <Check size={13} /> Mark as paid
                  </button>
                </>
              )}
              {inv.status === 'sent' && (
                <button onClick={handleMarkPaid} className="text-sm px-4 py-2 rounded-md success-bg-soft success font-medium inline-flex items-center gap-1.5">
                  <Check size={13} /> Mark as paid
                </button>
              )}
              {inv.status === 'paid' && (
                <button onClick={handleMarkUnpaid} className="text-sm px-3 py-2 rounded-md card-border ink-muted hover:ink">
                  Undo paid
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Print-only view (hidden on screen, shown when printing) */}
      <div className="print-only">
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 32, margin: '0 0 4px 0', fontWeight: 600 }}>{docLabel} {inv.invoiceNumber}</h1>
          <div style={{ color: '#666', fontSize: 13 }}>
            Issued {fmtDate(inv.issueDate)}{dueDate && isClient ? ` · Due ${fmtDate(dueDate)}` : ''}
            {inv.status === 'paid' && inv.paidDate ? ` · Paid ${fmtDate(inv.paidDate)}` : ''}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
          <div>
            <div style={{ color: '#666', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{billedToLabel}</div>
            <div style={{ fontWeight: 500, marginTop: 4, fontSize: 16 }}>{entity?.name || ''}</div>
            {entity?.contact && <div style={{ color: '#666', fontSize: 13 }}>{entity.contact}</div>}
            {entity?.phone && <div style={{ color: '#666', fontSize: 13 }}>{entity.phone}</div>}
          </div>
          <div>
            <div style={{ color: '#666', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Period covered</div>
            <div style={{ fontWeight: 500, marginTop: 4, fontSize: 16 }}>{fmtDate(inv.dateFrom)} → {fmtDate(inv.dateTo)}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>{isClient ? 'Site' : 'Site'}</th>
              <th style={{ textAlign: 'right' }}>Hours</th>
              <th style={{ textAlign: 'right' }}>Rate</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map(s => {
              const site = data.sites.find(x => x.id === s.siteId);
              const r = isClient ? s.clientRate : s.workerRate;
              const amount = (Number(s.hours) || 0) * (Number(r) || 0);
              return (
                <tr key={s.id}>
                  <td>{fmtDate(s.date)}</td>
                  <td>{site?.name || ''}</td>
                  <td style={{ textAlign: 'right' }}>{s.hours}</td>
                  <td style={{ textAlign: 'right' }}>{cur}{(Number(r) || 0).toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }}>{cur}{amount.toFixed(2)}</td>
                </tr>
              );
            })}
            <tr>
              <td colSpan="2" style={{ fontWeight: 500, paddingTop: 14, borderBottom: 'none' }}>Total ({totalHours} hours)</td>
              <td colSpan="3" style={{ textAlign: 'right', fontWeight: 600, fontSize: 18, paddingTop: 14, borderBottom: 'none' }}>{cur}{total.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        {inv.notes && (
          <div style={{ marginTop: 30, paddingTop: 20, borderTop: '1px solid #e5e5e5', fontSize: 13 }}>
            <strong>Notes</strong>
            <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{inv.notes}</div>
          </div>
        )}
      </div>
    </>
  );
}

// ---------- Breakdown Modal (drill-down from stat cards) ----------
function BreakdownModal({ ctx, onClose, mode }) {
  const { data, fmtMoney, toggleShiftFlag, setModal } = ctx;
  const [tab, setTab] = useState(mode === 'overdue' || mode === 'float' ? 'main' : 'unpaid');

  // Configure per mode
  const config = useMemo(() => {
    if (mode === 'client-owed') {
      return {
        title: 'What clients owe you',
        flag: 'clientPaid',
        rate: 'clientRate',
        unpaidTabLabel: 'Outstanding',
        paidTabLabel: 'Settled',
        tabsEnabled: true,
        unpaidEmptyMsg: 'No outstanding client payments.',
        paidEmptyMsg: 'No payments received yet.',
      };
    }
    if (mode === 'worker-owed') {
      return {
        title: 'What you owe workers',
        flag: 'workerPaid',
        rate: 'workerRate',
        unpaidTabLabel: 'Owed',
        paidTabLabel: 'Paid out',
        tabsEnabled: true,
        unpaidEmptyMsg: 'No outstanding worker payments.',
        paidEmptyMsg: 'No workers paid yet.',
      };
    }
    if (mode === 'overdue') {
      return {
        title: 'Overdue from clients',
        flag: 'clientPaid',
        rate: 'clientRate',
        tabsEnabled: false,
      };
    }
    if (mode === 'float') {
      return { title: 'Your float', tabsEnabled: false };
    }
    return { title: 'Details', tabsEnabled: false };
  }, [mode]);

  // Get shifts for the selected mode + tab
  const shifts = useMemo(() => {
    if (mode === 'float') return [];

    let list = data.shifts;

    if (mode === 'overdue') {
      const today = todayISO();
      list = list.filter(s => {
        if (s.clientPaid) return false;
        const site = data.sites.find(x => x.id === s.siteId);
        const due = addDays(s.date, site?.paymentTermsDays || 0);
        return due < today;
      });
      // sort oldest first
      return list.sort((a, b) => a.date.localeCompare(b.date));
    }

    if (tab === 'unpaid') {
      list = list.filter(s => !s[config.flag]);
      return list.sort((a, b) => a.date.localeCompare(b.date)); // oldest first for outstanding
    } else {
      list = list.filter(s => s[config.flag]);
      return list.sort((a, b) => b.date.localeCompare(a.date)); // newest first for settled
    }
  }, [data, mode, tab, config]);

  // Compute totals
  const computeAmount = (s) => (Number(s.hours) || 0) * (Number(s[config.rate]) || 0);
  const total = shifts.reduce((sum, s) => sum + computeAmount(s), 0);

  // For float mode, compute breakdown numbers
  const floatData = useMemo(() => {
    if (mode !== 'float') return null;
    let paidOut = 0, paidOutCount = 0, receivedIn = 0, receivedInCount = 0;
    for (const s of data.shifts) {
      const workerPay = (Number(s.hours) || 0) * (Number(s.workerRate) || 0);
      const clientCharge = (Number(s.hours) || 0) * (Number(s.clientRate) || 0);
      if (s.workerPaid) { paidOut += workerPay; paidOutCount++; }
      if (s.clientPaid) { receivedIn += clientCharge; receivedInCount++; }
    }
    return { paidOut, paidOutCount, receivedIn, receivedInCount, float: paidOut - receivedIn };
  }, [data, mode]);

  // Group by client/worker for nicer display
  const grouped = useMemo(() => {
    if (mode === 'float') return null;
    const groupBy = (mode === 'worker-owed') ? 'workerId' : 'siteId';
    const map = new Map();
    for (const s of shifts) {
      const key = s[groupBy] || 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    const arr = [];
    for (const [key, list] of map.entries()) {
      const name = groupBy === 'workerId'
        ? (data.workers.find(w => w.id === key)?.name || 'Unknown worker')
        : (data.sites.find(s => s.id === key)?.name || 'Unknown site');
      const subtotal = list.reduce((sum, s) => sum + computeAmount(s), 0);
      arr.push({ key, name, list, subtotal });
    }
    return arr.sort((a, b) => b.subtotal - a.subtotal);
  }, [shifts, mode, data]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }} onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: '#FFFFFF' }}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b card-border">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-lg tracking-tight">{config.title}</h2>
              {mode !== 'float' && (
                <div className="font-display text-3xl tabular mt-2">{fmtMoney(total)}</div>
              )}
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-stone-100">
              <X size={18} className="ink-muted" />
            </button>
          </div>

          {/* Tabs */}
          {config.tabsEnabled && (
            <div className="flex gap-1 mt-4 -mb-2">
              <button
                onClick={() => setTab('unpaid')}
                className={`text-sm px-3 py-1.5 rounded-md ${tab === 'unpaid' ? 'accent-bg text-white' : 'ink-muted hover:ink'}`}
              >
                {config.unpaidTabLabel}
              </button>
              <button
                onClick={() => setTab('paid')}
                className={`text-sm px-3 py-1.5 rounded-md ${tab === 'paid' ? 'accent-bg text-white' : 'ink-muted hover:ink'}`}
              >
                {config.paidTabLabel}
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-5">
          {mode === 'float' && floatData && (
            <FloatBreakdown ctx={ctx} data={floatData} />
          )}

          {mode !== 'float' && shifts.length === 0 && (
            <div className="text-center py-12">
              <CheckCircle2 size={32} className="mx-auto ink-soft mb-3" strokeWidth={1.5} />
              <p className="text-sm ink-muted">
                {tab === 'unpaid' ? (config.unpaidEmptyMsg || 'Nothing here.') : (config.paidEmptyMsg || 'Nothing here.')}
              </p>
            </div>
          )}

          {mode !== 'float' && grouped && grouped.length > 0 && (
            <div className="space-y-5">
              {grouped.map(g => (
                <BreakdownGroup
                  key={g.key}
                  group={g}
                  ctx={ctx}
                  mode={mode}
                  tab={tab}
                  config={config}
                  computeAmount={computeAmount}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t card-border flex items-center justify-end">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-md card-border ink-muted hover:ink">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function BreakdownGroup({ group, ctx, mode, tab, config, computeAmount }) {
  const { fmtMoney, toggleShiftFlag, setModal, data } = ctx;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2 pb-2 border-b card-border">
        <div className="font-medium text-sm">{group.name}</div>
        <div className="tabular text-sm">
          <span className="ink-muted text-xs">{group.list.length} shift{group.list.length === 1 ? '' : 's'} · </span>
          <span className="font-medium">{fmtMoney(group.subtotal)}</span>
        </div>
      </div>
      <div className="space-y-1">
        {group.list.map(s => {
          const site = data.sites.find(x => x.id === s.siteId);
          const worker = data.workers.find(w => w.id === s.workerId);
          const amount = computeAmount(s);
          const due = site ? addDays(s.date, site.paymentTermsDays || 0) : null;
          const isOverdue = mode !== 'worker-owed' && tab === 'unpaid' && due && due < todayISO();
          const isPaidView = tab === 'paid';
          const paidDate = mode === 'worker-owed' ? s.workerPaidDate : s.clientPaidDate;

          return (
            <div key={s.id} className="hover-row rounded-md px-2 py-2 flex items-center justify-between gap-3">
              <button
                onClick={() => setModal({ type: 'shift', id: s.id })}
                className="flex-1 min-w-0 text-left"
              >
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm tabular font-medium">{fmtDate(s.date)}</span>
                  <span className="text-xs ink-muted">·</span>
                  <span className="text-xs ink-muted">{s.hours}h</span>
                  {mode === 'worker-owed' && (
                    <>
                      <span className="text-xs ink-muted">·</span>
                      <span className="text-xs ink-muted truncate">{site?.name}</span>
                    </>
                  )}
                  {mode !== 'worker-owed' && worker && (
                    <>
                      <span className="text-xs ink-muted">·</span>
                      <span className="text-xs ink-muted truncate">{worker.name}</span>
                    </>
                  )}
                </div>
                <div className="text-[11px] mt-0.5">
                  {isPaidView ? (
                    <span className="success">Paid {paidDate ? fmtDateShort(paidDate) : ''}</span>
                  ) : isOverdue ? (
                    <span className="danger">Overdue · was due {fmtDateShort(due)}</span>
                  ) : mode === 'worker-owed' ? (
                    <span className="warning">Awaiting payout</span>
                  ) : due ? (
                    <span className="ink-muted">Due {fmtDateShort(due)}</span>
                  ) : null}
                </div>
              </button>
              <div className="text-right shrink-0 flex items-center gap-3">
                <div className="tabular text-sm font-medium">{fmtMoney(amount)}</div>
                {!isPaidView ? (
                  <button
                    onClick={() => toggleShiftFlag(s.id, config.flag)}
                    className="text-[11px] px-2.5 py-1.5 rounded-md success-bg-soft success hover:opacity-80 font-medium whitespace-nowrap"
                  >
                    Mark paid
                  </button>
                ) : (
                  <button
                    onClick={() => toggleShiftFlag(s.id, config.flag)}
                    className="text-[11px] px-2.5 py-1.5 rounded-md card-border ink-muted hover:ink whitespace-nowrap"
                  >
                    Undo
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FloatBreakdown({ ctx, data }) {
  const { fmtMoney, setModal } = ctx;
  const isPositive = data.float > 0;

  return (
    <div className="space-y-5">
      <div className="text-sm ink-muted leading-relaxed">
        Your <span className="ink font-medium">float</span> is the gap between what you've paid out of your own pocket and what clients have actually paid you. {isPositive ? "You're currently fronting money — chase your overdues to bring this down." : "You're ahead. Nice."}
      </div>

      <div className="space-y-3">
        <div className="card-border surface rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpRight size={14} className="ink-muted" />
              <span className="text-sm">Paid out to workers</span>
            </div>
            <span className="tabular font-medium">{fmtMoney(data.paidOut)}</span>
          </div>
          <div className="text-[11px] ink-soft mt-1 pl-6">{data.paidOutCount} shift{data.paidOutCount === 1 ? '' : 's'} settled</div>
        </div>

        <div className="card-border surface rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowDownLeft size={14} className="ink-muted" />
              <span className="text-sm">Received from clients</span>
            </div>
            <span className="tabular font-medium">{fmtMoney(data.receivedIn)}</span>
          </div>
          <div className="text-[11px] ink-soft mt-1 pl-6">{data.receivedInCount} shift{data.receivedInCount === 1 ? '' : 's'} settled</div>
        </div>

        <div className={`rounded-lg p-4 ${isPositive ? 'danger-bg-soft' : 'success-bg-soft'}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{isPositive ? "Your float (out of pocket)" : "Your float (ahead)"}</span>
            <span className={`tabular text-xl font-display ${isPositive ? 'danger' : 'success'}`}>{fmtMoney(Math.abs(data.float))}</span>
          </div>
        </div>
      </div>

      {isPositive && (
        <button
          onClick={() => setModal({ type: 'breakdown', mode: 'client-owed' })}
          className="text-sm accent hover:underline"
        >
          → See who owes you and chase them
        </button>
      )}
    </div>
  );
}

// ---------- Auth Screen (Supabase login / signup) ----------
function AuthScreen() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'error'|'success', text }

  const handle = async () => {
    if (!email.trim()) { setMessage({ type: 'error', text: 'Enter your email.' }); return; }
    if (mode !== 'reset' && !password) { setMessage({ type: 'error', text: 'Enter a password.' }); return; }
    setLoading(true);
    setMessage(null);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMessage({ type: 'error', text: error.message });
      } else if (mode === 'signup') {
        if (password.length < 6) { setMessage({ type: 'error', text: 'Password must be at least 6 characters.' }); setLoading(false); return; }
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) setMessage({ type: 'error', text: error.message });
        else setMessage({ type: 'success', text: 'Account created! Check your email to confirm, then sign in.' });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) setMessage({ type: 'error', text: error.message });
        else setMessage({ type: 'success', text: 'Password reset email sent. Check your inbox.' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Something went wrong. Try again.' });
    }
    setLoading(false);
  };

  const handleKey = (e) => { if (e.key === 'Enter') handle(); };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5" style={{ backgroundColor: '#FAFAFA' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap');
        body { font-family: 'Geist', system-ui, sans-serif; }
        .font-display { font-family: 'Geist', sans-serif; font-weight: 600; letter-spacing: -0.025em; }
        .card-border { border: 1px solid #E7E5E4; }
      `}</style>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-10 justify-center">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#0A0A0A' }}>
            <div className="w-4 h-4 rounded bg-white opacity-90"></div>
          </div>
          <div className="font-display text-2xl">Ledger</div>
        </div>

        {/* Card */}
        <div className="bg-white card-border rounded-2xl p-6" style={{ boxShadow: '0 4px 24px -8px rgba(0,0,0,0.1)' }}>
          <h1 className="font-display text-xl mb-5">
            {mode === 'login' ? 'Sign in to your account' : mode === 'signup' ? 'Create your account' : 'Reset password'}
          </h1>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-stone-500 font-medium block mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={handleKey}
                placeholder="you@example.com"
                autoFocus
                className="w-full px-3 py-2.5 text-sm card-border rounded-lg outline-none focus:border-stone-600"
                style={{ backgroundColor: '#FAFAFA' }}
              />
            </div>

            {mode !== 'reset' && (
              <div>
                <label className="text-xs text-stone-500 font-medium block mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                  className="w-full px-3 py-2.5 text-sm card-border rounded-lg outline-none focus:border-stone-600"
                  style={{ backgroundColor: '#FAFAFA' }}
                />
              </div>
            )}

            {message && (
              <div className={`text-sm px-3 py-2 rounded-lg ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {message.text}
              </div>
            )}

            <button
              onClick={handle}
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-opacity"
              style={{ backgroundColor: '#0A0A0A', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset email'}
            </button>
          </div>
        </div>

        {/* Footer links */}
        <div className="flex items-center justify-center gap-4 mt-5 text-sm text-stone-500">
          {mode === 'login' && (
            <>
              <button onClick={() => { setMode('signup'); setMessage(null); }} className="hover:text-stone-800">Create account</button>
              <span>·</span>
              <button onClick={() => { setMode('reset'); setMessage(null); }} className="hover:text-stone-800">Forgot password?</button>
            </>
          )}
          {mode === 'signup' && (
            <button onClick={() => { setMode('login'); setMessage(null); }} className="hover:text-stone-800">Already have an account? Sign in</button>
          )}
          {mode === 'reset' && (
            <button onClick={() => { setMode('login'); setMessage(null); }} className="hover:text-stone-800">Back to sign in</button>
          )}
        </div>

        <p className="text-center text-xs text-stone-400 mt-8">Your data is encrypted and only accessible to you.</p>
      </div>
    </div>
  );
}
