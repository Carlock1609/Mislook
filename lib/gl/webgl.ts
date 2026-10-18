// Plain WebGL 1 renderer: one pass draws the style, a second pass adds the
// transition glitch (slices + RGB split) and handles greyscale vs colour.

import { createAnimator, type Renderer, type ShowOptions, TRANSITION_MS } from "@/lib/gl/renderer"
import { easeInOut, type Scene } from "@/lib/gl/scene"

const VERTEX = `
attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos.x * 2.0 - 1.0, 1.0 - a_pos.y * 2.0, 0.0, 1.0);
}`

const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`

const TILE_FRAGMENT = `${PRECISION}
uniform sampler2D u_image;
uniform float u_solid;
varying vec2 v_uv;
void main() {
  gl_FragColor = u_solid > 0.5 ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(texture2D(u_image, v_uv).rgb, 1.0);
}`

// Keep the maths in step with posterize / rippleOffset / mirror in scene.ts.
const STYLE_FRAGMENT = `${PRECISION}
uniform sampler2D u_image;
uniform float u_mode;
uniform vec2 u_levels;
uniform vec2 u_bias;
uniform float u_mix;
uniform float u_amp;
uniform float u_waves;
uniform vec2 u_phase;
uniform float u_radius;
uniform vec2 u_focus;
uniform float u_px;
varying vec2 v_uv;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float mirror(float t) { return 1.0 - abs(1.0 - mod(t, 2.0)); }
vec3 poster(vec3 c, float levels, float bias) {
  if (levels < 1.5) return c;
  float cut = bias * 0.35;
  float x = clamp((luma(c) - cut) / (1.0 - cut), 0.0, 1.0);
  return vec3(min(floor(x * levels), levels - 1.0) / (levels - 1.0));
}

void main() {
  vec2 uv = v_uv;
  if (u_mode > 1.5 && u_mode < 2.5) {
    uv = vec2(
      mirror(uv.x + u_amp * sin(6.2831853 * u_waves * uv.y + u_phase.x)),
      mirror(uv.y + u_amp * sin(6.2831853 * u_waves * uv.x + u_phase.y))
    );
  }
  vec3 c = texture2D(u_image, uv).rgb;
  if (u_mode > 0.5 && u_mode < 1.5) {
    c = mix(poster(c, u_levels.x, u_bias.x), poster(c, u_levels.y, u_bias.y), u_mix);
  }
  if (u_mode > 2.5) {
    c *= 1.0 - smoothstep(u_radius - u_px, u_radius + u_px, distance(v_uv, u_focus));
  }
  gl_FragColor = vec4(c, 1.0);
}`

const POST_FRAGMENT = `${PRECISION}
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform float u_mix;
uniform float u_glitch;
uniform float u_step;
uniform float u_dense;
uniform float u_colour;
varying vec2 v_uv;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 frame(vec2 uv) {
  vec2 t = vec2(uv.x, 1.0 - uv.y);
  return mix(texture2D(u_a, t).rgb, texture2D(u_b, t).rgb, u_mix);
}

void main() {
  vec2 uv = v_uv;
  // Glitch slices: a few horizontal bands slide sideways. The pattern only
  // changes at u_step boundaries (3 per transition), never per frame.
  float bands = mix(14.0, 30.0, u_dense);
  float band = floor(uv.y * bands);
  float on = step(0.62 - u_dense * 0.17, hash(vec2(band, u_step + 1.0)));
  uv.x = clamp(uv.x + (hash(vec2(band + 7.0, u_step)) - 0.5) * 0.18 * u_glitch * on, 0.0, 1.0);

  // Chromatic split.
  float s = 0.014 * u_glitch * (1.0 + u_dense * 0.7);
  vec3 r = frame(uv + vec2(s, 0.0));
  vec3 g = frame(uv);
  vec3 b = frame(uv - vec2(s, 0.0));
  vec3 grey = vec3(luma(r), luma(g), luma(b));
  vec3 colour = vec3(r.r, g.g, b.b);
  gl_FragColor = vec4(mix(grey, colour, u_colour), 1.0);
}`

type Target = { texture: WebGLTexture; framebuffer: WebGLFramebuffer }

const FULL_QUAD = new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1])

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
  const uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>()

  function compile(type: number, source: string) {
    const shader = ctx.createShader(type)!
    ctx.shaderSource(shader, source)
    ctx.compileShader(shader)
    if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS) && !ctx.isContextLost()) {
      throw new Error(ctx.getShaderInfoLog(shader) ?? "shader compile failed")
    }
    return shader
  }

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

  function uniform(p: WebGLProgram, name: string) {
    const cache = uniforms.get(p)!
    if (!cache.has(name)) cache.set(name, ctx.getUniformLocation(p, name))
    return cache.get(name)!
  }

  function texture() {
    const t = ctx.createTexture()!
    ctx.bindTexture(ctx.TEXTURE_2D, t)
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR)
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR)
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE)
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE)
    return t
  }

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

  function init() {
    uniforms.clear()
    tileProgram = program(TILE_FRAGMENT)
    styleProgram = program(STYLE_FRAGMENT)
    postProgram = program(POST_FRAGMENT)
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

  function bindImage(p: WebGLProgram, name: string, unit: number, t: WebGLTexture | null) {
    ctx.activeTexture(ctx.TEXTURE0 + unit)
    ctx.bindTexture(ctx.TEXTURE_2D, t)
    ctx.useProgram(p)
    ctx.uniform1i(uniform(p, name), unit)
  }

  // Appends a (possibly rotated) square quad: centre (cx, cy), half-size h, angle in radians.
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

  const turnAngle = (rot: number) => ((rot === 3 ? -1 : rot) * Math.PI) / 2
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t

  /** Draws the style for `from`→`to` at eased progress `e` into the bound framebuffer. */
  function drawStyle(from: Scene, to: Scene, e: number) {
    ctx.clearColor(0, 0, 0, 1)
    ctx.clear(ctx.COLOR_BUFFER_BIT)
    const style = styleProgram!
    const set1 = (name: string, v: number) => ctx.uniform1f(uniform(style, name), v)
    const set2 = (name: string, a: number, b: number) => ctx.uniform2f(uniform(style, name), a, b)

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
    } else if (to.kind === "darkness" && from.kind === "darkness") {
      set1("u_mode", 3)
      set1("u_radius", lerp(from.radius, to.radius, e))
      set2("u_focus", to.focusX, to.focusY)
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
    ctx.uniform1f(uniform(post, "u_glitch"), animated && !options.reduced ? Math.sin(Math.PI * p) * (final ? 1 : 0.75) : 0)
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
    },
  }
}
