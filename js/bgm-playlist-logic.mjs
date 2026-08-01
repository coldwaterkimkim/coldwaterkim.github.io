export function randomBgmTrackIndex(length, currentIndex = -1, random = Math.random) {
  const trackCount = Math.max(0, Math.floor(Number(length) || 0));
  if (trackCount === 0) return -1;
  if (trackCount === 1) return 0;

  const previousIndex = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < trackCount
    ? currentIndex
    : -1;
  const candidateCount = previousIndex === -1 ? trackCount : trackCount - 1;
  const randomValue = Math.max(0, Math.min(Number(random()) || 0, 1 - Number.EPSILON));
  const candidate = Math.floor(randomValue * candidateCount);

  return previousIndex !== -1 && candidate >= previousIndex ? candidate + 1 : candidate;
}
