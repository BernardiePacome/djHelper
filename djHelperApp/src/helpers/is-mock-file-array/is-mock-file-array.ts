import { MockFileArray } from '../../interfaces/mock-file';

export function isMockFileArray(value: unknown): value is MockFileArray {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('files' in value) ||
    !Array.isArray(value.files)
  ) {
    return false;
  }

  return value.files.every(
    (file) =>
      typeof file === 'object' &&
      file !== null &&
      'name' in file &&
      typeof file.name === 'string' &&
      'url' in file &&
      typeof file.url === 'string' &&
      'type' in file &&
      typeof file.type === 'string',
  );
}
