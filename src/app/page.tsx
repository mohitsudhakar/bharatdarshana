/// <reference types="next" />
/// <reference types="next/image-types/global" />

'use client';

import type { NextPage } from 'next';
import { useState, FormEvent, useEffect, useCallback } from 'react';

// ---------- Types ----------
interface Submission {
  id: string;
  invoice_number: string | null;
  bd_membership_no: string | null;
  date: string | null;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  payment_mode: string | null;
  selected_books: any[];
  search_vector: string | null;
  created_at: string;
}

// ----------Constants (matching invoice items) ----------
const BOOK_ITEMS = [
  { label: 'Mahabharata (32 vols)', volumes: 32 },
  { label: 'Srimad Valmiki Ramayana (11 vols)', volumes: 11 },
  { label: 'Srimad Bhagavatam (9 vols)', volumes: 9 },
  { label: 'Harivamsa (6 vols)', volumes: 6 },
  { label: 'Markandeya Purana (4 vols)', volumes: 4 },
  { label: 'Vishnu Purana (2 vols)', volumes: 2 },
  { label: 'Bharatha Darshana Monthly Magazine (Annual) — Special Subscription', volumes: 1 },
  { label: 'Special Volumes', volumes: 1 },
];

// ---------- Search function (server action style, using fetch to self) ----------
async function searchSubmissions(query: string): Promise<Submission[]> {
  // Fetch all records and filter client-side (PostgREST search doesn't work reliably on non-indexed columns)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  
  const res = await fetch(`${url}/rest/v1/invoice_submissions?select=*&order=created_at.desc&limit=1000`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Prefer': 'return=representation',
    },
  });
  if (!res.ok) return [];
  const all: Submission[] = await res.json();
  
  if (!query.trim()) return all;
  const q = query.toLowerCase();
  return all.filter(r =>
    (r.customer_name || '').toLowerCase().includes(q) ||
    (r.phone || '').toLowerCase().includes(q) ||
    (r.search_vector || '').toLowerCase().includes(q) ||
    (r.invoice_number || '').toLowerCase().includes(q) ||
    (r.date || '').toLowerCase().includes(q) ||
    (JSON.stringify(r.selected_books) || '').toLowerCase().includes(q)
  );
}

async function getSubmissions(): Promise<Submission[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  
  const res = await fetch(`${url}/rest/v1/invoice_submissions?select=*&order=created_at.desc&limit=50`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Prefer': 'return=representation',
    },
  });
  if (!res.ok) return [];
  return res.json();
}

async function submitForm(data: SubmitPayload): Promise<{ success: boolean; error?: string; id?: string | null }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { success: false, error: 'Missing Supabase config' };
  
  const res = await fetch(`${url}/rest/v1/invoice_submissions`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  });
  
  if (res.ok) {
    const body = await res.json().catch(() => null);
    return { success: true, id: body?.[0]?.id ?? null };
  }
  const err = await res.text().catch(() => 'Unknown error');
  return { success: false, error: err };
}

interface SubmitPayload {
  invoice_number?: string;
  bd_membership_no?: string;
  date?: string;
  customer_name: string;
  phone?: string;
  address?: string;
  payment_mode?: string;
  selected_books: { book: string; volumes: number[]; cost?: number }[];
}

// ---------- Toast system ----------
interface Toast {
  id: number;
  message: string;
}

const App: NextPage = () => {
  const [activeTab, setActiveTab] = useState<'form' | 'search' | 'records' | 'analytics'>('form');
  const [invoiceCounter, setInvoiceCounter] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.cookie.includes('bd_auth=1');
    }
    return false;
  });
  const [showLogin, setShowLogin] = useState(() => {
    if (typeof document !== 'undefined') {
      return !document.cookie.includes('bd_auth=1');
    }
    return true;
  });
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  
  // Form state
  const [form, setForm] = useState({
    invoiceNumber: '',
    bdMembershipNo: '',
    date: new Date().toISOString().split('T')[0],
    customerName: '',
    phone: '',
    address: '',
    paymentMode: 'UPI' as 'UPI' | 'NEFT' | 'CASH' | 'Cheque' | 'DD' | 'M.O',
  });
  const [selectedItems, setSelectedItems] = useState<Record<string, number[]>>({});
  const [formCosts, setFormCosts] = useState<Record<string, string>>({});
  const [setCounts, setSetCounts] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastSubmittedId, setLastSubmittedId] = useState<string | null>(null);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Submission[]>([]);
  const [allRecords, setAllRecords] = useState<Submission[]>([]);

  // Analytics state
  const [period, setPeriod] = useState<'last_week' | 'last_month' | 'last_3m' | 'all'>('last_week');

  function getMonthKey(ts: string): string { return ts.slice(0, 7); }
  function formatMonth(key: string): string {
    const [y, m] = key.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
  }

  const filtered = (() => {
    if (allRecords.length === 0) return [];
    const now = new Date();
    let cutoff: Date;
    if (period === 'last_week') cutoff = new Date(Date.now() - 7 * 86400000);
    else if (period === 'last_month') cutoff = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    else if (period === 'last_3m') cutoff = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    else cutoff = new Date(0);
    return allRecords.filter(r => new Date(r.created_at) >= cutoff);
  })();

  const aggregated = (() => {
    const acc: Record<string, { book: string; volCount: number; sets: number; buyers: Set<string>; revenue: number; setsByMonth: Record<string, number> }> = {};
    filtered.forEach(r => {
      if (!r.selected_books?.length) return;
      (r.selected_books as any[]).forEach(b => {
        if (!b.book) return;
        const vc = b.volumes?.length || 1;
        const key = `${b.book}|${vc}`;
        if (!acc[key]) acc[key] = { book: b.book, volCount: vc, sets: 0, buyers: new Set(), revenue: 0, setsByMonth: {} };
        acc[key].sets += 1;
        acc[key].buyers.add(r.id);
        acc[key].revenue += (b.cost || 200) * vc;
        acc[key].setsByMonth[getMonthKey(r.created_at)] = (acc[key].setsByMonth[getMonthKey(r.created_at)] || 0) + 1;
      });
    });
    return Object.values(acc).map(e => ({ ...e, buyers: e.buyers.size })).sort((a, b) => b.sets - a.sets);
  })();

  const totalRevenue = filtered.reduce((s, r) => {
    return s + ((r.selected_books as any[] || []).reduce(
      (sub, b) => sub + ((b.cost || 200) * (b.volumes?.length || 1)), 0
    ));
  }, 0);

  // Toast helper
  const addToast = useCallback((message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  // Load invoice counter on mount
  useEffect(() => {
    (async () => {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key) return;
        const res = await fetch(`${url}/rest/v1/invoice_submissions?select=invoice_number&order=created_at.desc&limit=1`, {
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Prefer': 'return=representation',
          },
        });
        if (!res.ok) return;
        const rows: any[] = await res.json();
        const last = rows[0]?.invoice_number;
        setInvoiceCounter(last ? parseInt(last.replace('BD-', '')) || 0 : 0);
      } catch { /* ignore */ }
    })();
  }, []);

  // Re-read auth cookie after hydration
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const authed = document.cookie.includes('bd_auth=1');
      setIsLoggedIn(authed);
      setShowLogin(!authed);
    }
  }, []);

  // Volume selection
  const toggleVolume = (bookLabel: string, volNum: number) => {
    setSelectedItems(prev => {
      const current = prev[bookLabel] || [];
      const exists = current.includes(volNum);
      const newVols = exists ? current.filter(v => v !== volNum) : [...current, volNum].sort((a, b) => a - b);
      if (newVols.length === 0) {
        const copy = { ...prev };
        delete copy[bookLabel];
        return copy;
      }
      return { ...prev, [bookLabel]: newVols };
    });
  };

  const selectAll = (bookLabel: string, total: number) => {
    setSelectedItems(prev => {
      const current = prev[bookLabel] || [];
      const allSelected = current.length === total;
      if (allSelected) {
        const copy = { ...prev };
        delete copy[bookLabel];
        return copy;
      }
      return { ...prev, [bookLabel]: Array.from({ length: total }, (_, i) => i + 1) };
    });
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      // Show all if no query
      const all = await getSubmissions();
      setAllRecords(all);
      setSearchResults(all);
      return;
    }
    const results = await searchSubmissions(searchQuery);
    setSearchResults(results);
  };

  const handleLoadAll = async () => {
    if (!isLoggedIn) return;
    const all = await getSubmissions();
    setAllRecords(all);
  };

  const handleLogin = () => {
    if (loginForm.username === 'yoga' && loginForm.password === 'yoga123bd') {
      setIsLoggedIn(true);
      setShowLogin(false);
      setLoginError('');
      document.cookie = 'bd_auth=1; path=/; max-age=86400';
      addToast('✓ Signed in');
    } else {
      setLoginError('Invalid username or password');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    if (!isLoggedIn) return;
    e.preventDefault();
    setSubmitting(true);
    
    // Expand sets: if user wants 2 sets of Mahabharata, duplicate the entry
    const books = Object.entries(selectedItems).flatMap(([book, volumes]) => {
      const count = setCounts[book] || 1;
      const cost = formCosts[book] ? parseFloat(formCosts[book]) : undefined;
      return Array.from({ length: count }, () => ({ book, volumes, cost }));
    });
    
    const payload: SubmitPayload = {
      invoice_number: `BD-${invoiceCounter + 1}`,
      bd_membership_no: form.bdMembershipNo || undefined,
      date: form.date || undefined,
      customer_name: form.customerName,
      phone: form.phone || undefined,
      address: form.address || undefined,
      payment_mode: form.paymentMode,
      selected_books: books,
    };
    
    const result = await submitForm(payload);
    if (result.success) {
      addToast('✓ Order saved successfully');
      setForm({ ...form, customerName: '', phone: '', address: '', invoiceNumber: '', bdMembershipNo: '' });
      setSelectedItems({});
      setFormCosts({});
      setSetCounts({});
      setInvoiceCounter(prev => prev + 1);
      setLastSubmittedId(result.id ?? null);
    } else {
      addToast(`✗ Error: ${result.error}`);
    }
    setSubmitting(false);
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', fontFamily: '-apple-system, sans-serif', padding: '20px 16px', position: 'relative' }}>
      {/* Toast container */}
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.message.includes('✗') ? '#e74c3c' : '#27ae60',
            color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', animation: 'fadeIn 0.2s ease',
          }}>
            {t.message}
          </div>
        ))}
      </div>

      {/* Login Modal */}
      {showLogin && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', padding: 32, borderRadius: 12, width: 320,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ margin: '0 0 20px', color: '#5c3d2e', fontSize: 20, textAlign: 'center' }}>
              Bharatha Darshana
            </h2>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Username</label>
              <input
                type="text"
                value={loginForm.username}
                onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
                placeholder="Enter username"
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                style={loginInputStyle}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                placeholder="Enter password"
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                style={loginInputStyle}
              />
            </div>
            {loginError && <p style={{ color: '#e74c3c', fontSize: 13, textAlign: 'center', margin: '0 0 12px' }}>{loginError}</p>}
            <button
              onClick={handleLogin}
              style={{
                width: '100%', padding: 10, border: 'none', borderRadius: 6,
                background: '#5c3d2e', color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Sign In
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 24, borderBottom: '2px solid #d4a574', paddingBottom: 16 }}>
        <h1 style={{ fontSize: 26, margin: 0, color: '#5c3d2e' }}>Bharatha Darshana</h1>
        <p style={{ margin: '4px 0 0', color: '#7a6555', fontSize: 14 }}>Order Form &amp; Search</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {(['form', 'search', 'records', 'analytics'] as const).map(key => (
          <button
            key={key}
            onClick={() => { setActiveTab(key); if (key !== 'form') handleLoadAll(); }}
            style={{
              flex: 1, padding: '10px 8px', border: 'none', borderRadius: 6,
              cursor: 'pointer', fontWeight: 600, fontSize: 13,
              background: activeTab === key ? '#d4a574' : '#f0e6d8',
              color: activeTab === key ? '#fff' : '#5c3d2e',
            }}
          >
            {key === 'form' ? '📝 Order Form' : key === 'search' ? '🔍 AI Search' : key === 'records' ? '📋 All Records' : '📊 Analytics'}
          </button>
        ))}
      </div>

      {/* ─── FORM TAB ─── */}
      {activeTab === 'form' && (
        <form onSubmit={handleSubmit} style={{ background: '#faf6f1', padding: 20, borderRadius: 10, border: '1px solid #e0d5c5' }}>
          {/* Meta fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <Input label="BD Membership No. (Optional)" value={form.bdMembershipNo} onChange={v => setForm({ ...form, bdMembershipNo: v })} placeholder="Membership" />
            <Input label="Date" type="date" value={form.date} onChange={v => setForm({ ...form, date: v })} />
            <Input label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} placeholder="+91..." />
          </div>

          {/* Customer name */}
          <Input
            label="Srimati / Sri (Customer Name)" style={{ width: '100%', marginBottom: 16 }}
            value={form.customerName} onChange={v => setForm({ ...form, customerName: v })}
            placeholder="Enter customer name" required
          />

          {/* Address */}
          <div style={{ width: '100%', marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#7a6555', display: 'block', marginBottom: 4 }}>Address</label>
            <textarea
              value={form.address}
              onChange={e => setForm({ ...form, address: e.target.value })}
              placeholder="Enter customer address"
              rows={2}
              style={{
                width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6,
                fontSize: 14, boxSizing: 'border-box', background: '#fff', resize: 'vertical', fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Payment mode */}
          <div style={{ width: '100%', marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#7a6555', display: 'block', marginBottom: 4 }}>Payment Mode</label>
            <select
              value={form.paymentMode}
              onChange={e => setForm({ ...form, paymentMode: e.target.value as typeof form.paymentMode })}
              style={{
                width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6,
                fontSize: 14, boxSizing: 'border-box', background: '#fff', cursor: 'pointer',
              }}
            >
              {['UPI', 'NEFT', 'CASH', 'Cheque', 'DD', 'M.O'].map(mode => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
          </div>

          {/* Book items */}
          <h3 style={{ margin: '0 0 8px', color: '#5c3d2e', fontSize: 16 }}>Select Volumes</h3>
          {BOOK_ITEMS.map((item, idx) => (
            <div key={idx} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <p style={{ margin: 0, fontWeight: 600, color: '#3e3530', fontSize: 14 }}>{item.label}</p>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number"
                      placeholder="₹ Cost"
                      min="0"
                      style={{ width: 90, padding: '5px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13, textAlign: 'right' }}
                      value={formCosts[item.label] || 200}
                      onChange={e => setFormCosts({ ...formCosts, [item.label]: e.target.value })}
                    />
                    <span style={{ fontSize: 11, color: '#999', whiteSpace: 'nowrap' }}>₹/vol</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <label style={{ fontSize: 11, color: '#7a6555', whiteSpace: 'nowrap' }}>Sets:</label>
                    <input
                      type="number"
                      min="1"
                      value={setCounts[item.label] || 1}
                      onChange={e => setSetCounts({ ...setCounts, [item.label]: Math.max(1, parseInt(e.target.value) || 1) })}
                      style={{ width: 40, padding: '4px 6px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13, textAlign: 'center' }}
                    />
                    <button
                      type="button"
                      onClick={() => selectAll(item.label, item.volumes)}
                      style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #b8860b', borderRadius: 4, background: '#f5e6c8', color: '#b8860b', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Select All
                    </button>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, maxWidth: 650 }}>
                {Array.from({ length: item.volumes }, (_, i) => i + 1).map(vol => {
                  const selected = (selectedItems[item.label] || []).includes(vol);
                  return (
                    <button
                      key={vol}
                      type="button"
                      onClick={() => toggleVolume(item.label, vol)}
                      style={{
                        width: 36, height: 32, border: selected ? '2px solid #b8860b' : '1px solid #ccc',
                        borderRadius: 5, cursor: 'pointer', fontSize: 13, fontWeight: selected ? 700 : 400,
                        background: selected ? '#f5e6c8' : '#fff',
                        color: selected ? '#b8860b' : '#333',
                      }}
                    >
                      {vol}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || Object.keys(selectedItems).length === 0}
            style={{
              width: '100%', padding: 14, marginTop: 12, border: 'none', borderRadius: 8,
              background: submitting || Object.keys(selectedItems).length === 0 ? '#ccc' : '#d4a574',
              color: '#fff', fontSize: 16, fontWeight: 700, cursor: submitting || Object.keys(selectedItems).length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Saving...' : 'Save Order'}
          </button>
          
          {lastSubmittedId && (
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <a
                href={`/invoice/${lastSubmittedId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  padding: '8px 20px',
                  background: '#5c3d2e',
                  color: '#fff',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
              >
                🖨️ Print Invoice
              </a>
            </div>
          )}

          {/* Summary */}
          {Object.keys(selectedItems).length > 0 && (
            <div style={{ marginTop: 16, padding: 12, background: '#fff', borderRadius: 6, fontSize: 13 }}>
              <strong>Order Summary:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                {Object.entries(selectedItems).map(([book, vols]) => {
                  const cost = formCosts[book] ? parseFloat(formCosts[book]) : 200;
                  return (
                    <li key={book} style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{book}: {vols.join(', ')} {vols.length > 1 ? 'vols' : 'vol'}</span>
                        <span style={{ fontWeight: 600, color: '#b8860b' }}>₹{cost.toLocaleString('en-IN')} × {vols.length} = ₹{(cost * vols.length).toLocaleString('en-IN')}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </form>
      )}

      {/* ─── SEARCH TAB ─── */}
      {activeTab === 'search' && (
        <div style={{ background: '#faf6f1', padding: 20, borderRadius: 10, border: '1px solid #e0d5c5' }}>
          <h3 style={{ margin: '0 0 12px', color: '#5c3d2e' }}>🔍 Search Orders</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Customer name, phone, book title..."
              style={{ flex: 1, padding: 10, border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
            />
            <button onClick={handleSearch} style={{ padding: '10px 20px', background: '#d4a574', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
              Search
            </button>
          </div>
          
          {searchResults.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 13, color: '#7a6555' }}>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found</p>
              {searchResults.map(rec => (
                <div key={rec.id} style={{ background: '#fff', border: '1px solid #e0d5c5', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#7a6555', marginBottom: 4 }}>
                    <span style={{ cursor: 'pointer' }}>{rec.invoice_number?.startsWith('BD-') ? rec.invoice_number : rec.invoice_number ? `BD-${rec.invoice_number}` : `#BD-${rec.id.slice(0, 8)}`}</span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span>{rec.date || '—'}</span>
                      <a
                        href={`/invoice/${rec.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#d4a574', textDecoration: 'none', fontWeight: 600, fontSize: 12 }}
                      >
                        🖨️ Print
                      </a>
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{rec.customer_name || '—'}</div>
                  {rec.phone && <div style={{ fontSize: 13, color: '#7a6555' }}>📞 {rec.phone}</div>}
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    {(rec.selected_books as any[] || []).map((item: any, i: number) => (
                      <span key={i} style={{ background: '#f0e6d8', padding: '2px 8px', borderRadius: 4, marginRight: 4, display: 'inline-block', marginBottom: 2 }}>
                        {item.book}{item.cost && <span style={{ color: '#b8860b', fontWeight: 600 }}>₹{item.cost}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {searchResults.length === 0 && searchQuery && (
            <p style={{ textAlign: 'center', color: '#999', marginTop: 20 }}>No matching records found.</p>
          )}
        </div>
      )}

      {/* ─── RECORDS TAB ─── */}
      {activeTab === 'records' && (
        <div style={{ background: '#faf6f1', padding: 20, borderRadius: 10, border: '1px solid #e0d5c5' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, color: '#5c3d2e' }}>📋 All Records ({allRecords.length})</h3>
            <button onClick={handleLoadAll} style={{ padding: '6px 14px', background: '#5c3d2e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              Refresh
            </button>
          </div>
          
          {allRecords.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#999', padding: 40 }}>No records yet. Fill out the Order Form first.</p>
          ) : (
            allRecords.map(rec => (
              <div key={rec.id} style={{ background: '#fff', border: '1px solid #e0d5c5', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#999', marginBottom: 4 }}>
                  <span>{rec.created_at ? new Date(rec.created_at).toLocaleString() : '—'}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ cursor: 'pointer' }}>{rec.invoice_number?.startsWith('BD-') ? rec.invoice_number : rec.invoice_number ? `BD-${rec.invoice_number}` : `#BD-${rec.id.slice(0, 8)}`}</span>
                    <a
                      href={`/invoice/${rec.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#d4a574', textDecoration: 'none', fontWeight: 600, fontSize: 12 }}
                    >
                      🖨️ Print
                    </a>
                  </span>
                </div>
                <div style={{ fontWeight: 600 }}>{rec.customer_name || '—'}</div>
                {rec.phone && <div style={{ fontSize: 13, color: '#7a6555' }}>{rec.phone}</div>}
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  {(rec.selected_books as any[] || []).map((item: any, i: number) => (
                    <span key={i} style={{ background: '#f0e6d8', padding: '2px 8px', borderRadius: 4, marginRight: 4, marginBottom: 2, display: 'inline-block' }}>
                      {item.book} {item.cost && <span style={{ color: '#b8860b', fontWeight: 600 }}>₹{item.cost}</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── ANALYTICS TAB ─── */}
      {activeTab === 'analytics' && (
        <div style={{ background: '#faf6f1', padding: 20, borderRadius: 10, border: '1px solid #e0d5c5' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0, color: '#5c3d2e' }}>📊 Sales Analytics</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['last_week', 'last_month', 'last_3m', 'all'] as const).map(p => (
                <button key={p} onClick={() => setPeriod(p)} style={{
                  padding: '5px 12px', borderRadius: 6, border: '1px solid #d4a574',
                  background: period === p ? '#5c3d2e' : '#fff',
                  color: period === p ? '#fff' : '#5c3d2e',
                  cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}>
                  {p === 'last_week' ? 'Last Week' : p === 'last_month' ? 'Last Month' : p === 'last_3m' ? 'Last 3 Months' : 'All Time'}
                </button>
              ))}
            </div>
          </div>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
            <div style={{ background: '#5c3d2e', color: '#fff', padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Invoices</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{filtered.length}</div>
            </div>
            <div style={{ background: '#d4a574', color: '#5c3d2e', padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Revenue</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>₹{totalRevenue.toLocaleString('en-IN')}</div>
            </div>
            <div style={{ background: '#fff', color: '#5c3d2e', padding: 12, borderRadius: 8, border: '1px solid #e0d5c5' }}>
              <div style={{ fontSize: 11, color: '#999' }}>Books</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{aggregated.length}</div>
            </div>
            <div style={{ background: '#fff', color: '#5c3d2e', padding: 12, borderRadius: 8, border: '1px solid #e0d5c5' }}>
              <div style={{ fontSize: 11, color: '#999' }}>Sets Sold</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{aggregated.reduce((s, e) => s + e.sets, 0)}</div>
            </div>
          </div>
          {aggregated.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#999', padding: 24 }}>No data for this period.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #5c3d2e' }}>
                    <th style={{ textAlign: 'left', padding: '8px 6px', color: '#5c3d2e' }}>Set</th>
                    <th style={{ textAlign: 'right', padding: '8px 6px', color: '#5c3d2e' }}>Buyers</th>
                    <th style={{ textAlign: 'right', padding: '8px 6px', color: '#5c3d2e' }}>Sets</th>
                    <th style={{ textAlign: 'right', padding: '8px 6px', color: '#5c3d2e' }}>Revenue</th>
                    <th style={{ padding: '8px 6px', color: '#5c3d2e', textAlign: 'center' }}>Monthly</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregated.map(e => {
                    const rev = e.revenue;
                    return (
                      <tr key={`${e.book}|${e.volCount}`} style={{ borderBottom: '1px solid #e0d5c5' }}>
                        <td style={{ padding: '8px 6px', fontWeight: 500 }}>{e.book} ({e.volCount} vols)</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right' }}>{e.buyers}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{e.sets}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: '#b8860b', fontWeight: 600 }}>₹{rev.toLocaleString('en-IN')}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                          <span style={{ fontSize: 11, color: '#7a6555' }}>
                            {Object.entries(e.setsByMonth).map(([k, v]) => `${formatMonth(k)} ${v}`).join(' • ')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Style helpers
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#7a6555', display: 'block', marginBottom: 4 };
const loginInputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #ccc', borderRadius: 6,
  fontSize: 14, boxSizing: 'border-box', background: '#fff',
};

// Reusable input component
function Input({ label, style, type = 'text', ...rest }: {
  label: string;
  type?: string;
  style?: React.CSSProperties;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div style={style}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#7a6555', display: 'block', marginBottom: 4 }}>{label}</label>
      <input
        type={type}
        {...(rest as any)}
        placeholder={rest.placeholder}
        value={rest.value}
        onChange={e => rest.onChange(e.target.value)}
        required={rest.required}
        style={{
          width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6,
          fontSize: 14, boxSizing: 'border-box', background: '#fff',
        }}
      />
    </div>
  );
}

export default App;
