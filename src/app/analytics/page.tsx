'use client';

import { useEffect, useState, useCallback } from 'react';

interface Submission {
  id: string;
  invoice_number: string | null;
  customer_name: string | null;
  selected_books: any[];
  created_at: string;
}

interface BookSetStats {
  book: string;
  volCount: number;
  sets: number;
  buyers: number;
  setsByMonth: Record<string, number>;
}

function getVolumeCount(books: any[]): { book: string; volCount: number }[] {
  return books.map(b => ({
    book: b.book,
    volCount: b.volumes ? b.volumes.length : 1,
  }));
}

function getMonthKey(ts: string): string {
  return ts.slice(0, 7); // YYYY-MM
}

function formatMonth(key: string): string {
  const [y, m] = key.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

async function loadAll(subUrl: string, key: string): Promise<Submission[]> {
  if (!subUrl || !key) return [];
  const res = await fetch(`${subUrl}/rest/v1/invoice_submissions?select=*&order=created_at.desc&limit=1000`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=representation' },
  });
  if (!res.ok) return [];
  return res.json();
}

export default function AnalyticsPage() {
  const [records, setRecords] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'last_month' | 'last_3m' | 'all'>('last_month');

  const fetchRecords = useCallback(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const all = await loadAll(url, key);
    setRecords(all);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const getFiltered = useCallback(() => {
    const now = new Date();
    let cutoff: Date;
    if (period === 'last_month') {
      cutoff = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    } else if (period === 'last_3m') {
      cutoff = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    } else {
      cutoff = new Date(0);
    }
    return records.filter(r => new Date(r.created_at) >= cutoff);
  }, [records, period]);

  const agg = getFiltered().reduce((acc, rec) => {
    if (!rec.selected_books?.length) return acc;
    const seen = new Set<string>();
    rec.selected_books.forEach(b => {
      if (!b.book) return;
      const vc = b.volumes ? b.volumes.length : 1;
      const sets = b.sets && b.sets > 1 ? b.sets : 1;
      const key = `${b.book}|${vc}`;
      if (!seen.has(key)) {
        seen.add(key);
        acc[key] = acc[key] || {
          book: b.book,
          volCount: vc,
          sets: 0,
          buyers: 0,
          setsByMonth: {} as Record<string, number>,
        };
        acc[key].sets += sets;
        acc[key].buyers += 1;
        const m = getMonthKey(rec.created_at);
        acc[key].setsByMonth[m] = (acc[key].setsByMonth[m] || 0) + sets;
      }
    });
    return acc;
  }, {} as Record<string, BookSetStats>);

  const entries = Object.values(agg).sort((a, b) => b.sets - a.sets);
  const filtered = getFiltered();
  const totalRevenue = filtered.reduce((s, r) => {
    return s + (r.selected_books as any[]).reduce(
      (sub, b) => sub + ((b.cost || 200) * (b.volumes?.length || 1)), 0
    );
  }, 0);

  if (loading) return <p style={{ padding: 40, textAlign: 'center', color: '#999' }}>Loading analytics...</p>;

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0, color: '#5c3d2e' }}>📊 Analytics</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['last_month', 'last_3m', 'all'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid #d4a574',
              background: period === p ? '#5c3d2e' : '#fff',
              color: period === p ? '#fff' : '#5c3d2e',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}>
              {p === 'last_month' ? 'Last Month' : p === 'last_3m' ? 'Last 3 Months' : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
        <div style={{ background: '#5c3d2e', color: '#fff', padding: 16, borderRadius: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Invoices</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{filtered.length}</div>
        </div>
        <div style={{ background: '#d4a574', color: '#5c3d2e', padding: 16, borderRadius: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Total Revenue</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>₹{totalRevenue.toLocaleString('en-IN')}</div>
        </div>
        <div style={{ background: '#fff', color: '#5c3d2e', padding: 16, borderRadius: 10, border: '1px solid #e0d5c5' }}>
          <div style={{ fontSize: 12, color: '#999' }}>Unique Books</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{entries.length}</div>
        </div>
        <div style={{ background: '#fff', color: '#5c3d2e', padding: 16, borderRadius: 10, border: '1px solid #e0d5c5' }}>
          <div style={{ fontSize: 12, color: '#999' }}>Sets Sold</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            {entries.reduce((s, e) => s + e.sets, 0)}
          </div>
        </div>
      </div>

      {/* Breakdown table */}
      {entries.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#999', padding: 32 }}>No data for this period.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #5c3d2e' }}>
                <th style={{ textAlign: 'left', padding: '10px 8px', color: '#5c3d2e', fontSize: 13 }}>Set</th>
                <th style={{ textAlign: 'right', padding: '10px 8px', color: '#5c3d2e', fontSize: 13 }}>Buyers</th>
                <th style={{ textAlign: 'right', padding: '10px 8px', color: '#5c3d2e', fontSize: 13 }}>Sets</th>
                <th style={{ textAlign: 'right', padding: '10px 8px', color: '#5c3d2e', fontSize: 13 }}>Revenue</th>
                {Object.keys(entries[0].setsByMonth).length > 0 && (
                  <th style={{ padding: '10px 8px', color: '#5c3d2e', fontSize: 13, textAlign: 'center' }}>Monthly</th>
                )}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const avgCost = e.book === 'Bharatha Darshana Monthly Magazine (Annual Subscription)' ? 1000 :
                  e.book === 'Special Volumes' ? 500 :
                  200;
                const rev = e.sets * e.volCount * avgCost;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #e0d5c5' }}>
                    <td style={{ padding: '10px 8px', fontWeight: 500 }}>{e.book} ({e.volCount} vols/set)</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>{e.buyers}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600 }}>{e.sets}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#b8860b', fontWeight: 600 }}>₹{rev.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
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
  );
}
