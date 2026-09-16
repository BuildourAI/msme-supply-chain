/**
 * One inline icon set, no dependency.
 *
 * The reference draws every nav row, KPI tile and feature tile with a line
 * icon, and there is no icon library in this project. Adding one to draw
 * twenty glyphs would ship a few hundred kilobytes to save writing them; these
 * are the twenty, on a 24 grid with a 1.75 stroke so they sit at the same
 * optical weight as Inter at the sizes used here.
 *
 * Every icon is `aria-hidden`: an icon in this app always sits beside the word
 * it illustrates, never instead of it. §10 — colour and shape never carry a
 * meaning on their own.
 */

export type IconName =
  | 'home' | 'report' | 'cart' | 'tray' | 'boxes' | 'factory' | 'truck'
  | 'search' | 'bell' | 'chevron' | 'lock' | 'check' | 'arrow-right'
  | 'activity' | 'alert' | 'clock' | 'cash' | 'calendar' | 'menu' | 'help'
  | 'close' | 'scale' | 'doc' | 'arrow-down'

const PATHS: Record<IconName, React.ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20h13V9.5" /></>,
  report: <><path d="M4 20V4h9l5 5v11z" /><path d="M13 4v5h5" /><path d="M8 13h6M8 16.5h4" /></>,
  cart: <><circle cx="9.5" cy="19.5" r="1.4" /><circle cx="17.5" cy="19.5" r="1.4" /><path d="M2.5 3.5h2.7l2.4 11.2h11l2-7.7H6.4" /></>,
  tray: <><path d="M3.5 13.5V19a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-5.5" /><path d="M3.5 13.5h4.2l1.3 2.2h6l1.3-2.2h4.2" /><path d="M12 3v7.5M9 8l3 3 3-3" /></>,
  boxes: <><rect x="3" y="3.5" width="8" height="7" rx="1" /><rect x="13" y="3.5" width="8" height="7" rx="1" /><rect x="8" y="13.5" width="8" height="7" rx="1" /></>,
  factory: <><path d="M3 20.5V10l6 3.5V10l6 3.5V6h6v14.5z" /><path d="M7 17h2M13 17h2M18 17h1.5" /></>,
  truck: <><path d="M2.5 5.5h11v11h-11z" /><path d="M13.5 9.5h4l3.5 3.5v3.5h-7.5z" /><circle cx="7" cy="18.5" r="1.6" /><circle cx="17" cy="18.5" r="1.6" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>,
  bell: <><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Z" /><path d="M10 19a2 2 0 0 0 4 0" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  lock: <><rect x="4" y="10.5" width="16" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></>,
  check: <path d="m4.5 12.5 5 5 10-11" />,
  'arrow-right': <><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></>,
  activity: <path d="M2.5 12.5h4l3-8 4.5 15 3-7h4.5" />,
  alert: <><path d="M12 3.5 22 20H2z" /><path d="M12 9.5V14" /><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.2l3.2 2" /></>,
  cash: <><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><circle cx="12" cy="12" r="2.8" /><path d="M6 9.5v5M18 9.5v5" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 2.5V6M16 2.5V6" /></>,
  menu: <path d="M3.5 7h17M3.5 12h17M3.5 17h17" />,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.5a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.4" /><circle cx="12" cy="16.5" r=".9" fill="currentColor" stroke="none" /></>,
  close: <path d="m5.5 5.5 13 13M18.5 5.5l-13 13" />,
  scale: <><path d="M12 3.5v17M5 7.5h14" /><path d="M5 7.5 2.5 14h5zM19 7.5 16.5 14h5z" /><path d="M8 20.5h8" /></>,
  doc: <><path d="M5 20.5V3.5h8l5 5v12z" /><path d="M13 3.5v5h5" /><path d="M8.5 13h7M8.5 16.5h5" /></>,
  'arrow-down': <><path d="M12 4.5v15" /><path d="m6 13.5 6 6 6-6" /></>,
}

export function Icon({ name, className = 'size-4' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none"
         stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </svg>
  )
}

/**
 * The brand mark: a cluster of squares stepping out from a solid centre, the
 * shape the reference uses for its logo and for the centre of every diagram.
 * `fill="currentColor"` so one glyph works in orange on white and in white on
 * orange without a second copy.
 */
export function Logo({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <rect x="2" y="9.75" width="4.5" height="4.5" rx="1" />
      <rect x="17.5" y="9.75" width="4.5" height="4.5" rx="1" />
      <rect x="9.75" y="2" width="4.5" height="4.5" rx="1" />
      <rect x="9.75" y="17.5" width="4.5" height="4.5" rx="1" />
      <rect x="4" y="4" width="3.2" height="3.2" rx=".8" opacity=".75" />
      <rect x="16.8" y="4" width="3.2" height="3.2" rx=".8" opacity=".75" />
      <rect x="4" y="16.8" width="3.2" height="3.2" rx=".8" opacity=".75" />
      <rect x="16.8" y="16.8" width="3.2" height="3.2" rx=".8" opacity=".75" />
    </svg>
  )
}

/** Which glyph stands for each stage, used by the sidebar and the diagrams. */
export const STAGE_ICON: Record<string, IconName> = {
  sourcing: 'cart',
  inbound: 'tray',
  inventory: 'boxes',
  production: 'factory',
  dispatch: 'truck',
}
