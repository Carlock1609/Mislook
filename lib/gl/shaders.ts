/**
 * @file GLSL ES 1.0 sources for the WebGL renderer (`webgl.ts`).
 *
 * Every program shares one vertex shader. Positions arrive as [0, 1] image
 * coordinates with y down (the same space as `u, v` in scene.ts) and are
 * flipped into clip space here.
 *
 * The fragment shaders mirror the pure maths in scene.ts so the Canvas 2D
 * fallback draws the same settled stages. When you change one, change the other.
 *
 * Programs:
 * - TILE: draws textured quads/triangles (tile shuffle, rotated tiles,
 *   shredder, shattered glass) or solid black covers (hidden tiles).
 * - STYLE: full-screen v1 styles (two-tone, ripple).
 * - CANDIDATE: full-screen test-panel candidates. Compiled lazily.
 * - EXPERIMENT: full-screen test-panel experiments. Compiled lazily.
 * - POST: transition glitch (slices + RGB split) and greyscale vs colour.
 */

import { ASCII_GLYPHS, BLUR_TAPS, EDGE_STEP, MAX_BANDS, MAX_HOLES, MAX_RINGS } from "@/lib/gl/scene"

const maxBands = MAX_BANDS
const glyphs = ASCII_GLYPHS.length
const edgeStep = EDGE_STEP
const taps = BLUR_TAPS

/** Shared vertex shader: a_pos in image space (y down), a_uv passed through. */
export const VERTEX = `
attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos.x * 2.0 - 1.0, 1.0 - a_pos.y * 2.0, 0.0, 1.0);
}`

/** Highest float precision the fragment stage supports. */
const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`

/**
 * Textured pieces. Anything sampled outside the image (a shard pushed past the
 * edge) is black rather than a smeared edge pixel. `u_solid` draws black covers.
 */
export const TILE_FRAGMENT = `${PRECISION}
uniform sampler2D u_image;
uniform float u_solid;
varying vec2 v_uv;
void main() {
  bool off = any(lessThan(v_uv, vec2(0.0))) || any(greaterThan(v_uv, vec2(1.0)));
  gl_FragColor = u_solid > 0.5 || off ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(texture2D(u_image, v_uv).rgb, 1.0);
}`

/**
 * v1 full-screen styles. `u_mode`: 0 plain, 1 two-tone, 2 ripple.
 * Keep in step with posterize / rippleOffset / mirror in scene.ts.
 */
export const STYLE_FRAGMENT = `${PRECISION}
uniform sampler2D u_image;
uniform float u_mode;
uniform vec2 u_levels;
uniform vec2 u_bias;
uniform float u_mix;
uniform float u_amp;
uniform float u_waves;
uniform vec2 u_phase;
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
  gl_FragColor = vec4(c, 1.0);
}`

/**
 * Test-panel candidates, in their own program so the v1 shader stays small and
 * a device that can't compile this one still plays the v1 styles.
 *
 * `u_mode`: 1 ring lock, 2 melt, 3 static, 4 fisheye, 5 tunnel, 6 negative,
 * 7 kaleidoscope, 8 keyholes. Keep in step with the *Source / drip / negate
 * functions in scene.ts.
 *
 * GLSL ES 1.0 only guarantees constant indices into uniform arrays in fragment
 * shaders, so ring lock loops over every ring and picks the matching one.
 */
export const CANDIDATE_FRAGMENT = `${PRECISION}
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

/**
 * Test-panel experiments (the outside list of distortion ideas). Compiled
 * lazily, like the candidates.
 *
 * `u_mode`: 1 RGB split, 2 slice glitch, 3 liquid warp, 4 halftone,
 * 5 ordered dither, 6 ASCII, 7 scanlines, 8 edges, 9 motion blur, 10 mosaic.
 * Keep in step with the *Value / *Source functions in scene.ts.
 *
 * `u_reveal` (0–1) fades the filter styles to the plain photo on the final
 * reveal, because their settings don't relax to "no effect" by themselves.
 */
export const EXPERIMENT_FRAGMENT = `${PRECISION}
uniform sampler2D u_image;
uniform sampler2D u_glyphs;
uniform float u_mode;
uniform float u_amount;
uniform float u_angle;
uniform float u_bands[${maxBands}];
uniform float u_bandCount;
uniform vec4 u_phases;
uniform float u_lines;
uniform float u_reveal;
uniform float u_px;
varying vec2 v_uv;

const float TAU = 6.2831853;
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float lumaAt(vec2 p) { return luma(texture2D(u_image, p).rgb); }
float mirror(float t) { return 1.0 - abs(1.0 - mod(t, 2.0)); }
vec2 mirror2(vec2 p) { return vec2(mirror(p.x), mirror(p.y)); }
// 2x2 Bayer [[0, 2], [3, 1]] and the 4x4 built from it (see bayer4 in scene.ts).
float bayer2(float a, float b) { return mod(2.0 * a + 3.0 * b, 4.0); }
float bayer4(vec2 q) {
  return 4.0 * bayer2(mod(q.x, 2.0), mod(q.y, 2.0)) + bayer2(mod(floor(q.x / 2.0), 2.0), mod(floor(q.y / 2.0), 2.0));
}
// Luma at the centre of the cell-sized block holding uv.
float blockLuma(vec2 uv, float cell) { return lumaAt(clamp((floor(uv / cell) + 0.5) * cell, 0.0, 1.0)); }

void main() {
  vec2 uv = v_uv;
  vec3 photo = texture2D(u_image, uv).rgb;
  vec3 c = photo;
  float filtered = 0.0;

  if (u_mode < 1.5) {
    // RGB split, seen in greyscale: three equal copies along a seeded direction.
    vec2 d = vec2(cos(u_angle), sin(u_angle)) * u_amount;
    c = (texture2D(u_image, mirror2(uv - d)).rgb + photo + texture2D(u_image, mirror2(uv + d)).rgb) / 3.0;
  } else if (u_mode < 2.5) {
    // Slice glitch: each band slides by its own offset and wraps around.
    float band = min(u_bandCount - 1.0, floor(uv.y * u_bandCount));
    float offset = 0.0;
    for (int i = 0; i < ${maxBands}; i++) if (float(i) == band) offset = u_bands[i];
    c = texture2D(u_image, vec2(fract(uv.x + offset * u_amount), uv.y)).rgb;
  } else if (u_mode < 3.5) {
    // Liquid warp: nested sine waves.
    float dx = sin(TAU * (2.3 * uv.y + 0.6 * sin(TAU * 1.7 * uv.x + u_phases.x)) + u_phases.y);
    float dy = sin(TAU * (2.1 * uv.x + 0.6 * sin(TAU * 1.9 * uv.y + u_phases.z)) + u_phases.w);
    c = texture2D(u_image, mirror2(uv + u_amount * vec2(dx, dy))).rgb;
  } else if (u_mode < 4.5) {
    // Halftone: dots on a 45-degree grid, radius from the cell centre's brightness.
    float r = 0.70710678;
    vec2 q = uv - 0.5;
    vec2 p = vec2(q.x * r - q.y * r, q.x * r + q.y * r) / u_amount;
    vec2 cc = floor(p) + 0.5;
    vec2 s = 0.5 + vec2(cc.x * r + cc.y * r, -cc.x * r + cc.y * r) * u_amount;
    float radius = lumaAt(clamp(s, 0.0, 1.0)) * r;
    float edge = u_px / u_amount;
    filtered = 1.0 - smoothstep(radius - edge, radius + edge, length(p - cc));
  } else if (u_mode < 5.5) {
    // Ordered dither: one Bayer-thresholded black or white pixel per cell.
    vec2 q = floor(uv / u_amount);
    filtered = step((bayer4(q) + 0.5) / 16.0, blockLuma(uv, u_amount));
  } else if (u_mode < 6.5) {
    // ASCII: brighter cells get denser glyphs from the atlas (one row of ${glyphs} glyphs).
    float glyph = min(${glyphs.toFixed(1)} - 1.0, floor(blockLuma(uv, u_amount) * ${glyphs.toFixed(1)}));
    vec2 local = fract(uv / u_amount);
    filtered = texture2D(u_glyphs, vec2((glyph + local.x) / ${glyphs.toFixed(1)}, local.y)).r;
  } else if (u_mode < 7.5) {
    // Scanlines: dark bands covering u_amount of each row.
    filtered = fract(uv.y * u_lines) < u_amount ? 0.0 : luma(photo);
  } else if (u_mode < 8.5) {
    // Edges only: Sobel magnitude over a fixed step, white above the threshold.
    float s = ${edgeStep.toFixed(6)};
    float tl = lumaAt(clamp(uv + vec2(-s, -s), 0.0, 1.0));
    float t = lumaAt(clamp(uv + vec2(0.0, -s), 0.0, 1.0));
    float tr = lumaAt(clamp(uv + vec2(s, -s), 0.0, 1.0));
    float l = lumaAt(clamp(uv + vec2(-s, 0.0), 0.0, 1.0));
    float r = lumaAt(clamp(uv + vec2(s, 0.0), 0.0, 1.0));
    float bl = lumaAt(clamp(uv + vec2(-s, s), 0.0, 1.0));
    float b = lumaAt(clamp(uv + vec2(0.0, s), 0.0, 1.0));
    float br = lumaAt(clamp(uv + vec2(s, s), 0.0, 1.0));
    float gx = tr + 2.0 * r + br - tl - 2.0 * l - bl;
    float gy = bl + 2.0 * b + br - tl - 2.0 * t - tr;
    filtered = smoothstep(u_amount, u_amount + 0.15, length(vec2(gx, gy)));
  } else if (u_mode < 9.5) {
    // Motion blur: ${taps} taps along a seeded direction.
    vec2 d = vec2(cos(u_angle), sin(u_angle)) * u_amount;
    vec3 sum = vec3(0.0);
    for (int i = 0; i < ${taps}; i++) {
      float t = float(i) / ${(taps - 1).toFixed(1)} - 0.5;
      sum += texture2D(u_image, mirror2(uv + d * t)).rgb;
    }
    c = sum / ${taps.toFixed(1)};
  } else {
    // Mosaic: flat blocks.
    filtered = blockLuma(uv, u_amount);
  }

  // Filter styles (4 to 8 and 10) output one grey value, faded to the photo on the final reveal.
  bool isFilter = (u_mode > 3.5 && u_mode < 8.5) || u_mode > 9.5;
  if (isFilter) c = mix(vec3(filtered), photo, u_reveal);
  gl_FragColor = vec4(c, 1.0);
}`

/**
 * Final pass over the style's framebuffer(s): crossfade between two
 * framebuffers when the style kind changes, glitch slices and RGB split during
 * transitions, then greyscale or colour.
 */
export const POST_FRAGMENT = `${PRECISION}
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
