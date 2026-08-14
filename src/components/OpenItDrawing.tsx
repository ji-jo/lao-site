type OpenItDrawingProps = {
  className?: string;
  /** Mount only when its containing section is in view so the SVG timeline starts there. */
  play?: boolean;
};

/** A small hand-drawn "open file" animation for the Open it note. */
export function OpenItDrawing({ className = "", play = false }: OpenItDrawingProps) {
  if (!play) return null;
  const draw = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2.5,
    pathLength: 100,
    strokeDasharray: 100,
    strokeDashoffset: 100,
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 104 78"
      className={className}
      fill="none"
    >
      <path d="M13 63V22.5c0-3 2.5-5.5 5.5-5.5h22l7 8h38.5c3 0 5.5 2.5 5.5 5.5V63c0 3-2.5 5.5-5.5 5.5h-67c-3.3 0-6-2.5-6-5.5Z" {...draw}>
        <animate attributeName="stroke-dashoffset" values="100;0" dur="1.1s" fill="freeze" />
      </path>
      <path d="M35 47.5 44.5 57l23-27" {...draw}>
        <animate attributeName="stroke-dashoffset" values="100;100;0" keyTimes="0;.38;1" dur="1.1s" fill="freeze" />
      </path>
      <path d="m76 16 1.8 4.2L82 22l-4.2 1.8L76 28l-1.8-4.2L70 22l4.2-1.8L76 16Z" fill="currentColor" opacity="0">
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;.58;1" dur="1.1s" fill="freeze" />
      </path>
    </svg>
  );
}

/** Matching lightweight line animations for the other file cards. */
export function WorkItDrawing({ className = "", play = false }: OpenItDrawingProps) {
  if (!play) return null;
  return (
    <svg aria-hidden="true" viewBox="0 0 104 78" className={className} fill="none">
      <path d="m23 57 8.5-2.3L76 10.2l-6.7-6.7-44.5 44.5L23 57Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset="1">
        <animate attributeName="stroke-dashoffset" values="1;0" dur="1s" fill="freeze" />
      </path>
      <path d="m62.6 10.2 6.7 6.7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset="1">
        <animate attributeName="stroke-dashoffset" values="1;1;0" keyTimes="0;.28;1" dur="1s" fill="freeze" />
      </path>
    </svg>
  );
}

export function SaveItDrawing({ className = "", play = false }: OpenItDrawingProps) {
  if (!play) return null;
  return (
    <svg aria-hidden="true" viewBox="0 0 104 78" className={className} fill="none">
      <path d="M22 12h48l12 12v42H22V12Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset="1">
        <animate attributeName="stroke-dashoffset" values="1;0" dur="1s" fill="freeze" />
      </path>
      <path d="M32 12v19h37V12M33 55h38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset="1">
        <animate attributeName="stroke-dashoffset" values="1;1;0" keyTimes="0;.32;1" dur="1s" fill="freeze" />
      </path>
    </svg>
  );
}

export function ShareItDrawing({ className = "", play = false }: OpenItDrawingProps) {
  if (!play) return null;
  return (
    <svg aria-hidden="true" viewBox="0 0 104 78" className={className} fill="none">
      <path d="M33 40 69 21M33 40l36 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset="1">
        <animate attributeName="stroke-dashoffset" values="1;0" dur="1s" fill="freeze" />
      </path>
      <circle cx="29" cy="40" r="7" stroke="currentColor" strokeWidth="2.5" pathLength="1" strokeDasharray="1" strokeDashoffset="1"><animate attributeName="stroke-dashoffset" values="1;0" dur=".76s" fill="freeze" /></circle>
      <circle cx="73" cy="19" r="7" stroke="currentColor" strokeWidth="2.5" pathLength="1" strokeDasharray="1" strokeDashoffset="1"><animate attributeName="stroke-dashoffset" values="1;1;0" keyTimes="0;.2;1" dur=".9s" fill="freeze" /></circle>
      <circle cx="73" cy="61" r="7" stroke="currentColor" strokeWidth="2.5" pathLength="1" strokeDasharray="1" strokeDashoffset="1"><animate attributeName="stroke-dashoffset" values="1;1;0" keyTimes="0;.38;1" dur="1s" fill="freeze" /></circle>
    </svg>
  );
}
