import type { SplitDirection, WorkspaceLayoutNode, WorkspaceLeafNode, WorkspaceSplitNode } from "./workspace-types";

export const createLeafNode = (threadId: string): WorkspaceLeafNode => ({
  type: "leaf",
  threadId,
});

export const createSplitNode = (
  direction: SplitDirection,
  first: WorkspaceLayoutNode,
  second: WorkspaceLayoutNode
): WorkspaceSplitNode => ({
  type: "split",
  direction,
  first,
  second,
});

export const isLeafNode = (node: WorkspaceLayoutNode): node is WorkspaceLeafNode => node.type === "leaf";

export const hasThreadInLayout = (layout: WorkspaceLayoutNode | null, threadId: string): boolean => {
  if (!layout) {
    return false;
  }

  if (isLeafNode(layout)) {
    return layout.threadId === threadId;
  }

  return hasThreadInLayout(layout.first, threadId) || hasThreadInLayout(layout.second, threadId);
};

export const getFirstThreadId = (layout: WorkspaceLayoutNode | null): string | null => {
  if (!layout) {
    return null;
  }

  if (isLeafNode(layout)) {
    return layout.threadId;
  }

  return getFirstThreadId(layout.first) ?? getFirstThreadId(layout.second);
};

export const collectLayoutThreadIds = (layout: WorkspaceLayoutNode | null): string[] => {
  if (!layout) {
    return [];
  }

  if (isLeafNode(layout)) {
    return [layout.threadId];
  }

  return [...collectLayoutThreadIds(layout.first), ...collectLayoutThreadIds(layout.second)];
};

export const collectSplitThreadIds = (layout: WorkspaceLayoutNode | null): Set<string> => {
  const result = new Set<string>();

  const visit = (node: WorkspaceLayoutNode | null, insideSplit: boolean) => {
    if (!node) {
      return;
    }

    if (isLeafNode(node)) {
      if (insideSplit) {
        result.add(node.threadId);
      }
      return;
    }

    visit(node.first, true);
    visit(node.second, true);
  };

  visit(layout, false);
  return result;
};

export const removeThreadFromLayout = (
  layout: WorkspaceLayoutNode | null,
  threadId: string
): WorkspaceLayoutNode | null => {
  if (!layout) {
    return null;
  }

  if (isLeafNode(layout)) {
    return layout.threadId === threadId ? null : layout;
  }

  const nextFirst = removeThreadFromLayout(layout.first, threadId);
  const nextSecond = removeThreadFromLayout(layout.second, threadId);

  if (!nextFirst && !nextSecond) {
    return null;
  }

  if (!nextFirst) {
    return nextSecond;
  }

  if (!nextSecond) {
    return nextFirst;
  }

  return createSplitNode(layout.direction, nextFirst, nextSecond);
};

export const replaceLeafWithSplit = (
  layout: WorkspaceLayoutNode | null,
  targetThreadId: string,
  direction: SplitDirection,
  incomingNode: WorkspaceLayoutNode
): WorkspaceLayoutNode | null => {
  if (!layout) {
    return null;
  }

  if (isLeafNode(layout)) {
    if (layout.threadId !== targetThreadId) {
      return layout;
    }

    return createSplitNode(direction, layout, incomingNode);
  }

  const nextFirst = replaceLeafWithSplit(layout.first, targetThreadId, direction, incomingNode);
  const nextSecond = replaceLeafWithSplit(layout.second, targetThreadId, direction, incomingNode);

  if (nextFirst === layout.first && nextSecond === layout.second) {
    return layout;
  }

  return createSplitNode(layout.direction, nextFirst ?? layout.first, nextSecond ?? layout.second);
};

export const normalizeLayout = (
  layout: WorkspaceLayoutNode | null,
  validThreadIds: Set<string>
): WorkspaceLayoutNode | null => {
  const seenThreadIds = new Set<string>();

  const visit = (node: WorkspaceLayoutNode | null): WorkspaceLayoutNode | null => {
    if (!node) {
      return null;
    }

    if (isLeafNode(node)) {
      if (!validThreadIds.has(node.threadId) || seenThreadIds.has(node.threadId)) {
        return null;
      }

      seenThreadIds.add(node.threadId);
      return node;
    }

    const nextFirst = visit(node.first);
    const nextSecond = visit(node.second);

    if (!nextFirst && !nextSecond) {
      return null;
    }

    if (!nextFirst) {
      return nextSecond;
    }

    if (!nextSecond) {
      return nextFirst;
    }

    return createSplitNode(node.direction, nextFirst, nextSecond);
  };

  return visit(layout);
};
