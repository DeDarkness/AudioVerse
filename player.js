import { getAudio, patchBook } from './db.js';
import { clamp } from './utils.js';

export class AudioPlayer extends EventTarget {
  constructor(audio = document.createElement('audio')) {
    super();
    this.audio = audio;
    audio.preload = 'metadata';
    audio.setAttribute('playsinline','');
    audio.id = 'native-audio';
    audio.hidden = true;
    document.body.append(audio);
    this.book = null; this.url = null; this.loading = false; this.token = 0;
    this.sleepDeadline = 0; this.lastSave = 0; this.pendingPosition = null;
    this.rate = Number(localStorage.getItem('audioverse-rate')) || 1;
    if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch {} }
    const syncMetadata = () => {
      if (!this.book) return;
      if (Number.isFinite(audio.duration)) this.book.duration = audio.duration;
      if (this.pendingPosition !== null && Number.isFinite(audio.duration)) { audio.currentTime = clamp(this.pendingPosition,0,audio.duration); this.pendingPosition = null; }
      audio.playbackRate = this.rate;
      this.save(); this.updateSession(); this.emit();
    };
    for (const event of ['loadedmetadata','durationchange','canplay']) audio.addEventListener(event,syncMetadata);
    audio.addEventListener('timeupdate', () => {
      this.checkSleep();
      if (this.book && this.pendingPosition === null) this.book.position = audio.currentTime;
      if (Date.now() - this.lastSave >= 5000) this.save();
      this.updateSession(); this.emit('tick');
    });
    for (const event of ['play','pause','ratechange','seeked','ended']) audio.addEventListener(event, () => {
      if (this.book && this.pendingPosition === null) this.book.position = audio.currentTime;
      if (event === 'ended' && this.book) this.book.finished = true;
      if (event === 'play') this.checkSleep();
      this.save(); this.updateSession(); this.emit();
    });
    audio.addEventListener('error', () => {
      if (audio.error) { audio.pause(); this.fail('Não foi possível reproduzir este formato. Experimente um arquivo MP3 ou M4A válido.'); this.emit(); }
    });
    document.addEventListener('visibilitychange', () => { this.checkSleep(); this.save(); });
    window.addEventListener('pagehide', () => this.save());
    this.installMediaSession();
  }
  emit(type = 'change') { this.dispatchEvent(new Event(type)); }
  fail(message) { this.dispatchEvent(new CustomEvent('problem',{detail:message})); }
  async select(book, autoplay = false) {
    if (this.loading) return;
    if (this.book?.id === book.id) { if (autoplay) await this.play(); return; }
    this.loading = true; this.emit();
    const token = ++this.token;
    try {
      const blob = await getAudio(book.id);
      if (!blob) throw new Error('O arquivo não foi encontrado neste aparelho. Importe-o novamente.');
      if (token !== this.token) return;
      this.audio.pause(); await this.save();
      this.audio.removeAttribute('src'); this.audio.load();
      if (this.url) URL.revokeObjectURL(this.url);
      this.book = {...book};
      const restart = book.finished && autoplay;
      this.pendingPosition = restart ? 0 : book.position;
      if (restart) { this.book.finished = false; this.book.position = 0; }
      this.url = URL.createObjectURL(blob);
      this.audio.src = this.url;
      this.audio.playbackRate = this.rate;
      localStorage.setItem('audioverse-last', book.id);
      this.setMetadata(); this.audio.load();
      if (autoplay) await this.play();
    } catch (error) { this.fail(error.message); }
    finally { this.loading = false; this.emit(); }
  }
  async play() {
    if (!this.book) return;
    try {
      if (this.audio.ended || this.book.finished) { this.audio.currentTime = 0; this.book.position = 0; this.book.finished = false; }
      await this.audio.play();
    } catch (error) { this.fail(error.name === 'NotAllowedError' ? 'Áudio preparado. Toque em Reproduzir para começar.' : 'Não foi possível iniciar o áudio. Confira o arquivo e toque em Reproduzir.'); }
  }
  toggle() { if (this.audio.paused) return this.play(); this.audio.pause(); }
  seek(position) {
    if (!this.book || this.pendingPosition !== null || !Number.isFinite(this.audio.duration)) return;
    this.audio.currentTime = clamp(position,0,this.audio.duration);
    this.book.position = this.audio.currentTime; this.book.finished = false;
    this.save(); this.updateSession(); this.emit('tick');
  }
  setRate(rate) { this.rate = clamp(rate,.5,3); this.audio.playbackRate = this.rate; localStorage.setItem('audioverse-rate',this.rate); this.updateSession(); this.emit(); }
  async save() {
    if (!this.book) return;
    this.lastSave = Date.now();
    const {id,position,duration,finished} = this.book;
    try { await patchBook(id,{position:position || 0, duration:duration || 0, finished:!!finished, lastPlayedAt:Date.now()}); }
    catch { this.fail('Não foi possível salvar a posição. Confira o espaço disponível no aparelho.'); }
  }
  async clear() {
    ++this.token;
    this.audio.pause(); await this.save();
    this.book = null; this.pendingPosition = null;
    this.setSleep(0);
    this.audio.removeAttribute('src'); this.audio.load();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    localStorage.removeItem('audioverse-last');
    if (navigator.mediaSession) { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none'; }
    this.emit();
  }
  setSleep(minutes) {
    clearTimeout(this.sleepTimeout);
    this.sleepDeadline = minutes > 0 ? Date.now() + minutes * 60000 : 0;
    if (this.sleepDeadline) this.sleepTimeout = setTimeout(() => this.checkSleep(), minutes * 60000);
    this.emit();
  }
  checkSleep() {
    if (this.sleepDeadline && Date.now() >= this.sleepDeadline) {
      this.sleepDeadline = 0; this.audio.pause(); clearTimeout(this.sleepTimeout); this.emit();
      this.dispatchEvent(new Event('sleepended'));
    }
  }
  setMetadata() {
    if (!navigator.mediaSession || !globalThis.MediaMetadata || !this.book) return;
    navigator.mediaSession.metadata = new MediaMetadata({title:this.book.title, artist:this.book.author, album:'AudioVerse', artwork:[{src:new URL('./icons/icon-512.png',import.meta.url).href,sizes:'512x512',type:'image/png'}]});
  }
  updateSession() {
    const s = navigator.mediaSession;
    if (!s || !this.book) return;
    s.playbackState = this.audio.paused ? 'paused' : 'playing';
    if (s.setPositionState && Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
      try { s.setPositionState({duration:this.audio.duration, playbackRate:this.rate, position:clamp(this.audio.currentTime,0,this.audio.duration)}); } catch {}
    }
  }
  installMediaSession() {
    if (!navigator.mediaSession) return;
    const handlers = {play:() => this.play(),pause:() => this.audio.pause(),stop:() => { this.audio.pause(); this.seek(0); },seekbackward:d => this.seek(this.audio.currentTime-(d.seekOffset || 15)),seekforward:d => this.seek(this.audio.currentTime+(d.seekOffset || 15)),seekto:d => this.seek(d.seekTime)};
    for (const [name,handler] of Object.entries(handlers)) { try { navigator.mediaSession.setActionHandler(name,handler); } catch {} }
  }
}
