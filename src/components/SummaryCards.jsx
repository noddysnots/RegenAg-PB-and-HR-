/**
 * @param {object} props
 * @param {number} props.totalFarms
 * @param {number} props.totalSurveyors
 * @param {number} props.dsrEligibleCount
 * @param {number} props.totalAreaAcres
 */
export function SummaryCards({
  totalFarms,
  totalSurveyors,
  dsrEligibleCount,
  totalAreaAcres,
}) {
  const fmtArea =
    totalAreaAcres >= 1000
      ? totalAreaAcres.toLocaleString('en-IN', { maximumFractionDigits: 0 })
      : totalAreaAcres.toLocaleString('en-IN', { maximumFractionDigits: 2 })

  const items = [
    { label: 'Total Farms', value: totalFarms.toLocaleString('en-IN') },
    { label: 'Total Surveyors', value: totalSurveyors.toLocaleString('en-IN') },
    {
      label: 'Fully accepted',
      value: dsrEligibleCount.toLocaleString('en-IN'),
      highlight: true,
    },
    { label: 'Total Area (acres)', value: fmtArea },
  ]

  return (
    <div className="w-full min-w-0 overflow-hidden">
      <div className="grid w-full grid-cols-2 gap-2 p-3">
        {items.map((card) => (
          <div
            key={card.label}
            className={`rounded-lg border border-[#1C3A2A]/12 bg-white p-3 shadow-sm ${
              card.highlight ? 'ring-1 ring-[#D97706]/30' : ''
            }`}
          >
            <p className="mb-1 text-[10px] font-semibold uppercase leading-tight tracking-widest text-[#1C3A2A]/55">
              {card.label}
            </p>
            <p
              title={card.value}
              className={`font-['Sora',sans-serif] font-bold tabular-nums tracking-tight leading-tight ${
                card.highlight ? 'text-[#D97706]' : 'text-[#1C3A2A]'
              }`}
              style={{ fontSize: 'clamp(16px, 2.5vw, 26px)' }}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
