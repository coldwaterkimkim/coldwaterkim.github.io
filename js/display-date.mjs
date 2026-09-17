const formatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: '2-digit', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: '2-digit', hourCycle: 'h23',
});
export function displayDate(value) {
  if (!value) return '';
  const raw = String(value);
  // A date-only record has no recorded time; do not invent midnight.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-');
    return `${year.slice(-2)}년 ${Number(month)}월 ${Number(day)}일`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const p = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${p.year}년 ${p.month}월 ${p.day}일 ${Number(p.hour)<12?'오전':'오후'} ${Number(p.hour)%12||12}:${p.minute}`;
}
