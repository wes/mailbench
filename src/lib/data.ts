/**
 * Everything the site shows, read from the repository at build time: client
 * definitions from clients/, runs from results/, metric definitions from
 * schema/metrics.json. Nothing here is typed in by hand — a number on the site
 * is a number in a summary.json, which CI regenerates from the raw output.
 */

import metricsFile from '../../schema/metrics.json';

export const REPO = 'https://github.com/wes/mailbench';
export const SITE = 'https://mailben.ch';

export type MetricKey = 'open' | 'next' | 'search' | 'launch' | 'quit' | 'scroll' | 'memory' | 'cpu' | 'sync' | 'disk';

export type Metric = {
  key: MetricKey;
  title: string;
  what: string;
  unit: 'ms' | 'MB' | '%' | 's';
  decimals?: number;
  /** Timed from the screen, so quantised by the display's refresh. */
  screen: boolean;
  /** For a timed metric not read off the screen: how finely the instrument can tell two times apart. */
  resolution_ms?: number;
  /** False for a number that is listed but never ranked. */
  ranked?: boolean;
};

export const METRICS = metricsFile.metrics as Metric[];

export type Caveat = { metric?: MetricKey; text: string };

export type Client = {
  id: string;
  name: string;
  vendor?: string;
  homepage?: string;
  platform: 'macos';
  source: 'open' | 'closed';
  maintainers: string[];
  vendor_maintained: boolean;
  install?: string;
  app: { path?: string; bundle_id?: string; app_name?: string; process?: string; window_title?: string };
  account?: string[];
  parity?: string[];
  reset?: string[];
  store?: string;
  layout: {
    status: 'verified' | 'unverified' | 'missing';
    verified?: { version: string; os: string; date: string };
    note?: string;
  };
  caveats?: Caveat[];
};

export type MetricValue = {
  value: number;
  first?: number;
  runs?: number;
  captured?: number;
  method?: string;
  ratio?: number;
  bytes_down?: number;
};

export type ClientResult = {
  id: string;
  name: string;
  tag?: string;
  version: string | null;
  measured_on: string | null;
  metrics: Partial<Record<MetricKey, MetricValue>>;
};

export type Summary = {
  run: string;
  source: 'raw' | 'imported';
  display_hz: number | null;
  calibration?: {
    rows: { asked_ms: number; fired_ms: number; read_ms: number; overhead_ms: number }[];
    overhead_ms: number;
  };
  clients: ClientResult[];
};

export type Note = { title: string; body: string; clients?: string[]; metric?: MetricKey };

export type Run = {
  id: string;
  date: string;
  corpus: { version: string; name: string; messages: number; digest: string | null; verified: boolean; note?: string };
  machine: {
    name: string;
    model_id?: string | null;
    cpu: string;
    cores?: number | null;
    memory_gb?: number | null;
    os: string;
    display?: string | null;
    display_hz: number;
    power?: 'ac' | 'battery' | null;
  };
  harness: { version: string; window?: string; runs?: number; search_term?: string };
  submitted_by: string;
  affiliations: string[];
  source: { kind: 'harness' | 'imported'; url?: string; note?: string };
  calibration?: { overhead_ms?: number; floor_ms?: number; note?: string };
  parity?: Record<string, { full: boolean; held?: string; note?: string }>;
  notes?: Note[];
  summary: Summary;
};

const clientFiles = import.meta.glob('../../clients/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Client
>;
const runFiles = import.meta.glob('../../results/*/run.json', { eager: true, import: 'default' }) as Record<
  string,
  Omit<Run, 'summary'>
>;
const summaryFiles = import.meta.glob('../../results/*/summary.json', { eager: true, import: 'default' }) as Record<
  string,
  Summary
>;

export const CLIENTS: Client[] = Object.entries(clientFiles)
  .filter(([path]) => !path.split('/').pop()!.startsWith('_'))
  .map(([, c]) => c)
  .sort((a, b) => a.name.localeCompare(b.name));

const clientById = new Map(CLIENTS.map((c) => [c.id, c]));
export const getClient = (id: string) => clientById.get(id);

/** Newest first; on the same day, the bigger mailbox first. */
export const RUNS: Run[] = Object.entries(runFiles)
  .map(([path, run]) => {
    const summary = summaryFiles[path.replace(/run\.json$/, 'summary.json')];
    if (!summary) throw new Error(`${path}: no summary.json beside it`);
    return { ...run, summary } as Run;
  })
  .sort((a, b) => b.date.localeCompare(a.date) || b.corpus.messages - a.corpus.messages);

const runById = new Map(RUNS.map((r) => [r.id, r]));
export const getRun = (id: string) => runById.get(id);

/**
 * What the home page leads with: the most recent run of each corpus size, by
 * date alone. A rule rather than a choice, so nobody picks which results are
 * the headline.
 */
export const latestByCorpus = (): Run[] => {
  const seen = new Map<string, Run>();
  for (const run of RUNS) if (!seen.has(run.corpus.name)) seen.set(run.corpus.name, run);
  return [...seen.values()].sort((a, b) => a.corpus.messages - b.corpus.messages);
};

/* ------------------------------------------------------------ formatting */

export const formatValue = (value: number, metric: Metric): string => {
  if (metric.unit === '%') return `${value.toFixed(metric.decimals ?? 1)}%`;
  if (metric.unit === 's') return `${value < 10 ? value.toFixed(1) : Math.round(value).toLocaleString('en-US')} s`;
  return `${Math.round(value).toLocaleString('en-US')} ${metric.unit}`;
};

export const formatDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    ...(d ? { day: 'numeric' } : {}),
    timeZone: 'UTC',
  });
};

export const messages = (n: number) => n.toLocaleString('en-US');

export const displayName = (r: Pick<ClientResult, 'name' | 'tag'>) => (r.tag ? `${r.name} @${r.tag}` : r.name);

export const rawUrl = (run: Run, file = '') =>
  `${REPO}/tree/main/results/${run.id}${file ? `/${file}` : ''}`;

/* ------------------------------------------------------------ comparison */

/**
 * The tie window for a metric in a run: how far apart two results must be for
 * the instrument to tell them apart. One display frame for a number read off
 * the screen; the polling interval for one that is polled; nothing for the
 * rest.
 */
export const tieWindow = (metric: Metric, run: Run): number =>
  metric.screen && run.machine.display_hz ? 1000 / run.machine.display_hz : (metric.resolution_ms ?? 0);

export type Ranked = {
  result: ClientResult;
  value: MetricValue;
  best: boolean;
  rank: number;
};

/**
 * One metric across a run's clients, lowest first. Every client within the tie
 * window of the lowest counts as best — a 7 ms lead inside a 17 ms frame is
 * not a lead. Rank is 1 + the number of clients strictly better by more than
 * the window, so tied clients share a rank.
 */
export const rank = (run: Run, metric: Metric): Ranked[] => {
  const rows = run.summary.clients
    .map((result) => ({ result, value: result.metrics[metric.key] }))
    .filter((r): r is { result: ClientResult; value: MetricValue } => r.value !== undefined)
    .sort((a, b) => a.value.value - b.value.value || a.result.name.localeCompare(b.result.name));
  if (rows.length === 0) return [];
  const window = tieWindow(metric, run);
  const min = rows[0]!.value.value;
  return rows.map((r) => ({
    ...r,
    best: r.value.value - min <= window,
    rank: 1 + rows.filter((o) => r.value.value - o.value.value > window).length,
  }));
};

/**
 * A metric is charted in a run only when at least two clients were measured,
 * by the same method. One client's number is not a comparison, and putting it
 * in a chart reads as one.
 */
export const comparable = (run: Run, metric: Metric): boolean => {
  if (metric.ranked === false) return false;
  const values = run.summary.clients.map((c) => c.metrics[metric.key]).filter(Boolean) as MetricValue[];
  if (values.length < 2) return false;
  return new Set(values.map((v) => v.method ?? '')).size === 1;
};

/** Caveats that bear on one client's number for one metric in one run. */
export const caveatsFor = (run: Run, clientId: string, metric: MetricKey): string[] => {
  const out: string[] = [];
  for (const c of getClient(clientId)?.caveats ?? []) if (c.metric === metric) out.push(c.text);
  for (const n of run.notes ?? [])
    if (n.metric === metric && n.clients?.includes(clientId)) out.push(`${n.title} ${n.body}`);
  return out;
};

export const partial = (run: Run, clientId: string) => run.parity?.[clientId]?.full === false;

export const affiliationText = (run: Run): string | null => {
  if (run.affiliations.length === 0) return null;
  const names = run.affiliations.map((id) => getClient(id)?.name ?? id);
  return `works on ${names.join(' and ')}`;
};
