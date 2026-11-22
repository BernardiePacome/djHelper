export function isSameFile(first: File, second: File): boolean {
  return (
    first === second ||
    (first.name === second.name &&
      first.size === second.size &&
      first.lastModified === second.lastModified)
  );
}

// Files re-fetched from the server or the mock API get a fresh modification time, so identity is name and size.
export function isSameAudio(first: File, second: File): boolean {
  return first === second || (first.name === second.name && first.size === second.size);
}
