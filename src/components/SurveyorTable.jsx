/**
 * @param {object} props
 * @param {Array<{ surveyorKey: string, surveyorLabel: string, farmsCovered: number, villages: number, totalArea: number, eligible: number, rejectedAuthFarms: number }>} props.rows
 * @param {(surveyorKey: string) => void} props.onRowClick
 */
export function SurveyorTable({ rows, onRowClick }) {
  const thNum =
    'px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[#1C3A2A]/55'
  const tdNum =
    'px-3 py-2 text-right text-xs tabular-nums text-[#1C3A2A]/80'

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-[#1C3A2A]/12 bg-white shadow-sm">
      <div className="border-b border-[#1C3A2A]/10 bg-[#1C3A2A] px-4 py-3">
        <h2 className="font-['Sora',sans-serif] text-base font-semibold text-white">
          Surveyor activity
        </h2>
        <p className="mt-0.5 text-xs text-white/75">
          Click a row to open farm records for that surveyor.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-0 max-w-full border-collapse text-left">
          <thead>
            <tr className="bg-[#1C3A2A]/[0.06] font-['IBM_Plex_Sans',sans-serif]">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#1C3A2A]/55">
                Surveyor name
              </th>
              <th className={thNum}>Farms covered</th>
              <th className={thNum}>Villages</th>
              <th className={thNum}>Total area (ac)</th>
              <th className={thNum}>Fully accepted</th>
              <th className={thNum}>Rejected auth</th>
            </tr>
          </thead>
          <tbody className="font-['IBM_Plex_Sans',sans-serif]">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-sm text-[#1C3A2A]/50"
                >
                  No records in the current filter.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr
                  key={r.surveyorKey}
                  onClick={() => onRowClick(r.surveyorKey)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onRowClick(r.surveyorKey)
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  className={`cursor-pointer border-b border-[#1C3A2A]/6 transition hover:bg-[#1C3A2A]/8 focus:bg-[#1C3A2A]/10 focus:outline-none ${
                    i % 2 === 1 ? 'bg-[#1C3A2A]/[0.03]' : ''
                  }`}
                >
                  <td className="px-3 py-2 text-xs font-medium text-[#1C3A2A]">
                    {r.surveyorLabel}
                  </td>
                  <td className={tdNum}>{r.farmsCovered.toLocaleString('en-IN')}</td>
                  <td className={tdNum}>{r.villages.toLocaleString('en-IN')}</td>
                  <td className={tdNum}>
                    {r.totalArea.toLocaleString('en-IN', {
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className={tdNum}>{r.eligible.toLocaleString('en-IN')}</td>
                  <td className={`${tdNum} text-[#92400e]`}>
                    {r.rejectedAuthFarms.toLocaleString('en-IN')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
