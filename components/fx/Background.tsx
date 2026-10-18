/** Op-art background (pure CSS for now; see `.op-art` in globals.css). Dimmed during the game. */
export default function Background({ dim }: { dim: boolean }) {
  return (
    <div className="op-art" data-dim={dim} aria-hidden="true">
      <div className="op-art__orbit top-[24%] left-[18%]" />
      <div className="op-art__orbit right-[20%] bottom-[23%]" />
    </div>
  )
}
