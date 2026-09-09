/**
 * Re-mounts on every navigation, which is the whole point: the page fades and
 * rises in as one gesture, and the cards inside it pick up from there with
 * their own --i stagger. A layout would mount once and never move again.
 *
 * The header lives in layout.tsx, outside this, so it stays put.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="anim-page">{children}</div>
}
