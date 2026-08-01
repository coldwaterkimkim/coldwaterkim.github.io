export function moveItemById(items, itemId, direction) {
  if (!Array.isArray(items)) return false;

  const step = Math.sign(Number(direction) || 0);
  const currentIndex = items.findIndex(item => item?.id === itemId);
  const nextIndex = currentIndex + step;
  if (step === 0 || currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) return false;

  const [item] = items.splice(currentIndex, 1);
  items.splice(nextIndex, 0, item);
  return true;
}
