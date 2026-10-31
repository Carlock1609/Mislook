import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"
import { copy } from "@/lib/content"

/** Static link-preview card. Generated at build time, and it never shows a daily image. */
export const alt = "Mislook — a daily image guessing game"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// Read once at module scope so the card does not depend on the request.
const archivoBlack = await readFile(join(process.cwd(), "app/fonts/ArchivoBlack-Regular.ttf"))

const rings = [160, 300, 460, 640, 840, 1060, 1300]

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
        backgroundColor: "#080808",
      }}
    >
      {rings.map((diameter, index) => (
        <div
          key={diameter}
          style={{
            position: "absolute",
            left: (size.width - diameter) / 2,
            top: (size.height - diameter) / 2,
            width: diameter,
            height: diameter,
            display: "flex",
            borderRadius: "50%",
            border: `2px solid ${index % 2 === 0 ? "#f0efe9" : "#5c5c56"}`,
          }}
        />
      ))}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            position: "relative",
            color: "#f0efe9",
            fontFamily: "Archivo Black",
            fontSize: 132,
            lineHeight: 0.82,
            letterSpacing: "-0.075em",
          }}
        >
          <div
            style={{
              position: "absolute",
              display: "flex",
              color: "#35a8ff",
              opacity: 0.75,
              transform: "translate(6px, 2px)",
              clipPath: "inset(43% 0 36% 0)",
            }}
          >
            <div style={{ display: "flex" }}>MISLOOK</div>
          </div>
          <div style={{ display: "flex" }}>MISLOOK</div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 36,
            color: "#93938d",
            fontFamily: "Archivo Black",
            fontSize: 28,
            letterSpacing: "0.02em",
          }}
        >
          {copy.ogSubtitle}
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [{ name: "Archivo Black", data: archivoBlack, style: "normal", weight: 400 }],
    },
  )
}
