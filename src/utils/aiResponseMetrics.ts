export type AiResponseTiming = { startedAt?: number; finishedAt?: number; firstTextAt?: number };
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
/** Client-observed elapsed time and final-response output throughput, not provider billing. */
export function formatAiResponseMetrics(timing: AiResponseTiming, outputTokens?: number): string[] {
  const parts: string[] = [];
  if (!positive(timing.startedAt) || !positive(timing.finishedAt) || timing.finishedAt <= timing.startedAt) return parts;
  parts.push(`耗时 ${((timing.finishedAt - timing.startedAt) / 1000).toFixed(1)} 秒`);
  if (positive(timing.firstTextAt) && timing.firstTextAt >= timing.startedAt && timing.finishedAt > timing.firstTextAt && positive(outputTokens)) {
    const seconds = (timing.finishedAt - timing.firstTextAt) / 1000;
    // Sub-millisecond/invalid windows must not become Infinity or a fabricated rate.
    if (seconds >= 0.001) parts.push(`${(outputTokens / seconds).toFixed(1)} tokens/s`);
  }
  return parts;
}
