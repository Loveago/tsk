/**
 * Brand-accurate network logo tiles rendered as inline SVG so they scale
 * crisply at any size (product cards, menus, product detail hero).
 */
export function NetworkLogo({ network, className = "" }: { network: string; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={`${network} logo`}>
      {network === "MTN" && (
        <>
          <rect width="100" height="100" fill="#FFCB05" />
          <ellipse cx="50" cy="50" rx="38" ry="25" fill="none" stroke="#0a0a0a" strokeWidth="6" />
          <text
            x="50"
            y="51"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Arial, Helvetica, sans-serif"
            fontWeight="900"
            fontSize="24"
            fill="#0a0a0a"
          >
            MTN
          </text>
        </>
      )}
      {network === "TELECEL" && (
        <>
          <rect width="100" height="100" fill="#E4002B" />
          <circle cx="50" cy="36" r="12" fill="#ffffff" />
          <text
            x="50"
            y="37"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Arial, Helvetica, sans-serif"
            fontWeight="900"
            fontSize="16"
            fill="#E4002B"
          >
            t
          </text>
          <text
            x="50"
            y="66"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Arial, Helvetica, sans-serif"
            fontWeight="700"
            fontSize="17"
            fill="#ffffff"
          >
            telecel
          </text>
        </>
      )}
      {network === "AIRTELTIGO" && (
        <>
          <rect width="100" height="100" fill="#ffffff" />
          <text
            x="50"
            y="46"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Arial, Helvetica, sans-serif"
            fontWeight="900"
            fontSize="34"
          >
            <tspan fill="#0033A0">a</tspan>
            <tspan fill="#E4002B">t</tspan>
          </text>
          <text
            x="50"
            y="70"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Arial, Helvetica, sans-serif"
            fontWeight="700"
            fontSize="11"
            fill="#0033A0"
          >
            airteltigo
          </text>
        </>
      )}
    </svg>
  );
}
