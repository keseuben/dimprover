type SurveyNorthMarkProps = { northAngle?: number; x?: number; y?: number; scale?: number; };

export default function SurveyNorthMark({ northAngle = 0, x = 0, y = 0, scale = 1 }: SurveyNorthMarkProps) {
  return (
    <g data-survey-north-mark="true" transform={`translate(${x} ${y}) scale(${scale})`} pointerEvents="none">
      <polygon points="0,-31 26,-16 26,16 0,31 -26,16 -26,-16" fill="#ecfeff" fillOpacity="0.94" stroke="#0891b2" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      <g data-survey-north-pointer="true" transform={`rotate(${northAngle})`}>
        <polygon points="0,-24 14,-7 11,10 0,20 -11,10 -14,-7" fill="#0f3d46" stroke="#14b8a6" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d="M 0 -18 L 0 14" fill="none" stroke="#5eead4" strokeWidth="1.5" strokeLinecap="round" opacity="0.58" vectorEffect="non-scaling-stroke" />
        <path data-survey-north-mini-arrow="true" d="M -3.5 -12.5 L 0 -18 L 3.5 -12.5" fill="none" stroke="#5eead4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.92" vectorEffect="non-scaling-stroke" />
      </g>
      <text x="0" y="3.5" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="950">É</text>
      <text x="0" y="43" textAnchor="middle" fill="#0e7490" fontSize="8" fontWeight="950">DIMPRO</text>
    </g>
  );
}
