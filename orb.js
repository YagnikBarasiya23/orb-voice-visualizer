/*!
 * Orb — a voice agent visualiser. MIT © 2026 Yagnik Barasiya
 * https://github.com/YagnikBarasiya23/orb-voice-visualizer
 */

/**
 * Motion per state. `speed` is how fast the surface noise flows, `displace`
 * how deep it cuts, `glow` the halo strength and `react` how much audio moves it.
 */
export const STATES = {
  idle: { speed: 0.35, displace: 0.1, glow: 0.25, react: 0.3 },
  listening: { speed: 0.9, displace: 0.16, glow: 0.45, react: 1 },
  thinking: { speed: 2.2, displace: 0.2, glow: 0.35, react: 0.2 },
  speaking: { speed: 1.2, displace: 0.14, glow: 0.55, react: 1 },
};

export const DEFAULT_COLORS = {
  idle: ['#4c8dff', '#a06bff'],
  listening: ['#2e8cff', '#2fd3a7'],
  thinking: ['#a06bff', '#ff5fa2'],
  speaking: ['#ff5fa2', '#ffb347'],
};

/** Root mean square of a signal in −1…1. */
export function rms(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (const v of samples) sum += v * v;
  return Math.sqrt(sum / samples.length);
}

/**
 * Loudness 0–1 from an AnalyserNode byte buffer, where 128 is silence. Speech
 * sits around 0.05–0.25 RMS, so it is scaled up by `gain` and clamped.
 */
export function levelFromBytes(bytes, gain = 4) {
  if (!bytes.length) return 0;
  let sum = 0;
  for (const b of bytes) {
    const v = (b - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / bytes.length) * gain);
}

/** One step of a damped spring (critically damped by default: damping ≈ 2√stiffness). */
export function stepSpring(state, target, dt, stiffness = 170, damping = 26) {
  const v = state.v + (stiffness * (target - state.x) - damping * state.v) * dt;
  return { x: state.x + v * dt, v };
}

const lerp = (a, b, t) => a + (b - a) * t;

/** Blends two parameter sets; numbers and number arrays are interpolated. */
export function blendParams(from, to, t) {
  const k = Math.min(1, Math.max(0, t));
  const out = {};
  for (const key of Object.keys(to)) {
    const a = from[key];
    const b = to[key];
    out[key] = Array.isArray(b) ? b.map((v, i) => lerp(a[i], v, k)) : lerp(a, b, k);
  }
  return out;
}

/** '#4c8dff' or '#48f' → [r, g, b] in 0–1. */
export function parseColor(hex) {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!match) throw new TypeError(`Orb: "${hex}" is not a hex colour`);
  let h = match[1];
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
}

/** An array colours every state; an object overrides the defaults per state. */
export function resolveColors(colors) {
  if (Array.isArray(colors)) return Object.fromEntries(Object.keys(STATES).map(state => [state, colors]));
  return { ...DEFAULT_COLORS, ...(colors ?? {}) };
}

const LABELS = {
  idle: 'Assistant is idle',
  listening: 'Assistant is listening',
  thinking: 'Assistant is thinking',
  speaking: 'Assistant is speaking',
};
const BLEND_MS = 400;

const VERTEX = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

// Ray-marched sphere displaced by 3D value noise, lit with a rim term and a two-colour band.
const FRAGMENT = `precision highp float;
uniform vec2 uRes;uniform float uPhase,uAmp,uDisp,uGlow;uniform vec3 uC1,uC2;
float hash(vec3 p){p=fract(p*.3183+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p*=2.;a*=.5;}return v;}
float map(vec3 p){float r=1.+uAmp*.12;return length(p)-r-(uDisp+uAmp*.2)*(fbm(p*1.8+vec3(0.,0.,uPhase))-.5)*2.;}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*uRes)/min(uRes.x,uRes.y);
  vec3 ro=vec3(0.,0.,4.4),rd=normalize(vec3(uv*1.15,-1.5));
  float t=0.;bool hit=false;
  for(int i=0;i<64;i++){float d=map(ro+rd*t);if(d<.002){hit=true;break;}t+=d*.7;if(t>7.)break;}
  if(hit){
    vec3 p=ro+rd*t;vec2 e=vec2(.002,0.);
    vec3 n=normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));
    float rim=pow(1.-max(dot(n,-rd),0.),2.5);
    float band=fbm(p*2.5+uPhase*.4);
    vec3 col=mix(uC1,uC2,band)*(.35+.65*max(dot(n,normalize(vec3(.5,.8,.6))),0.))+rim*mix(uC2,vec3(1.),.4)*1.3;
    gl_FragColor=vec4(col,1.);
  }else{
    float l=length(uv);float g=exp(-7.*max(l-.36,0.))*(uGlow*.6+uAmp*.5)*(1.-smoothstep(.4,.5,l));
    g=clamp(g,0.,1.);
    gl_FragColor=vec4(uC1*g,g);
  }
}`;

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const mediaSources = new WeakMap(); // an <audio> can only be wrapped once per AudioContext

export default class Orb {
  #raf = 0;
  #last = 0;
  #visible = true;
  #from;
  #blendStart = 0;
  #level = { x: 0, v: 0 };
  #manual = null;
  #phase = 0;
  #analysers = { listening: null, speaking: null };
  #nodes = [];
  #audio = null;

  constructor(el, options = {}) {
    this.el = el;
    this.colors = resolveColors(options.colors);
    this.state = STATES[options.state] ? options.state : 'idle';
    this.params = this.#target(this.state);
    this.#from = this.params;

    el.classList.add('orb');
    el.setAttribute('role', 'img');
    el.dataset.state = this.state;
    this.#label();

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'orb-canvas';
    el.append(this.canvas);
    this.gl = this.#initGL();
    if (!this.gl) {
      this.canvas.remove();
      this.canvas = null;
      el.classList.add('orb--fallback');
      this.blob = document.createElement('div');
      this.blob.className = 'orb-blob';
      el.append(this.blob);
    }

    this.resizer = new ResizeObserver(() => this.#size());
    this.resizer.observe(el);
    this.observer = new IntersectionObserver(([entry]) => {
      this.#visible = entry.isIntersecting;
      this.#wake();
    });
    this.observer.observe(el);
    this.onVisibility = () => this.#wake();
    document.addEventListener('visibilitychange', this.onVisibility);

    this.#size();
    this.#wake();
  }

  setState(state) {
    if (!STATES[state]) throw new TypeError(`Orb: unknown state "${state}"`);
    if (state === this.state) return;
    this.#from = this.params;
    this.#blendStart = performance.now();
    this.state = state;
    this.el.dataset.state = state;
    this.#label();
  }

  setColors(colors) {
    this.colors = resolveColors(colors);
    this.#from = this.params;
    this.#blendStart = performance.now();
  }

  /** Manual amplitude 0–1, e.g. from a realtime API. `null` hands control back to the analysers. */
  setLevel(level) {
    this.#manual = level == null ? null : Math.min(1, Math.max(0, level));
  }

  /** The user's microphone moves the orb while it is listening. */
  listenTo(stream) {
    const ctx = this.#context();
    this.#analysers.listening = this.#analyse(ctx.createMediaStreamSource(stream), false);
  }

  /** The agent's voice moves the orb while it is speaking. An <audio> element stays audible. */
  speakFrom(source) {
    const ctx = this.#context();
    if (typeof MediaStream !== 'undefined' && source instanceof MediaStream) {
      this.#analysers.speaking = this.#analyse(ctx.createMediaStreamSource(source), false);
      return;
    }
    let node = mediaSources.get(source);
    if (!node) {
      node = ctx.createMediaElementSource(source);
      mediaSources.set(source, node);
    }
    this.#analysers.speaking = this.#analyse(node, true);
  }

  destroy() {
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    this.resizer.disconnect();
    this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const node of this.#nodes) node.disconnect();
    this.#audio?.close();
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas?.remove();
    this.blob?.remove();
    this.el.classList.remove('orb', 'orb--fallback');
    this.el.removeAttribute('role');
    this.el.removeAttribute('aria-label');
    delete this.el.dataset.state;
  }

  #label() {
    this.el.setAttribute('aria-label', LABELS[this.state]);
  }

  #target(state) {
    const motion = { ...STATES[state] };
    if (reduced()) {
      motion.speed *= 0.25;
      motion.displace *= 0.5;
    }
    const [a, b] = this.colors[state];
    return { ...motion, c1: parseColor(a), c2: parseColor(b) };
  }

  #context() {
    this.#audio ??= new AudioContext();
    if (this.#audio.state === 'suspended') this.#audio.resume();
    return this.#audio;
  }

  #analyse(node, audible) {
    const analyser = this.#audio.createAnalyser();
    analyser.fftSize = 1024;
    node.connect(analyser);
    if (audible) analyser.connect(this.#audio.destination);
    this.#nodes.push(node, analyser);
    return { analyser, buffer: new Uint8Array(analyser.fftSize) };
  }

  #rawLevel() {
    if (this.#manual != null) return this.#manual;
    const source = this.#analysers[this.state];
    if (!source) return 0;
    source.analyser.getByteTimeDomainData(source.buffer);
    return levelFromBytes(source.buffer);
  }

  #initGL() {
    const gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) return null;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    this.uniforms = Object.fromEntries(
      ['uRes', 'uPhase', 'uAmp', 'uDisp', 'uGlow', 'uC1', 'uC2'].map(name => [name, gl.getUniformLocation(program, name)]),
    );
    return gl;
  }

  #size() {
    if (!this.canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(this.el.clientWidth * dpr));
    const height = Math.max(1, Math.round(this.el.clientHeight * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  #wake() {
    if (this.#raf || !this.#visible || document.hidden) return;
    this.#last = performance.now();
    this.#raf = requestAnimationFrame(this.#frame);
  }

  #frame = now => {
    if (!this.#visible || document.hidden) {
      this.#raf = 0;
      return;
    }
    const dt = Math.min(0.05, (now - this.#last) / 1000);
    this.#last = now;

    const k = ease(Math.min(1, (now - this.#blendStart) / BLEND_MS));
    this.params = blendParams(this.#from, this.#target(this.state), k);
    this.#level = stepSpring(this.#level, this.#rawLevel() * this.params.react, dt);
    const amp = Math.max(0, this.#level.x);
    this.#phase += dt * this.params.speed;

    if (this.gl) this.#draw(amp);
    else this.#drawFallback(amp);
    this.#raf = requestAnimationFrame(this.#frame);
  };

  #draw(amp) {
    const { gl, uniforms: u, params } = this;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uPhase, this.#phase);
    gl.uniform1f(u.uAmp, amp);
    gl.uniform1f(u.uDisp, params.displace);
    gl.uniform1f(u.uGlow, params.glow);
    gl.uniform3fv(u.uC1, params.c1);
    gl.uniform3fv(u.uC2, params.c2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  #drawFallback(amp) {
    const css = rgb => `rgb(${rgb.map(v => Math.round(v * 255)).join(' ')})`;
    this.blob.style.setProperty('--orb-level', amp.toFixed(3));
    this.blob.style.setProperty('--orb-c1', css(this.params.c1));
    this.blob.style.setProperty('--orb-c2', css(this.params.c2));
  }
}
