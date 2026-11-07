// Only the part of React's scheduler the test setup uses; the package ships no types.
declare module 'scheduler' {
  export const unstable_NormalPriority: number
  export function unstable_scheduleCallback(priority: number, callback: () => void): unknown
}
