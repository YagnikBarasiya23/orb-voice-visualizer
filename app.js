import Orb from './orb.js';

const $ = selector => document.querySelector(selector);
const orb = new Orb($('#orb'));
const status = $('#status');

const setState = state => {
  orb.setState(state);
  document.querySelectorAll('[data-state]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.state === state)));
};
document.querySelectorAll('[data-state]').forEach(button => button.addEventListener('click', () => setState(button.dataset.state)));

// Real microphone: the orb reacts to your voice while listening.
$('#mic').addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    orb.listenTo(stream);
    orb.setLevel(null);
    setState('listening');
    status.textContent = 'Listening to your microphone. Nothing is recorded or sent anywhere.';
  } catch {
    status.textContent = 'Microphone access was blocked. Try the simulated conversation instead.';
  }
});

// Scripted conversation with a speech-like level envelope, so the demo works without audio.
let talking = 0;
$('#talk').addEventListener('click', () => {
  if (talking) return;
  const script = [['listening', 2600], ['thinking', 1600], ['speaking', 3200], ['idle', 800]];
  const lines = {
    listening: 'You: “Plan a post for Saturday.”',
    thinking: 'Thinking…',
    speaking: 'Assistant: “Here is a Saturday post with a student offer.”',
    idle: '',
  };
  let i = 0;
  const started = performance.now();
  const envelope = () => {
    const t = (performance.now() - started) / 1000;
    const syllables = Math.abs(Math.sin(t * 9) * Math.sin(t * 2.3 + 1));
    orb.setLevel(orb.state === 'listening' || orb.state === 'speaking' ? 0.15 + syllables * 0.7 : 0);
    talking = requestAnimationFrame(envelope);
  };
  const next = () => {
    if (i === script.length) {
      cancelAnimationFrame(talking);
      talking = 0;
      orb.setLevel(null);
      status.textContent = '';
      return;
    }
    const [state, ms] = script[i++];
    setState(state);
    status.textContent = lines[state];
    setTimeout(next, ms);
  };
  envelope();
  next();
});

const palettes = {
  default: undefined,
  sunset: ['#ff5f6d', '#ffc371'],
  mint: ['#2fd3a7', '#4c8dff'],
  mono: ['#d4d4d8', '#52525b'],
};
$('#palette').addEventListener('change', event => orb.setColors(palettes[event.target.value]));
