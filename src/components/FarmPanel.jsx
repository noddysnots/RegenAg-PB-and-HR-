import { Fragment, useState } from 'react'

const LABEL = {
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  PENDING: 'Pending',
}

/**
 * @param {object} props
 * @param {string} props.status internal auth code
 */
function StatusPill({ status }) {
  if (!status) {
    return (
      <span className="inline-flex rounded-full bg-[#1C3A2A]/8 px-2 py-0.5 text-xs font-medium text-[#1C3A2A]/60">
        —
      </span>
    )
  }
  const map = {
    ACCEPTED: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-900/15',
    PENDING:
      'bg-amber-100 text-amber-950 ring-1 ring-[#D97706]/25',
    REJECTED: 'bg-red-100 text-red-900 ring-1 ring-red-900/12',
  }
  const cls = map[status] || 'bg-[#1C3A2A]/10 text-[#1C3A2A]'
  const text = LABEL[status] || status
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}
    >
      {text}
    </span>
  )
}

function formatDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string | null} props.surveyorLabel
 * @param {import('../utils/parseExcel.js').FarmRecord[]} props.farms
 */
export function FarmPanel({ open, onClose, surveyorLabel, farms }) {
  const [expandedFarmId, setExpandedFarmId] = useState(null)

  if (!open) return null

  return (
    <>
      <button
        type="button"
        aria-label="Close panel"
        className="fixed inset-0 z-30 bg-[#1C3A2A]/20 transition"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-[#1C3A2A]/15 bg-[#F7F6F2] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="farm-panel-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#1C3A2A]/10 bg-[#1C3A2A] px-4 py-3">
          <div>
            <h2
              id="farm-panel-title"
              className="font-['Sora',sans-serif] text-lg font-semibold text-white"
            >
              Farm records
            </h2>
            <p className="mt-1 text-sm text-white/85">
              Surveyor:{' '}
              <span className="font-semibold text-[#F7F6F2]">
                {surveyorLabel}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-white/70">
              {farms.length.toLocaleString('en-IN')} row
              {farms.length === 1 ? '' : 's'} in scope
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg bg-white/10 px-2.5 py-1 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="overflow-hidden rounded-lg border border-[#1C3A2A]/12 bg-white shadow-sm">
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="bg-[#1C3A2A]/[0.06] text-[0.65rem] font-semibold uppercase tracking-wide text-[#1C3A2A]/80 sm:text-xs">
                  <th className="px-2 py-2">Farm ID</th>
                  <th className="px-2 py-2">Farmer</th>
                  <th className="px-2 py-2">Partner</th>
                  <th className="px-2 py-2">Village</th>
                  <th className="px-2 py-2 text-right">Area</th>
                  <th className="px-2 py-2">Farmer auth</th>
                  <th className="px-2 py-2">Farm auth</th>
                  <th className="px-2 py-2 w-8" aria-hidden />
                </tr>
              </thead>
              <tbody className="font-['IBM_Plex_Sans',sans-serif]">
                {farms.map((row, i) => {
                  const key = `${row.farmId}-${row.farmerId}-${i}`
                  const openRow = expandedFarmId === key
                  return (
                    <Fragment key={key}>
                      <tr
                        className={`cursor-pointer border-b border-[#1C3A2A]/8 text-[#1C3A2A] transition hover:bg-[#1C3A2A]/6 ${
                          i % 2 === 1 ? 'bg-[#1C3A2A]/[0.03]' : ''
                        }`}
                        onClick={() =>
                          setExpandedFarmId(openRow ? null : key)
                        }
                      >
                        <td className="px-2 py-2 font-mono text-[0.7rem] sm:text-xs">
                          {row.farmId}
                        </td>
                        <td className="px-2 py-2">
                          {row.farmerName || '—'}
                        </td>
                        <td className="px-2 py-2 max-w-[100px] truncate" title={row.partnerName}>
                          {row.partnerName || '—'}
                        </td>
                        <td className="px-2 py-2">{row.village || '—'}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {row.areaAcres.toLocaleString('en-IN', {
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-2 py-2">
                          <StatusPill status={row.farmerAuth} />
                        </td>
                        <td className="px-2 py-2">
                          <StatusPill status={row.farmAuth} />
                        </td>
                        <td className="px-2 py-2 text-[#1C3A2A]/50">
                          {openRow ? '▾' : '▸'}
                        </td>
                      </tr>
                      {openRow ? (
                        <tr className="bg-[#F7F6F2]">
                          <td colSpan={8} className="px-3 py-3 text-xs text-[#1C3A2A]">
                            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                              <div>
                                <dt className="text-[#1C3A2A]/55">State</dt>
                                <dd className="font-medium">{row.state || '—'}</dd>
                              </div>
                              <div>
                                <dt className="text-[#1C3A2A]/55">District</dt>
                                <dd className="font-medium">
                                  {row.district || '—'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[#1C3A2A]/55">Block</dt>
                                <dd className="font-medium">{row.block || '—'}</dd>
                              </div>
                              <div>
                                <dt className="text-[#1C3A2A]/55">Village</dt>
                                <dd className="font-medium">
                                  {row.village || '—'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[#1C3A2A]/55">Partner</dt>
                                <dd className="font-medium">
                                  {row.partnerName || '—'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[#1C3A2A]/55">Farmer ID</dt>
                                <dd className="font-mono">{row.farmerId || '—'}</dd>
                              </div>
                              <div>
                                <dt className="text-[#1C3A2A]/55">Farmer onboarded</dt>
                                <dd className="font-medium">
                                  {formatDate(row.onboardingDate)}
                                </dd>
                              </div>
                              {row.finalStatus ? (
                                <div>
                                  <dt className="text-[#1C3A2A]/55">Final status (legacy)</dt>
                                  <dd className="font-medium">{row.finalStatus}</dd>
                                </div>
                              ) : null}
                            </dl>
                            <div className="mt-3 rounded-md border border-[#1C3A2A]/10 bg-white p-2">
                              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[#1C3A2A]/55">
                                Raw row (all columns)
                              </p>
                              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[0.65rem] leading-snug text-[#1C3A2A]/90">
                                {JSON.stringify(row._raw, null, 2)}
                              </pre>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </aside>
    </>
  )
}
