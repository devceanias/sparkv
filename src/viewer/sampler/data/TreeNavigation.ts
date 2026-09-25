import FlatThreadVirtualNode from '../node/FlatThreadVirtualNode';
import SourceThreadVirtualNode from '../node/SourceThreadVirtualNode';
import VirtualNode from '../node/VirtualNode';

export interface TreeEntry {
    node: VirtualNode;
    parent?: TreeEntry;
    children: TreeEntry[];
    depth: number;
    total: number;
    self: number | null;
    owner?: string;
    category?: FrameCategory;
}

export type FrameCategory = 'plugin' | 'minecraft' | 'server' | 'jvm';

export function frameCategory(
    node: VirtualNode,
    pluginSources?: Set<string>
): FrameCategory | undefined {
    const source = node.getSource();
    if (source && (!pluginSources || pluginSources.has(source.toLowerCase())))
        return 'plugin';
    const details = node.getDetails();
    if (details.type !== 'stackTrace') return undefined;
    const name = details.className;
    if (name.startsWith('net.minecraft.') || name.startsWith('com.mojang.'))
        return 'minecraft';
    if (
        name.startsWith('io.papermc.') ||
        name.startsWith('com.destroystokyo.paper.') ||
        name.startsWith('org.bukkit.') ||
        name.startsWith('org.spigotmc.')
    )
        return 'server';
    if (
        name.startsWith('java.') ||
        name.startsWith('javax.') ||
        name.startsWith('jdk.') ||
        name.startsWith('sun.')
    )
        return 'jvm';
    return undefined;
}

export function indexTree(
    roots: VirtualNode[],
    getTime: (node: VirtualNode) => number,
    reverse = false,
    pluginSources?: Set<string>
): TreeEntry[] {
    const entries: TreeEntry[] = [];
    const pending = roots
        .map(node => ({
            node,
            parent: undefined as TreeEntry | undefined,
            depth: 0,
        }))
        .reverse();
    while (pending.length) {
        const { node, parent, depth } = pending.pop()!;
        const entry: TreeEntry = {
            node,
            parent,
            children: [],
            depth,
            total: getTime(node),
            self: null,
            owner: node.getSource(),
            category: frameCategory(node, pluginSources),
        };
        entries.push(entry);
        if (parent) parent.children.push(entry);
        const children =
            reverse && parent ? node.getParents() : node.getChildren();
        for (let i = children.length - 1; i >= 0; i--)
            pending.push({
                node: children[i],
                parent: entry,
                depth: depth + 1,
            });
    }
    if (!reverse) {
        for (const entry of entries) {
            // Source roots represent a subset of the thread, not its full usage.
            if (
                entry.node instanceof SourceThreadVirtualNode ||
                entry.node instanceof FlatThreadVirtualNode
            )
                continue;
            const self =
                entry.total -
                entry.children.reduce((sum, child) => sum + child.total, 0);
            if (self >= -0.000001) entry.self = Math.max(0, self);
        }
    }
    return entries;
}

export function pathTo(entry: TreeEntry): TreeEntry[] {
    const path: TreeEntry[] = [];
    for (
        let current: TreeEntry | undefined = entry;
        current;
        current = current.parent
    )
        path.push(current);
    return path.reverse();
}

export function frameName(entry: TreeEntry): string {
    const details = entry.node.getDetails();
    return details.type === 'thread'
        ? details.name
        : `${details.className}.${details.methodName}()`;
}

export function copyBranch(entry: TreeEntry, unit = ''): string {
    const lines: string[] = [];
    const pending = [{ entry, depth: 0 }];
    while (pending.length) {
        const { entry: current, depth } = pending.pop()!;
        lines.push(
            `${'  '.repeat(depth)}${frameName(current)} - total: ${current.total}${unit}${current.self === null ? '' : `, self: ${current.self}${unit}`}${current.owner ? `, owner: ${current.owner}` : ''}`
        );
        for (let i = current.children.length - 1; i >= 0; i--)
            pending.push({ entry: current.children[i], depth: depth + 1 });
    }
    return lines.join('\n');
}

export function hotPath(start: TreeEntry): TreeEntry[] {
    const path = [start];
    let current = start;
    while (current.children.length) {
        const best = current.children.reduce((a, b) =>
            b.total > a.total ? b : a
        );
        if (best.total <= 0) break;
        path.push(best);
        current = best;
    }
    return path;
}

export function descendants(entry: TreeEntry, limit = 1500): TreeEntry[] {
    const result: TreeEntry[] = [];
    const pending = [...entry.children];
    while (pending.length && result.length < limit) {
        const current = pending.pop()!;
        result.push(current);
        pending.push(...current.children);
    }
    return result;
}

export function expansionNodes(
    start: TreeEntry,
    minimum = 0,
    limit = 1500
): TreeEntry[] {
    const nodes = [start, ...descendants(start, limit)];
    const qualifying = new Set<TreeEntry>();
    for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        if (
            node.total >= minimum ||
            node.children.some(child => qualifying.has(child))
        )
            qualifying.add(node);
    }
    return nodes.filter(
        node =>
            node.children.length > 0 &&
            node.depth - start.depth < 100 &&
            (minimum === 0 ||
                node.children.some(child => qualifying.has(child)))
    );
}

export function expansionForRoots(
    roots: TreeEntry[],
    minimum: (root: TreeEntry) => number = () => 0,
    limit = 1500
): TreeEntry[] {
    const expanded: TreeEntry[] = [];
    for (const root of roots) {
        if (expanded.length >= limit) break;
        expanded.push(
            ...expansionNodes(
                root,
                minimum(root),
                limit - expanded.length
            ).slice(0, limit - expanded.length)
        );
    }
    return expanded;
}

export function displayedUsage(
    entry: TreeEntry,
    perInterval = false,
    intervals = 1
): number {
    if (perInterval) return entry.total / Math.max(intervals, 1);
    let root = entry;
    while (root.parent) root = root.parent;
    return (entry.total / (root.total || 1)) * 100;
}

export function visibleEntries(
    entries: TreeEntry[],
    root: TreeEntry | undefined,
    hidden: Set<TreeEntry>,
    threshold: number,
    query: string,
    pathsOnly: boolean,
    owner?: string,
    getUsage?: (entry: TreeEntry) => number,
    getThreshold?: (entry: TreeEntry) => number,
    keepRoots?: Set<TreeEntry>
): Set<TreeEntry> {
    const visible = new Set<TreeEntry>();
    const normalized = query.toLowerCase().trim();
    const eligible = new Set<TreeEntry>();
    const blocked = new Set<TreeEntry>();
    const rootTotals = new Map<TreeEntry, number>();
    for (const entry of entries) {
        rootTotals.set(
            entry,
            entry.parent ? rootTotals.get(entry.parent)! : entry.total
        );
        if (hidden.has(entry) || (entry.parent && blocked.has(entry.parent)))
            blocked.add(entry);
        if (
            !blocked.has(entry) &&
            (!root ||
                entry === root ||
                (entry.parent && eligible.has(entry.parent)))
        )
            eligible.add(entry);
    }
    for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if (!eligible.has(entry)) continue;
        const matches =
            !normalized ||
            `${frameName(entry)} ${entry.owner || ''}`
                .toLowerCase()
                .includes(normalized);
        const qualifies =
            entry.total > 0 &&
            (getUsage
                ? getUsage(entry)
                : (entry.total / (rootTotals.get(entry) || 1)) * 100) >=
                (getThreshold ? getThreshold(entry) : threshold) &&
            (!owner || entry.owner === owner) &&
            (!pathsOnly || matches);
        if (
            qualifies ||
            (keepRoots?.has(entry) && !entry.parent) ||
            entry.children.some(child => visible.has(child))
        )
            visible.add(entry);
    }
    return visible;
}

export interface ExportNode {
    frame: string;
    path: string[];
    className?: string;
    methodName?: string;
    methodDesc?: string;
    owner?: string;
    category?: FrameCategory;
    totalUsage: number;
    selfUsage: number | null;
    children: ExportNode[];
}

export function exportNodes(
    roots: TreeEntry[],
    categories?: Set<FrameCategory>,
    plugin?: string
): ExportNode[] {
    const result: ExportNode[] = [];
    const pending = roots.map(entry => ({ entry, into: result })).reverse();
    while (pending.length) {
        const { entry, into } = pending.pop()!;
        const children: ExportNode[] = [];
        const include =
            (!categories ||
                (!!entry.category && categories.has(entry.category))) &&
            (!plugin || entry.owner === plugin);
        if (include) {
            const details = entry.node.getDetails();
            into.push({
                frame: frameName(entry),
                path: pathTo(entry).map(frameName),
                ...(details.type === 'stackTrace'
                    ? {
                          className: details.className,
                          methodName: details.methodName,
                          methodDesc: details.methodDesc,
                      }
                    : {}),
                owner: entry.owner,
                category: entry.category,
                totalUsage: entry.total,
                selfUsage: entry.self,
                children,
            });
        }
        for (let i = entry.children.length - 1; i >= 0; i--)
            pending.push({
                entry: entry.children[i],
                into: include ? children : into,
            });
    }
    return result;
}
