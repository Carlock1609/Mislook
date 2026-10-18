/**
 * @file Plain WebGL 1 renderer (no libraries).
 *
 * Each frame is two passes:
 * 1. **Style pass** into an offscreen framebuffer: `drawStyle` draws the scene
 *    (or the in-between of two scenes during a transition).
 * 2. **Post pass** to the screen: glitch slices and RGB split while a
 *    transition plays, a crossfade when the style kind changes, and greyscale
 *    for every stage except the clear image.
 *
 * Shader sources live in `shaders.ts`; the per-stage maths in `scene.ts`.
 */

import { glyphAtlas } from "@/lib/gl/glyphs"
import { createAnimator, type Renderer, type ShowOptions, TRANSITION_MS } from "@/lib/gl/renderer"
import { easeInOut, MAX_BANDS, MAX_HOLES, NOISE_SIZE, type Scene, staticNoise } from "@/lib/gl/scene"
import {
  CANDIDATE_FRAGMENT,
  EXPERIMENT_FRAGMENT,
  POST_FRAGMENT,
  STYLE_FRAGMENT,
  TILE_FRAGMENT,
  VERTEX,
} from "@/lib/gl/shaders"

/** Texture units: 0 image, 1–2 post-pass framebuffers, then the lookup textures. */
const NOISE_UNIT = 3
const GLYPH_UNIT = 4

/** An offscreen colour buffer the style pass renders into. */
type Target = { texture: WebGLTexture; framebuffer: WebGLFramebuffer }

/** Two triangles covering the image: x, y, u, v per vertex. */
const FULL_QUAD = new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1])

/**
 * Creates the WebGL renderer on `canvas`.
 * @returns The renderer, or null when WebGL is unavailable (use the Canvas 2D fallback).
 */
export function createWebGLRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false })
  if (!gl) return null
  const ctx: WebGLRenderingContext = gl

  let image: HTMLImageElement | null = null
  let size = canvas.width
  let current: Scene | null = null
  const animator = createAnimator()

  // GPU resources, rebuilt after a lost context is restored.
  let imageTexture: WebGLTexture | null = null
  let targets: [Target, Target] | null = null
  let buffer: WebGLBuffer | null = null
  let tileProgram: WebGLProgram | null = null
  let styleProgram: WebGLProgram | null = null
  let postProgram: WebGLProgram | null = null
  // Test-panel programs, compiled on first use so a device that can't build
  // them still plays the v1 styles.
  let candidateProgram: WebGLProgram | null = null
  let experimentProgram: WebGLProgram | null = null
  // Lookup textures, made on first use.
  let noise: { seed: string; texture: WebGLTexture } | null = null
  let glyphs: WebGLTexture | null = null
  const uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>()

  /** Compiles one shader; throws with the info log on failure (unless the context is lost). */
  function compile(type: number, source: string) {
    const shader = ctx.createShader(type)!
    ctx.shaderSource(shader, source)
    ctx.compileShader(shader)
    if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS) && !ctx.isContextLost()) {
      throw new Error(ctx.getShaderInfoLog(shader) ?? "shader compile failed")
    }
    return shader
  }

  /** Links the shared vertex shader with `fragment`, binding a_pos to 0 and a_uv to 1. */
  function program(fragment: string) {
    const p = ctx.createProgram()!
    ctx.attachShader(p, compile(ctx.VERTEX_SHADER, VERTEX))
    ctx.attachShader(p, compile(ctx.FRAGMENT_SHADER, fragment))
    ctx.bindAttribLocation(p, 0, "a_pos")
    ctx.bindAttribLocation(p, 1, "a_uv")
    ctx.linkProgram(p)
    if (!ctx.getProgramParameter(p, ctx.LINK_STATUS) && !ctx.isContextLost()) {
      throw new Error(ctx.getProgramInfoLog(p) ?? "program link failed")
    }
    uniforms.set(p, new Map())
    return p
  }

  /** Cached uniform location lookup. */
  function uniform(p: WebGLProgram, name: string) {
    const cache = uniforms.get(p)!
    if (!cache.has(name)) cache.set(name, ctx.getUniformLocation(p, name))
    return cache.get(name)!
  }

  /** A new linear-filtered, edge-clamped texture, bound to the active unit. */
  function texture() {
    const t = ctx.createTexture()!
    ctx.bindTexture(ctx.TEXTURE_2D, t)
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR)
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR)
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE)
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE)
    return t
  }

  /** A size × size RGBA framebuffer for the style pass. */
  function makeTarget(): Target {
    const t = texture()
    ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, size, size, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, null)
    const framebuffer = ctx.createFramebuffer()!
    ctx.bindFramebuffer(ctx.FRAMEBUFFER, framebuffer)
    ctx.framebufferTexture2D(ctx.FRAMEBUFFER, ctx.COLOR_ATTACHMENT0, ctx.TEXTURE_2D, t, 0)
    ctx.bindFramebuffer(ctx.FRAMEBUFFER, null)
    return { texture: t, framebuffer }
  }

  function freeTargets() {
    targets?.forEach((t) => {
      ctx.deleteTexture(t.texture)
      ctx.deleteFramebuffer(t.framebuffer)
    })
    targets = null
  }

  /** Creates every GPU resource. Runs at start and after a lost context is restored. */
  function init() {
    uniforms.clear()
    tileProgram = program(TILE_FRAGMENT)
    styleProgram = program(STYLE_FRAGMENT)
    postProgram = program(POST_FRAGMENT)
    candidateProgram = null
    experimentProgram = null
    noise = null
    glyphs = null
    buffer = ctx.createBuffer()
    targets = [makeTarget(), makeTarget()]
    imageTexture = null
    if (image) uploadImage(image)
  }

  function uploadImage(img: HTMLImageElement) {
    if (imageTexture) ctx.deleteTexture(imageTexture)
    imageTexture = texture()
    ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, ctx.RGBA, ctx.UNSIGNED_BYTE, img)
  }

  /** The frozen static noise for `seed` as a nearest-filtered luminance texture (cached). */
  function noiseTexture(seed: string) {
    if (noise?.seed === seed) return noise.texture
    if (noise) ctx.deleteTexture(noise.texture)
    // Its own unit, so creating it doesn't unbind the image on unit 0.
    ctx.activeTexture(ctx.TEXTURE0 + NOISE_UNIT)
    const t = texture()
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.NEAREST)
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.NEAREST)
    ctx.pixelStorei(ctx.UNPACK_ALIGNMENT, 1)
    const data = staticNoise(seed)
    ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.LUMINANCE, NOISE_SIZE, NOISE_SIZE, 0, ctx.LUMINANCE, ctx.UNSIGNED_BYTE, data)
    noise = { seed, texture: t }
    return t
  }

  /** The ASCII glyph atlas as a texture (cached). */
  function glyphTexture() {
    if (glyphs) return glyphs
    // Its own unit, so creating it doesn't unbind the image on unit 0.
    ctx.activeTexture(ctx.TEXTURE0 + GLYPH_UNIT)
    glyphs = texture()
    ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, ctx.RGBA, ctx.UNSIGNED_BYTE, glyphAtlas())
    return glyphs
  }

  /** Uploads `vertices` (x, y, u, v per vertex) and draws them as triangles with program `p`. */
  function draw(p: WebGLProgram, vertices: Float32Array) {
    ctx.useProgram(p)
    ctx.bindBuffer(ctx.ARRAY_BUFFER, buffer)
    ctx.bufferData(ctx.ARRAY_BUFFER, vertices, ctx.DYNAMIC_DRAW)
    ctx.enableVertexAttribArray(0)
    ctx.enableVertexAttribArray(1)
    ctx.vertexAttribPointer(0, 2, ctx.FLOAT, false, 16, 0)
    ctx.vertexAttribPointer(1, 2, ctx.FLOAT, false, 16, 8)
    ctx.drawArrays(ctx.TRIANGLES, 0, vertices.length / 4)
  }

  /** Binds texture `t` to `unit` and points sampler `name` of program `p` at it. */
  function bindImage(p: WebGLProgram, name: string, unit: number, t: WebGLTexture | null) {
    ctx.activeTexture(ctx.TEXTURE0 + unit)
    ctx.bindTexture(ctx.TEXTURE_2D, t)
    ctx.useProgram(p)
    ctx.uniform1i(uniform(p, name), unit)
  }

  /**
   * Appends a (possibly rotated) rectangle as two triangles.
   * @param cx - Centre x. @param cy - Centre y.
   * @param w - Half width. @param h - Half height.
   * @param angle - Rotation in radians about the centre.
   * @param uv - Texture rectangle `[u0, v0, u1, v1]`.
   */
  function pushQuad(out: number[], cx: number, cy: number, w: number, h: number, angle: number, uv: number[]) {
    const [u0, v0, u1, v1] = uv
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const corner = (dx: number, dy: number, u: number, v: number) => {
      out.push(cx + dx * cos - dy * sin, cy + dx * sin + dy * cos, u, v)
    }
    corner(-w, -h, u0, v0)
    corner(w, -h, u1, v0)
    corner(-w, h, u0, v1)
    corner(-w, h, u0, v1)
    corner(w, -h, u1, v0)
    corner(w, h, u1, v1)
  }

  /** Quarter turns to radians; 3 turns goes -90° so tiles take the short way home. */
  const turnAngle = (rot: number) => ((rot === 3 ? -1 : rot) * Math.PI) / 2
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t

  /**
   * Draws the style for `from`→`to` at eased progress `e` (0–1) into the bound
   * framebuffer. Geometry styles build vertex lists; full-screen styles set
   * uniforms on one of the full-screen programs.
   */
  function drawStyle(from: Scene, to: Scene, e: number) {
    ctx.clearColor(0, 0, 0, 1)
    ctx.clear(ctx.COLOR_BUFFER_BIT)
    const style = styleProgram!
    const set1 = (name: string, v: number) => ctx.uniform1f(uniform(style, name), v)
    const set2 = (name: string, a: number, b: number) => ctx.uniform2f(uniform(style, name), a, b)

    // Tile shuffle and rotated tiles: each source tile slides and turns from
    // its old cell/rotation to its new one.
    if (to.kind === "tiles" && from.kind === "tiles") {
      const g = to.grid
      const half = 0.5 / g
      const inset = image ? 0.5 / image.naturalWidth : 0
      const vertices: number[] = []
      to.tiles.forEach((tile, i) => {
        const a = from.tiles[i]
        const cx = (lerp(a.cellX, tile.cellX, e) + 0.5) / g
        const cy = (lerp(a.cellY, tile.cellY, e) + 0.5) / g
        const angle = lerp(turnAngle(a.rot), turnAngle(tile.rot), e)
        const sx = i % g
        const sy = Math.floor(i / g)
        pushQuad(vertices, cx, cy, half, half, angle, [
          sx / g + inset,
          sy / g + inset,
          (sx + 1) / g - inset,
          (sy + 1) / g - inset,
        ])
      })
      bindImage(tileProgram!, "u_image", 0, imageTexture)
      ctx.uniform1f(uniform(tileProgram!, "u_solid"), 0)
      draw(tileProgram!, new Float32Array(vertices))
      return
    }

    // Shredder: full-height strips slide sideways back into order.
    if (to.kind === "strips" && from.kind === "strips") {
      const n = to.slots.length
      const inset = image ? 0.5 / image.naturalWidth : 0
      const vertices: number[] = []
      to.slots.forEach((slot, i) => {
        const cx = (lerp(from.slots[i], slot, e) + 0.5) / n
        pushQuad(vertices, cx, 0.5, 0.5 / n, 0.5, 0, [i / n + inset, 0, (i + 1) / n - inset, 1])
      })
      bindImage(tileProgram!, "u_image", 0, imageTexture)
      ctx.uniform1f(uniform(tileProgram!, "u_solid"), 0)
      draw(tileProgram!, new Float32Array(vertices))
      return
    }

    // Shattered glass: each triangle is turned about its pivot and nudged;
    // the texture coordinates stay at its home corners.
    if (to.kind === "shards" && from.kind === "shards") {
      const vertices: number[] = []
      to.shards.forEach((shard, i) => {
        const a = from.shards[i]
        const rot = lerp(a.rot, shard.rot, e)
        const dx = lerp(a.dx, shard.dx, e)
        const dy = lerp(a.dy, shard.dy, e)
        const cos = Math.cos(rot)
        const sin = Math.sin(rot)
        for (let k = 0; k < 6; k += 2) {
          const x = shard.tri[k] - shard.pivotX
          const y = shard.tri[k + 1] - shard.pivotY
          vertices.push(
            shard.pivotX + x * cos - y * sin + dx,
            shard.pivotY + x * sin + y * cos + dy,
            shard.tri[k],
            shard.tri[k + 1],
          )
        }
      })
      bindImage(tileProgram!, "u_image", 0, imageTexture)
      ctx.uniform1f(uniform(tileProgram!, "u_solid"), 0)
      draw(tileProgram!, new Float32Array(vertices))
      return
    }

    if (drawCandidate(from, to, e) || drawExperiment(from, to, e)) return

    bindImage(style, "u_image", 0, imageTexture)
    set1("u_mode", 0)
    set1("u_px", 1 / size)

    if (to.kind === "twoTone" && from.kind === "twoTone") {
      set1("u_mode", 1)
      set2("u_levels", from.levels, to.levels)
      set2("u_bias", from.bias, to.bias)
      set1("u_mix", e)
    } else if (to.kind === "ripple" && from.kind === "ripple") {
      set1("u_mode", 2)
      set1("u_amp", lerp(from.amplitude, to.amplitude, e))
      set1("u_waves", lerp(from.waves, to.waves, e))
      // The waves travel during the transition and come back to the seeded phase.
      const swing = Math.sin(Math.PI * e) * Math.PI
      set2("u_phase", to.phaseX + swing, to.phaseY + swing)
    }
    draw(style, FULL_QUAD)

    if (to.kind === "hidden" && from.kind === "hidden") {
      // Black covers; opening tiles flip shut towards their left edge, staggered.
      const g = to.grid
      const vertices: number[] = []
      to.hidden.forEach((hidden, i) => {
        const local = easeInOut(Math.min(1, Math.max(0, (e - to.delay[i] * 0.4) / 0.6)))
        const cover = lerp(from.hidden[i] ? 1 : 0, hidden ? 1 : 0, local)
        if (cover <= 0) return
        const w = cover / g
        pushQuad(vertices, (i % g) / g + w / 2, (Math.floor(i / g) + 0.5) / g, w / 2, 0.5 / g, 0, [0, 0, 0, 0])
      })
      if (vertices.length) {
        ctx.useProgram(tileProgram!)
        ctx.uniform1f(uniform(tileProgram!, "u_solid"), 1)
        draw(tileProgram!, new Float32Array(vertices))
      }
    }
  }

  /** Full-screen candidate styles. Returns false when `to` isn't one. */
  function drawCandidate(from: Scene, to: Scene, e: number) {
    const modes: Partial<Record<Scene["kind"], number>> = {
      rings: 1,
      melt: 2,
      static: 3,
      fisheye: 4,
      tunnel: 5,
      negative: 6,
      kaleidoscope: 7,
      keyholes: 8,
    }
    const mode = modes[to.kind]
    if (!mode || from.kind !== to.kind) return false
    candidateProgram ??= program(CANDIDATE_FRAGMENT)
    const p = candidateProgram
    const set1 = (name: string, v: number) => ctx.uniform1f(uniform(p, name), v)
    const set2 = (name: string, a: number, b: number) => ctx.uniform2f(uniform(p, name), a, b)
    bindImage(p, "u_image", 0, imageTexture)
    set1("u_mode", mode)
    set1("u_px", 1 / size)

    if (to.kind === "rings" && from.kind === "rings") {
      // Each ring turns back towards its next angle, like a combination lock.
      set1("u_ringCount", to.angles.length)
      ctx.uniform1fv(uniform(p, "u_angles"), new Float32Array(to.angles.map((a, i) => lerp(from.angles[i], a, e))))
    } else if (to.kind === "melt" && from.kind === "melt") {
      ctx.uniform4fv(uniform(p, "u_phases"), new Float32Array(to.phases))
      set1("u_amount", lerp(from.amount, to.amount, e))
    } else if (to.kind === "static" && from.kind === "static") {
      bindImage(p, "u_noise", NOISE_UNIT, noiseTexture(to.seed))
      set1("u_amount", lerp(from.amount, to.amount, e))
    } else if (to.kind === "fisheye" && from.kind === "fisheye") {
      set2("u_center", to.centerX, to.centerY)
      set1("u_strength", lerp(from.strength, to.strength, e))
    } else if (to.kind === "tunnel" && from.kind === "tunnel") {
      set2("u_center", to.centerX, to.centerY)
      set1("u_strength", lerp(from.scale, to.scale, e))
      set1("u_twist", lerp(from.twist, to.twist, e))
    } else if (to.kind === "negative" && from.kind === "negative") {
      set2("u_tone", lerp(from.invert, to.invert, e), lerp(from.contrast, to.contrast, e))
    } else if (to.kind === "kaleidoscope" && from.kind === "kaleidoscope") {
      set1("u_amount", lerp(from.amount, to.amount, e))
      set1("u_segments", lerp(from.segments, to.segments, e))
      // The wedges turn during the transition and come back to the seeded angle.
      set2("u_spin", to.spin + Math.sin(Math.PI * e) * Math.PI * 0.5, to.source)
    } else if (to.kind === "keyholes" && from.kind === "keyholes") {
      const holes = new Float32Array(MAX_HOLES * 3)
      to.holes.forEach((h, i) => holes.set([h.x, h.y, lerp(from.holes[i].r, h.r, e)], i * 3))
      ctx.uniform3fv(uniform(p, "u_holes"), holes)
    }
    draw(p, FULL_QUAD)
    return true
  }

  /** Full-screen experiment styles. Returns false when `to` isn't one. */
  function drawExperiment(from: Scene, to: Scene, e: number) {
    const modes: Partial<Record<Scene["kind"], number>> = {
      echo: 1,
      slices: 2,
      liquid: 3,
      halftone: 4,
      dither: 5,
      ascii: 6,
      scanlines: 7,
      edges: 8,
      motionBlur: 9,
      mosaic: 10,
    }
    const mode = modes[to.kind]
    if (!mode || from.kind !== to.kind) return false
    experimentProgram ??= program(EXPERIMENT_FRAGMENT)
    const p = experimentProgram
    const set1 = (name: string, v: number) => ctx.uniform1f(uniform(p, name), v)
    bindImage(p, "u_image", 0, imageTexture)
    set1("u_mode", mode)
    set1("u_px", 1 / size)
    // Filter styles fade to the photo on the final reveal (see EXPERIMENT_FRAGMENT).
    set1("u_reveal", lerp(from.colour ? 1 : 0, to.colour ? 1 : 0, e))

    if (to.kind === "echo" && from.kind === "echo") {
      set1("u_amount", lerp(from.offset, to.offset, e))
      set1("u_angle", to.angle)
    } else if (to.kind === "slices" && from.kind === "slices") {
      // Bands slide back into line.
      set1("u_amount", lerp(from.shift, to.shift, e))
      set1("u_bandCount", to.offsets.length)
      const bands = new Float32Array(MAX_BANDS)
      bands.set(to.offsets)
      ctx.uniform1fv(uniform(p, "u_bands"), bands)
    } else if (to.kind === "liquid" && from.kind === "liquid") {
      set1("u_amount", lerp(from.amplitude, to.amplitude, e))
      // The waves flow during the transition and come back to the seeded phase.
      const swing = Math.sin(Math.PI * e) * Math.PI
      ctx.uniform4fv(uniform(p, "u_phases"), new Float32Array(to.phases.map((ph) => ph + swing)))
    } else if (to.kind === "halftone" && from.kind === "halftone") {
      set1("u_amount", lerp(from.cell, to.cell, e))
    } else if (to.kind === "dither" && from.kind === "dither") {
      set1("u_amount", lerp(from.cell, to.cell, e))
    } else if (to.kind === "ascii" && from.kind === "ascii") {
      bindImage(p, "u_glyphs", GLYPH_UNIT, glyphTexture())
      set1("u_amount", lerp(from.cell, to.cell, e))
    } else if (to.kind === "scanlines" && from.kind === "scanlines") {
      set1("u_amount", lerp(from.cover, to.cover, e))
      set1("u_lines", to.lines)
    } else if (to.kind === "edges" && from.kind === "edges") {
      set1("u_amount", lerp(from.threshold, to.threshold, e))
    } else if (to.kind === "motionBlur" && from.kind === "motionBlur") {
      set1("u_amount", lerp(from.length, to.length, e))
      set1("u_angle", to.angle)
    } else if (to.kind === "mosaic" && from.kind === "mosaic") {
      set1("u_amount", lerp(from.cell, to.cell, e))
    }
    draw(p, FULL_QUAD)
    return true
  }

  /**
   * Renders one frame of `from`→`to` at linear progress `p` (0–1).
   * Same-kind scenes interpolate inside the style pass; different kinds (or
   * reduced motion) render both and crossfade in the post pass.
   */
  function render(from: Scene, to: Scene, p: number, options: ShowOptions) {
    if (!image || !targets || ctx.isContextLost()) return
    const [a, b] = targets
    const e = easeInOut(p)
    const animated = options.transition !== "none"
    const crossfade = options.reduced || from.kind !== to.kind
    const final = options.transition === "final"

    ctx.viewport(0, 0, size, size)
    ctx.bindFramebuffer(ctx.FRAMEBUFFER, a.framebuffer)
    drawStyle(from, crossfade ? from : to, crossfade ? 0 : e)
    if (crossfade) {
      ctx.bindFramebuffer(ctx.FRAMEBUFFER, b.framebuffer)
      drawStyle(to, to, 0)
    }

    ctx.bindFramebuffer(ctx.FRAMEBUFFER, null)
    const post = postProgram!
    bindImage(post, "u_a", 1, a.texture)
    bindImage(post, "u_b", 2, crossfade ? b.texture : a.texture)
    const colourT = final && !options.reduced ? Math.min(1, Math.max(0, (p - 0.5) / 0.5)) : e
    ctx.uniform1f(uniform(post, "u_mix"), crossfade ? e : 0)
    ctx.uniform1f(
      uniform(post, "u_glitch"),
      animated && !options.reduced ? Math.sin(Math.PI * p) * (final ? 1 : 0.75) : 0,
    )
    ctx.uniform1f(uniform(post, "u_step"), Math.min(2, Math.floor(p * 3)))
    ctx.uniform1f(uniform(post, "u_dense"), final ? 1 : 0)
    ctx.uniform1f(uniform(post, "u_colour"), lerp(from.colour ? 1 : 0, to.colour ? 1 : 0, colourT))
    draw(post, FULL_QUAD)
  }

  const settled: ShowOptions = { transition: "none", reduced: false }
  const renderSettled = () => current && render(current, current, 1, settled)

  const onLost = (event: Event) => {
    event.preventDefault()
    animator.cancel()
  }
  const onRestored = () => {
    init()
    renderSettled()
  }
  canvas.addEventListener("webglcontextlost", onLost)
  canvas.addEventListener("webglcontextrestored", onRestored)

  init()

  return {
    kind: "webgl",
    setImage(img) {
      image = img
      uploadImage(img)
      renderSettled()
    },
    resize(next) {
      if (next === size && targets) return
      size = next
      canvas.width = canvas.height = size
      freeTargets()
      targets = [makeTarget(), makeTarget()]
      renderSettled()
    },
    show(scene, options) {
      const from = current
      current = scene
      if (!from || options.transition === "none" || !image) {
        animator.cancel()
        renderSettled()
        return
      }
      animator.run(
        TRANSITION_MS,
        (p) => render(from, scene, p, options),
        () => renderSettled(),
      )
    },
    destroy() {
      animator.cancel()
      canvas.removeEventListener("webglcontextlost", onLost)
      canvas.removeEventListener("webglcontextrestored", onRestored)
      // The context stays with the canvas (React may remount on it), so free what we made.
      freeTargets()
      if (imageTexture) ctx.deleteTexture(imageTexture)
      imageTexture = null
      if (noise) ctx.deleteTexture(noise.texture)
      noise = null
      if (glyphs) ctx.deleteTexture(glyphs)
      glyphs = null
    },
  }
}
