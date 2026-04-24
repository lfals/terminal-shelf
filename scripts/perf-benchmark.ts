import { createLeafNode, replaceLeafWithSplit, collectSplitThreadIds, normalizeLayout } from "../src/lib/workspace-layout";
import type { WorkspaceLayoutNode } from "../src/lib/workspace-types";

type Sample = {
  name: string;
  ms: number;
};

const RUNS = 20;
const THREADS = 300;
const FIND_LOOKUPS = 10_000;
const SERIALIZE_THREADS = 1_000;

const nowMs = () => Number(process.hrtime.bigint()) / 1_000_000;

const bench = (name: string, fn: () => void): Sample => {
  const start = nowMs();
  fn();
  return { name, ms: nowMs() - start };
};

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const p95 = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
};

const buildLayout = (threadCount: number) => {
  let layout: WorkspaceLayoutNode = createLeafNode("thread-0");
  for (let index = 1; index < threadCount; index += 1) {
    layout = replaceLeafWithSplit(layout, `thread-${index - 1}`, index % 2 === 0 ? "vertical" : "horizontal", createLeafNode(`thread-${index}`)) ?? layout;
  }
  return layout;
};

const buildThreads = (threadCount: number) =>
  Array.from({ length: threadCount }, (_, index) => ({
    id: `thread-${index}`,
    projectId: `project-${index % 20}`,
    title: `Terminal ${index}`,
    status: "running" as const,
  }));

const run = () => {
  const layout = buildLayout(THREADS);
  const validIds = new Set(Array.from({ length: THREADS }, (_, index) => `thread-${index}`));
  const threads = buildThreads(THREADS);
  const threadMap = new Map(threads.map((thread) => [thread.id, thread]));
  const lookupIds = Array.from({ length: FIND_LOOKUPS }, (_, index) => `thread-${index % THREADS}`);
  const storeLikePayload = {
    groups: Array.from({ length: 40 }, (_, index) => ({ id: `group-${index}`, name: `Group ${index}` })),
    projects: Array.from({ length: 200 }, (_, index) => ({
      id: `project-${index}`,
      groupId: index % 2 === 0 ? `group-${index % 40}` : null,
      name: `Project ${index}`,
      path: `/tmp/project-${index}`,
    })),
    threads: Array.from({ length: SERIALIZE_THREADS }, (_, index) => ({
      id: `thread-${index}`,
      projectId: `project-${index % 200}`,
      title: `Terminal ${index}`,
      status: "running",
      updatedAt: new Date().toISOString(),
    })),
    activeThreadId: "thread-0",
    layout,
  };

  const series = {
    normalizeLayout: [] as number[],
    collectSplitThreadIds: [] as number[],
    arrayFindLookups: [] as number[],
    mapLookups: [] as number[],
    serializeStore: [] as number[],
  };

  for (let runIndex = 0; runIndex < RUNS; runIndex += 1) {
    series.normalizeLayout.push(
      bench("normalizeLayout", () => {
        normalizeLayout(layout, validIds);
      }).ms
    );
    series.collectSplitThreadIds.push(
      bench("collectSplitThreadIds", () => {
        collectSplitThreadIds(layout);
      }).ms
    );
    series.arrayFindLookups.push(
      bench("arrayFindLookups", () => {
        for (const lookupId of lookupIds) {
          threads.find((thread) => thread.id === lookupId);
        }
      }).ms
    );
    series.mapLookups.push(
      bench("mapLookups", () => {
        for (const lookupId of lookupIds) {
          threadMap.get(lookupId);
        }
      }).ms
    );
    series.serializeStore.push(
      bench("serializeStore", () => {
        JSON.stringify(storeLikePayload);
      }).ms
    );
  }

  const result = Object.entries(series).map(([name, samples]) => ({
    name,
    avg: average(samples),
    p95: p95(samples),
  }));

  console.log("Performance benchmark (local synthetic)");
  for (const item of result) {
    console.log(`${item.name}: avg=${item.avg.toFixed(2)}ms p95=${item.p95.toFixed(2)}ms`);
  }
};

run();
