'use client';
import { useState } from 'react';

export default function PortalFinancials({ bills, readings, pitch, user, siteName, sitePhone, downloadBillPDF }) {
  const [subTab, setSubTab] = useState('bills');
  const [expandedBill, setExpandedBill] = useState(null);

  const totalOwed = bills.filter(b => b.status !== 'paid').reduce((s, b) => s + Number(b.amount_gbp || 0), 0);

  return (
    <div className="space-y-3 mt-1">
      {/* Outstanding Summary */}
      {totalOwed > 0 ? (
        <div className="bg-gradient-to-r from-red-500 to-rose-500 text-white rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-white/70">Amount Outstanding</p>
            <p className="text-2xl font-bold">&pound;{totalOwed.toFixed(2)}</p>
          </div>
          <div className="bg-white/20 rounded-lg px-3 py-1.5 text-xs font-medium">
            {bills.filter(b => b.status !== 'paid').length} unpaid
          </div>
        </div>
      ) : bills.length > 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm text-emerald-700 font-medium">All bills paid &mdash; you&apos;re up to date!</span>
        </div>
      ) : null}

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-white rounded-xl border p-1">
        <button onClick={() => setSubTab('bills')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${subTab === 'bills' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>
          Bills
        </button>
        <button onClick={() => setSubTab('readings')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${subTab === 'readings' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>
          Readings
        </button>
      </div>

      {/* Bills */}
      {subTab === 'bills' && (
        bills.length === 0 ? (
          <div className="bg-white rounded-2xl border p-6 text-center">
            <p className="text-sm text-slate-400">No bills yet.</p>
          </div>
        ) : bills.map(b => (
          <div key={b.id} className="bg-white rounded-2xl border overflow-hidden">
            <button className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
              onClick={() => setExpandedBill(expandedBill === b.id ? null : b.id)}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${b.status === 'paid' ? 'bg-emerald-100' : 'bg-red-100'}`}>
                {b.status === 'paid' ? (
                  <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                ) : <span className="text-red-600 font-bold text-sm">&pound;</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {b.period_start && b.period_end
                    ? `${new Date(b.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} \u2013 ${new Date(b.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : 'Billing Period'}
                </p>
                <p className="text-xs text-slate-400">{Number(b.usage_kwh).toLocaleString()} kWh used</p>
              </div>
              <div className="text-right">
                <p className={`text-base font-bold ${b.status === 'paid' ? 'text-emerald-600' : 'text-slate-900'}`}>&pound;{Number(b.amount_gbp).toFixed(2)}</p>
                <span className={`text-xs font-medium ${b.status === 'paid' ? 'text-emerald-500' : 'text-red-500'}`}>{b.status === 'paid' ? 'Paid' : 'Unpaid'}</span>
              </div>
              <svg className={`w-4 h-4 text-slate-300 transition-transform flex-shrink-0 ${expandedBill === b.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expandedBill === b.id && (
              <div className="border-t bg-slate-50 px-4 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-xl p-3 border">
                    <p className="text-xs text-slate-400">Start Reading</p>
                    <p className="text-lg font-mono font-bold text-slate-700">{Number(b.start_reading || 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-white rounded-xl p-3 border">
                    <p className="text-xs text-slate-400">End Reading</p>
                    <p className="text-lg font-mono font-bold text-slate-700">{Number(b.end_reading || 0).toLocaleString()}</p>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-3 border flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">Usage x Rate</p>
                    <p className="text-sm text-slate-600">{Number(b.usage_kwh).toLocaleString()} kWh x &pound;{Number(b.unit_rate).toFixed(2)}</p>
                  </div>
                  <p className="text-lg font-bold text-emerald-600">&pound;{Number(b.amount_gbp).toFixed(2)}</p>
                </div>
                {b.status === 'paid' && b.paid_at && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-xs text-emerald-700">Paid on {new Date(b.paid_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  </div>
                )}
                {b.status !== 'paid' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-xs text-amber-800 font-medium">Payment required &mdash; please contact the site office.</p>
                    {sitePhone && <p className="text-xs text-amber-700 mt-1">Tel: {sitePhone}</p>}
                  </div>
                )}
                <button onClick={() => downloadBillPDF(b)}
                  className="w-full py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Download PDF
                </button>
              </div>
            )}
          </div>
        ))
      )}

      {/* Readings */}
      {subTab === 'readings' && (
        readings.length === 0 ? (
          <div className="bg-white rounded-2xl border p-6 text-center">
            <p className="text-sm text-slate-400">No meter readings recorded yet.</p>
          </div>
        ) : readings.map((r, i) => (
          <div key={r.id} className="bg-white rounded-2xl border p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-900">
                {r.read_at ? new Date(r.read_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '\u2014'}
              </p>
              {r.usage_kwh != null && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">+{Number(r.usage_kwh).toLocaleString()} kWh</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-xs text-slate-400">Previous</p>
                <p className="text-base font-mono font-bold text-slate-500">{Number(r.previous_reading || 0).toLocaleString()}</p>
              </div>
              <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              <div className="flex-1 text-right">
                <p className="text-xs text-slate-400">Current</p>
                <p className="text-base font-mono font-bold text-slate-900">{Number(r.reading).toLocaleString()}</p>
              </div>
            </div>
            {i < readings.length - 1 && r.usage_kwh && readings[i + 1]?.usage_kwh && (
              <div className="mt-3 pt-2 border-t">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>vs previous period</span>
                  <span className={r.usage_kwh > readings[i + 1].usage_kwh ? 'text-red-500' : 'text-emerald-500'}>
                    {r.usage_kwh > readings[i + 1].usage_kwh ? '+' : ''}{Math.round(((r.usage_kwh - readings[i + 1].usage_kwh) / readings[i + 1].usage_kwh) * 100)}%
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${r.usage_kwh > readings[i + 1].usage_kwh ? 'bg-red-400' : 'bg-emerald-400'}`}
                    style={{ width: `${Math.min(100, (r.usage_kwh / Math.max(r.usage_kwh, readings[i + 1].usage_kwh)) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
