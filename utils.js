export const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));
export function time(seconds) {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(n / 3600), m = Math.floor(n % 3600 / 60), s = n % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
export function size(bytes) { return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(1)} MB`; }
export function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function fingerprint(file) { return `${file.name}:${file.size}:${file.lastModified || 0}`; }
export function validAudio(file) { return /\.(mp3|m4a|m4b|aac|wav|ogg|flac)$/i.test(file.name) || file.type.startsWith('audio/'); }
export function progress(book) { return book.duration ? clamp(book.position / book.duration * 100, 0, 100) : 0; }
export function filterBooks(books, {query = '', filter = 'all', favorites = false, sort = 'recent'} = {}) {
  const q = query.trim().toLocaleLowerCase('pt-BR');
  return books.filter(b => (!favorites || b.favorite) && (!q || `${b.title} ${b.author} ${b.filename}`.toLocaleLowerCase('pt-BR').includes(q)) && (filter === 'all' || (filter === 'finished' ? b.finished : b.position > 0 && !b.finished))).sort((a,b) => sort === 'title' ? a.title.localeCompare(b.title, 'pt-BR') : b.addedAt - a.addedAt);
}
