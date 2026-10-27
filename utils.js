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
export function isRead(book) { return book.readStatus === 'read' || (book.readStatus !== 'unread' && !!book.finished); }
export function filenameMetadata(name) {
  const stem=name.replace(/\.[^.]+$/, '').replace(/[_]+/g,' ');
  const named=/^(.{1,100}?) - (.+)$/.exec(stem);
  const author=named ? named[1] : 'Áudio pessoal', title=named ? named[2] : stem;
  const part=/^(.+) - Parte (\d+) de (\d+)$/i.exec(title);
  return {title,author,...(part && Number(part[2])>0 && Number(part[2])<=Number(part[3]) ? {seriesKey:`${author}|${part[1]}`,partIndex:Number(part[2]),partCount:Number(part[3])} : {})};
}
export function filterBooks(books, {query = '', filter = 'all', favorites = false, sort = 'recent'} = {}) {
  const q = query.trim().toLocaleLowerCase('pt-BR');
  const groupDates=new Map();
  for(const book of books)if(book.seriesKey)groupDates.set(book.seriesKey,Math.max(groupDates.get(book.seriesKey)||0,book.addedAt));
  return books.filter(b => (!favorites || b.favorite) && (!q || `${b.title} ${b.author} ${b.filename}`.toLocaleLowerCase('pt-BR').includes(q)) && (filter === 'all' || (filter === 'finished' ? isRead(b) : filter === 'unread' ? !isRead(b) : b.position > 0 && !isRead(b)))).sort((a,b) => {
    if(a.seriesKey && a.seriesKey===b.seriesKey)return a.partIndex-b.partIndex;
    return sort==='title' ? a.title.localeCompare(b.title,'pt-BR') : ((groupDates.get(b.seriesKey)||b.addedAt)-(groupDates.get(a.seriesKey)||a.addedAt)) || a.title.localeCompare(b.title,'pt-BR');
  });
}
