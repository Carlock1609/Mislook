// Plain WebGL 1 renderer: one pass draws the style, a second pass adds the
// transition glitch (slices + RGB split) and handles greyscale vs colour.

import { createAnimator, type Renderer, type ShowOptions, TRANSITION_MS } from "@/lib/gl/renderer"
import { easeInOut, MAX_HOLES, MAX_RINGS, NOISE_SIZE, type Scene, staticNoise } from "@/lib/gl/scene"

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
  bool off = any(lessThan(v_uv, vec2(0.0))) || any(greaterThan(v_uv, vec2(1.0)));
  gl_FragColor = u_solid > 0.5 || off ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(texture2D(u_image, v_uv).rgb, 1.0);
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

// Test-panel candidate styles, in their own program so the v1 shader stays small.
// Keep the maths in step with the *Source / drip / negate functions in scene.ts.
const CANDIDATE_FRAGMENT = `${PRECISION}
uniform sampler2D u_image;
uniform sampler2D u_noise;
uniform float u_mode;
uniform float u_angles[${MAX_RINGS}];
uniform float u_ringCount;
uniform vec4 u_phases;
uniform float u_amount;
uniform vec2 u_center;
uniform float u_strength;
uniform float u_twist;
uniform float u_segments;
uniform vec2 u_spin;
uniform vec3 u_holes[${MAX_HOLES}];
uniform vec2 u_tone;
uniform float u_px;
varying vec2 v_uv;

const float TAU = 6.2831853;
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float mirror(float t) { return 1.0 - abs(1.0 - mod(t, 2.0)); }
bool inside(vec2 p) { return p.x >= 0.0 && p.x <= 1.0 && p.y >= 0.0 && p.y <= 1.0; }
vec2 turn(vec2 q, float a) { float c = cos(a); float s = sin(a); return vec2(q.x * c - q.y * s, q.x * s + q.y * c); }
float drip(float u) {
  float t = TAU * u;
  float spikes = pow(0.5 + 0.5 * sin(29.0 * t + u_phases.w), 8.0);
  return clamp(0.3 + 0.22 * sin(3.0 * t + u_phases.x) + 0.16 * sin(7.0 * t + u_phases.y)
    + 0.12 * sin(17.0 * t + u_phases.z) + 0.5 * spikes, 0.0, 1.0);
}

void main() {
  vec2 uv = v_uv;
  float keep = 1.0;
  if (u_mode < 1.5) {
    // Ring lock
    vec2 q = uv - 0.5;
    float ring = min(u_ringCount - 1.0, floor(length(q) / (0.70710678 / u_ringCount)));
    float a = 0.0;
    for (int i = 0; i < ${MAX_RINGS}; i++) if (float(i) == ring) a = u_angles[i];
    uv = 0.5 + turn(q, a);
    if (!inside(uv)) keep = 0.0;
  } else if (u_mode < 2.5) {
    // Melt
    uv.y = max(0.0, uv.y - u_amount * drip(uv.x));
  } else if (u_mode > 3.5 && u_mode < 4.5) {
    // Fisheye
    vec2 q = uv - u_center;
    float r = length(q) / 0.8;
    if (r < 1.0 && r > 0.0) uv = u_center + q * pow(r, u_strength);
  } else if (u_mode > 4.5 && u_mode < 5.5) {
    // Tunnel
    if (u_strength >= 0.02) {
      for (int i = 0; i < 16; i++) {
        vec2 n = u_center + turn(uv - u_center, -u_twist) / u_strength;
        if (!inside(n)) break;
        uv = n;
      }
    }
  } else if (u_mode > 6.5 && u_mode < 7.5) {
    // Kaleidoscope
    vec2 q = uv - 0.5;
    float wedge = TAU / u_segments;
    float a = mod(atan(q.y, q.x) + u_spin.x, wedge);
    if (a > wedge * 0.5) a = wedge - a;
    a += u_spin.y;
    vec2 k = 0.5 + length(q) * vec2(cos(a), sin(a));
    uv = vec2(mirror(mix(uv.x, k.x, u_amount)), mirror(mix(uv.y, k.y, u_amount)));
  }

  vec3 c = texture2D(u_image, uv).rgb * keep;
  if (u_mode > 2.5 && u_mode < 3.5) {
    // Static: frozen noise, never animated.
    c = mix(c, vec3(texture2D(u_noise, v_uv).r), u_amount);
  } else if (u_mode > 5.5 && u_mode < 6.5) {
    // Negative
    c = 0.5 + (mix(c, 1.0 - c, u_tone.x) - 0.5) * u_tone.y;
  } else if (u_mode > 7.5) {
    // Keyholes
    float open = 0.0;
    for (int i = 0; i < ${MAX_HOLES}; i++) {
      vec3 h = u_holes[i];
      if (h.z > 0.0) open = max(open, 1.0 - smoothstep(h.z - u_px, h.z + u_px, distance(v_uv, h.xy)));
    }
    c *= open;
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

const NOISE_UNIT = 3

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
  // Compiled on first use, so a device that can't build it still plays the v1 styles.
  let candidateProgram: WebGLProgram | null = null
  let noise: { seed: string; texture: WebGLTexture } | null = null
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
    candidateProgram = null
    noise = null
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
          vertices.push(shard.pivotX + x * cos - y * sin + dx, shard.pivotY + x * sin + y * cos + dy, shard.tri[k], shard.tri[k + 1])
        }
      })
      bindImage(tileProgram!, "u_image", 0, imageTexture)
      ctx.uniform1f(uniform(tileProgram!, "u_solid"), 0)
      draw(tileProgram!, new Float32Array(vertices))
      return
    }

    if (drawCandidate(from, to, e)) return

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
      if (noise) ctx.deleteTexture(noise.texture)
      noise = null
    },
  }
}
