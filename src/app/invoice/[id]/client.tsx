'use client';

import { useState, useEffect } from 'react';

interface SubmissionBook {
  book: string;
  volumes: number[];
  cost?: number;
}

interface Submission {
  id: string;
  invoice_number: string | null;
  bd_membership_no: string | null;
  date: string | null;
  customer_name: string | null;
  phone: string | null;
  selected_books: SubmissionBook[];
  search_vector: string | null;
  created_at: string;
}

async function fetchSubmission(id: string): Promise<Submission | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const res = await fetch(
    `${url}/rest/v1/invoice_submissions?id=eq.${encodeURIComponent(id)}&select=*`,
    {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Prefer': 'return=representation',
      },
    }
  );
  if (!res.ok) return null;
  const data: Submission[] = await res.json();
  return data[0] || null;
}

export default function InvoiceClient() {
  const [sub, setSub] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/\/invoice\/([^\/]+)\/?$/);
    const id = match ? match[1] : null;
    if (!id) {
      setLoading(false);
      return;
    }
    fetchSubmission(id).then(data => {
      setSub(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div style={{ maxWidth: 700, margin: '24px auto', padding: 32, textAlign: 'center', color: '#7a6555' }}>
        Loading invoice...
      </div>
    );
  }

  if (!sub) {
    return (
      <div style={{ maxWidth: 700, margin: '24px auto', padding: 32, textAlign: 'center', color: '#999' }}>
        <h2 style={{ color: '#5c3d2e' }}>Invoice Not Found</h2>
        <p>The requested invoice could not be found.</p>
      </div>
    );
  }

  const invNum = sub.invoice_number || '—';
  const date = sub.date || '—';
  const customer = sub.customer_name || '—';
  const phone = sub.phone || '';
  const books = sub.selected_books as SubmissionBook[];

  const totalCost = books.reduce((sum, b) => sum + ((b.cost || 200) * b.volumes.length), 0);

  return (
    <div id="invoice-page">
      <style>{printStyles}</style>
      <div style={pageStyle}>
        <div style={bannerStyle}>
          <h1 style={titleStyle}>Bharatha Darshana</h1>
          <p style={subtitleStyle}>Order Invoice</p>
        </div>
        <div style={dividerStyle}></div>
        <div style={metaRowStyle}>
          <div style={metaBlockStyle}>
            <div style={metaLabel}>Invoice No.</div>
            <div style={{ ...metaValue, color: '#b8860b' }}>{invNum.includes('BD-') ? invNum : `BD-${invNum}`}</div>
          </div>
          <div style={metaBlockStyle}>
            <div style={metaLabel}>Date</div>
            <div style={metaValue}>{date}</div>
          </div>
          {sub.bd_membership_no && (
            <div style={metaBlockStyle}>
              <div style={metaLabel}>BD Membership</div>
              <div style={metaValue}>{sub.bd_membership_no}</div>
            </div>
          )}
        </div>
        <div style={customerStyle}>
          <div style={customerLabel}>Srimati / Sri</div>
          <div style={customerName}>{customer}</div>
          {phone && <div style={customerPhone}>{phone}</div>}
        </div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 'auto' }}>Book</th>
              <th style={{ ...thStyle, width: 60, textAlign: 'center' }}>Sets</th>
              <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>Volumes</th>
              <th style={{ ...thStyle, width: 120, textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {books.map((b, i) => {
              const perVol = b.cost || 200;
              const numVols = b.volumes.length;
              const lineTotal = perVol * numVols;
              return (
                <tr key={i} style={i % 2 === 0 ? rowEvenStyle : rowOddStyle}>
                  <td style={tdStyle}>{b.book}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>1</td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: '#7a6555', fontSize: 12 }}>{numVols}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                    ₹{lineTotal.toLocaleString('en-IN')}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ ...tfootLabelStyle, textAlign: 'right' }}>Total</td>
              <td style={{ ...tfootLabelStyle, textAlign: 'right', fontWeight: 700, fontSize: 15 }}>
                ₹{totalCost.toLocaleString('en-IN')}
              </td>
            </tr>
          </tfoot>
        </table>
        <div style={footerStyle}>
          <p style={{ margin: 0, fontWeight: 600, color: '#d4a574', fontSize: 13, marginBottom: 4 }}>Thank you for your order!</p>
          <p style={{ margin: 0, fontSize: 11, color: '#999' }}>Generated on {new Date(sub.created_at).toLocaleString('en-IN')}</p>
        </div>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 700,
  margin: '24px auto',
  fontFamily: '-apple-system, "Segoe UI", sans-serif',
  padding: '32px 28px',
  background: '#fff',
  border: '1px solid #e0d5c5',
  borderRadius: 12,
};

const bannerStyle: React.CSSProperties = {
  textAlign: 'center',
  marginBottom: 8,
};

const titleStyle: React.CSSProperties = {
  fontSize: 28,
  margin: 0,
  color: '#5c3d2e',
  letterSpacing: 1,
};

const subtitleStyle: React.CSSProperties = {
  margin: '4px 0 0',
  color: '#7a6555',
  fontSize: 14,
  letterSpacing: 2,
  textTransform: 'uppercase',
};

const dividerStyle: React.CSSProperties = {
  height: 2,
  background: '#d4a574',
  margin: '16px 0 20px',
  border: 'none',
};

const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  marginBottom: 20,
};

const metaBlockStyle: React.CSSProperties = {
  flex: 1,
};

const metaLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: 1,
  marginBottom: 2,
};

const metaValue: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: '#3e3530',
};

const customerStyle: React.CSSProperties = {
  marginBottom: 24,
  paddingBottom: 16,
  borderBottom: '1px solid #eee',
};

const customerLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: 1,
  marginBottom: 2,
};

const customerName: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: '#5c3d2e',
  marginTop: 2,
};

const customerPhone: React.CSSProperties = {
  fontSize: 13,
  color: '#7a6555',
  marginTop: 2,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  marginBottom: 24,
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '2px solid #d4a574',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: '#7a6555',
  textTransform: 'uppercase',
  letterSpacing: 1,
  background: '#faf6f1',
};

const tdStyle: React.CSSProperties = {
  padding: '10px',
  borderBottom: '1px solid #eee',
  verticalAlign: 'top',
};

const rowEvenStyle: React.CSSProperties = { background: '#fff' };
const rowOddStyle: React.CSSProperties = { background: '#fdfaf6' };

const tfootLabelStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontWeight: 600,
  color: '#5c3d2e',
  fontSize: 13,
};

const footerStyle: React.CSSProperties = {
  textAlign: 'center',
  borderTop: '1px solid #eee',
  paddingTop: 16,
};

const printStyles = `
  @media print {
    body { margin: 0; padding: 0; }
    #invoice-page { padding: 0; border: none; }
    .no-print { display: none !important; }
    @page { margin: 10mm; size: A4; }
  }
`;