/**
 * MongoDB/Go-based tools on Windows can mis-parse backslash sequences in paths
 * (e.g. `\t` in `\temp\...`). Forward slashes are accepted for Win32 paths.
 */
export function pathForCliArg(filePath: string): string {
  if (process.platform === 'win32') {
    return filePath.replace(/\\/g, '/');
  }
  return filePath;
}
