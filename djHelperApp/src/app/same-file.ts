export function isSameFile(first: File, second: File): boolean {
  return (
    first === second ||
    (first.name === second.name &&
      first.size === second.size &&
      first.lastModified === second.lastModified)
  );
}
