/**
 * WebGL2 liquid-glass refraction pass.
 *
 * Receives the dirty-rect crop of the desktop behind the dock (BGRA already
 * converted to RGBA in Rust) and applies:
 *   * edge-curvature refraction: SDF-driven UV displacement along the pill
 *     bevel, so wallpapers and moving windows visibly bend inside the rim,
 *   * micro chromatic dispersion (per-channel offsets at the rim),
 *   * a crisp top specular highlight,
 *   * frosted saturation boost.
 *
 * The pass runs only when a new frame arrives; while the desktop behind the
 * dock is idle Rust sends nothing and no draw call happens.
 */

const VERTEX_SHADER = `#version 300 es
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D uBackdrop;
uniform vec2 uResolution;
uniform float uRadius;
uniform float uDispersion;
uniform float uSpecular;
uniform float uSaturation;
uniform float uOpacity;

out vec4 fragColor;

float sdRoundRect(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = gl_FragCoord.xy - 0.5 * uResolution;
  vec2 halfSize = 0.5 * uResolution - 1.0;
  float radius = min(uRadius, min(halfSize.x, halfSize.y));

  float d = sdRoundRect(p, halfSize, radius);

  // 1 at the bevel, 0 in the centre.
  float rim = 1.0 - clamp(-d / max(1.0, radius * 0.9), 0.0, 1.0);
  rim = pow(rim, 1.6);

  // Gradient of the SDF gives the inward surface normal of the bevel.
  vec2 eps = vec2(1.0, 0.0);
  float dx = sdRoundRect(p + eps.xy, halfSize, radius) - sdRoundRect(p - eps.xy, halfSize, radius);
  float dy = sdRoundRect(p + eps.yx, halfSize, radius) - sdRoundRect(p - eps.yx, halfSize, radius);
  vec2 n = normalize(vec2(dx, dy) + 1e-5);

  // Snell's-law-ish bend: strongest at the edge, zero in the middle.
  vec2 offset = n * rim * 0.05;

  vec2 texUv = vec2(uv.x, 1.0 - uv.y) + offset;

  // Micro chromatic dispersion along the bevel.
  float disp = uDispersion * rim * 0.012;
  vec3 col;
  col.r = texture(uBackdrop, texUv + n * disp).r;
  col.g = texture(uBackdrop, texUv).g;
  col.b = texture(uBackdrop, texUv - n * disp).b;

  // Frosted saturation.
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, uSaturation);

  // Crisp 1px specular rim, biased to the top edge.
  float band = smoothstep(1.6, 0.0, abs(d));
  float topBias = mix(0.25, 1.0, pow(clamp(uv.y, 0.0, 1.0), 4.0));
  col += band * topBias * uSpecular;

  // Anti-aliased rounded mask so the canvas matches the pill exactly.
  float alpha = clamp(-d, 0.0, 1.0) * uOpacity;

  fragColor = vec4(col, alpha);
}`;

export interface RefractionSettings {
  radius: number;
  dispersion: number;
  specular: number;
  saturation: number;
  opacity: number;
}

const DEFAULTS: RefractionSettings = {
  radius: 18,
  dispersion: 1,
  specular: 0.22,
  saturation: 1.35,
  opacity: 0.72,
};

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("glacier: shader compile failed:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export class LiquidRefraction {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private settings: RefractionSettings = { ...DEFAULTS };
  private pending: { data: Uint8Array; width: number; height: number } | null = null;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      depth: false,
      stencil: false,
    });
    if (!gl) return;
    this.gl = gl;

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("glacier: program link failed:", gl.getProgramInfoLog(program));
      return;
    }
    this.program = program;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const attr = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(attr);
    gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);

    for (const name of [
      "uBackdrop",
      "uResolution",
      "uRadius",
      "uDispersion",
      "uSpecular",
      "uSaturation",
      "uOpacity",
    ]) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  get supported(): boolean {
    return this.program !== null;
  }

  setSettings(next: Partial<RefractionSettings>) {
    this.settings = { ...this.settings, ...next };
  }

  resize(width: number, height: number, dpr = window.devicePixelRatio || 1) {
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  /** Queue the newest crop; drawn on the next `render()`. */
  uploadFrame(data: Uint8Array, width: number, height: number) {
    this.pending = { data, width, height };
  }

  render() {
    const gl = this.gl;
    const program = this.program;
    const texture = this.texture;
    if (!gl || !program || !texture || this.disposed) return;

    if (this.pending) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.pending.width,
        this.pending.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.pending.data,
      );
      this.pending = null;
    }

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.uniforms.uBackdrop ?? null, 0);
    gl.uniform2f(
      this.uniforms.uResolution ?? null,
      this.canvas.width,
      this.canvas.height,
    );

    const dpr = window.devicePixelRatio || 1;
    const s = this.settings;
    gl.uniform1f(this.uniforms.uRadius ?? null, s.radius * dpr);
    gl.uniform1f(this.uniforms.uDispersion ?? null, s.dispersion);
    gl.uniform1f(this.uniforms.uSpecular ?? null, s.specular);
    gl.uniform1f(this.uniforms.uSaturation ?? null, s.saturation);
    gl.uniform1f(this.uniforms.uOpacity ?? null, s.opacity);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose() {
    this.disposed = true;
    this.gl?.getExtension("WEBGL_lose_context")?.loseContext();
    this.gl = null;
    this.program = null;
    this.texture = null;
  }
}
