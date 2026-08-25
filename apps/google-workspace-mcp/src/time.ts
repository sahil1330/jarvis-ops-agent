export function assertIncreasingRange(start: string, end: string, startName: string, endName: string): void {
  if (new Date(end) <= new Date(start)) {
    throw new Error(`${endName} must be later than ${startName}`);
  }
}
