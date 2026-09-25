import {
    faCopy,
    faFire,
    faInfoCircle,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    ReactNode,
    useCallback,
    useContext,
    useDeferredValue,
    useId,
    useMemo,
    useState,
} from 'react';
import { Item, ItemParams, Menu, useContextMenu } from 'react-contexify';
import { Tooltip } from 'react-tooltip';
import {
    formatBytesShort,
    formatTime,
    humanFriendlyPercentage,
} from '../../../common/util/format';
import { SamplerMetadata_SamplerMode } from '../../../proto/spark_pb';
import {
    copyBranch,
    descendants,
    displayedUsage,
    expansionForRoots,
    frameName,
    hotPath,
    indexTree,
    pathTo,
    TreeEntry,
    visibleEntries,
} from '../../data/TreeNavigation';
import VirtualNode from '../../node/VirtualNode';
import {
    HighlightedContext,
    LabelModeContext,
    MetadataContext,
    SearchQueryContext,
    TimeSelectorContext,
    TreeActionsContext,
} from '../SamplerContext';
import BaseNode from './BaseNode';
import ScopedTreeControls from './ScopedTreeControls';

interface TreeGroup {
    name: string;
    heading: ReactNode;
    roots: VirtualNode[];
}

export interface TreeProps {
    roots: VirtualNode[];
    reverse?: boolean;
    groups?: TreeGroup[];
}

export default function Tree({ roots, reverse = false, groups }: TreeProps) {
    const { onSelect, onFlame } = useContext(TreeActionsContext)!;
    const timeSelector = useContext(TimeSelectorContext)!;
    const search = useContext(SearchQueryContext)!;
    const query = useDeferredValue(search.value);
    const bookmarks = useContext(HighlightedContext)!;
    const metadata = useContext(MetadataContext)!;
    const labelMode = useContext(LabelModeContext);
    const allocation =
        metadata.samplerMode === SamplerMetadata_SamplerMode.ALLOCATION;
    const intervals = allocation
        ? (timeSelector.supported
              ? timeSelector.getMillisInRange()
              : metadata.endTime - metadata.startTime) / 1000
        : timeSelector.supported
          ? timeSelector.getTicksInRange()
          : metadata.dataAggregator?.numberOfIncludedTicks ||
            metadata.numberOfTicks;
    const displayUnit = labelMode ? (allocation ? 'bytes/s' : 'ms/tick') : '%';
    const unit =
        metadata.samplerMode === SamplerMetadata_SamplerMode.ALLOCATION
            ? ' bytes'
            : ' ms';
    const plugins = useMemo(
        () =>
            new Set(
                Object.entries(metadata.sources || {})
                    .filter(([, source]) => !source.builtIn)
                    .map(([name]) => name.toLowerCase())
            ),
        [metadata.sources]
    );
    const entries = useMemo(
        () => indexTree(roots, timeSelector.getTime, reverse, plugins),
        [roots, timeSelector.getTime, reverse, plugins]
    );
    const byNode = useMemo(
        () => new Map(entries.map(entry => [entry.node, entry])),
        [entries]
    );
    const byIndex = useMemo(
        () => new Map(entries.map((entry, index) => [entry, index])),
        [entries]
    );
    const rootOf = useMemo(() => {
        const result = new Map<TreeEntry, TreeEntry>();
        for (const entry of entries)
            result.set(entry, entry.parent ? result.get(entry.parent)! : entry);
        return result;
    }, [entries]);
    const groupOf = useMemo(() => {
        const result = new Map<TreeEntry, string>();
        for (const group of groups || [])
            for (const node of group.roots) {
                const entry = byNode.get(node);
                if (entry) result.set(entry, `group:${group.name}`);
            }
        return result;
    }, [groups, byNode]);
    const [focus, setFocus] = useState<TreeEntry>();
    const [selected, setSelected] = useState<TreeEntry>();
    const [hidden, setHidden] = useState<Set<TreeEntry>>(new Set());
    const [expanded, setExpanded] = useState<Set<TreeEntry>>(new Set());
    const [collapsed, setCollapsed] = useState<Set<TreeEntry>>(new Set());
    const [previous, setPrevious] = useState<{
        expanded: Set<TreeEntry>;
        collapsed: Set<TreeEntry>;
    }>();
    const [hot, setHot] = useState<TreeEntry[]>([]);
    const [threadTools, setThreadTools] = useState<TreeEntry>();
    const [thresholds, setThresholds] = useState({ percent: 0, rate: 0 });
    const [expandThresholds, setExpandThresholds] = useState({
        percent: 0.05,
        rate: 0.05,
    });
    const mode = labelMode ? 'rate' : 'percent';
    const threshold = thresholds[mode];
    const expandThreshold = expandThresholds[mode];
    const [scopeThresholds, setScopeThresholds] = useState<
        Map<string, { percent: number; rate: number }>
    >(new Map());
    const [scopeExpandThresholds, setScopeExpandThresholds] = useState<
        Map<string, { percent: number; rate: number }>
    >(new Map());
    const thresholdByRoot = useMemo(() => {
        const result = new Map<TreeEntry, number>();
        for (const entry of entries) {
            if (entry.parent) continue;
            const group = groupOf.get(entry);
            result.set(
                entry,
                Math.max(
                    threshold,
                    group ? scopeThresholds.get(group)?.[mode] || 0 : 0,
                    scopeThresholds.get(`thread:${byIndex.get(entry)}`)?.[
                        mode
                    ] || 0
                )
            );
        }
        return result;
    }, [entries, groupOf, threshold, scopeThresholds, mode, byIndex]);
    const resettableRoots = useMemo(
        () =>
            new Set(
                entries.filter(
                    entry =>
                        !entry.parent &&
                        (scopeThresholds.get(`thread:${byIndex.get(entry)}`)?.[
                            mode
                        ] || 0) > 0
                )
            ),
        [entries, scopeThresholds, byIndex, mode]
    );
    const [pathsOnly, setPathsOnly] = useState(false);
    const [owner, setOwner] = useState('');
    const [matchIndex, setMatchIndex] = useState(0);
    const [feedback, setFeedback] = useState('');
    const id = useId();
    const helpId = `${id}-help`;
    const { show } = useContextMenu({ id });
    const root = focus && byNode.get(focus.node);
    const active = selected && byNode.get(selected.node);
    const visible = useMemo(
        () =>
            visibleEntries(
                entries,
                root,
                hidden,
                threshold,
                query,
                pathsOnly,
                owner || undefined,
                labelMode
                    ? entry => entry.total / Math.max(intervals, 1)
                    : undefined,
                entry => thresholdByRoot.get(rootOf.get(entry)!) || 0,
                resettableRoots
            ),
        [
            entries,
            root,
            hidden,
            threshold,
            query,
            pathsOnly,
            owner,
            labelMode,
            intervals,
            thresholdByRoot,
            rootOf,
            resettableRoots,
        ]
    );
    const matches = useMemo(
        () =>
            query
                ? entries.filter(
                      entry =>
                          visible.has(entry) &&
                          `${frameName(entry)} ${entry.owner || ''}`
                              .toLowerCase()
                              .includes(query.toLowerCase())
                  )
                : [],
        [entries, visible, query]
    );
    const matchSet = useMemo(() => new Set(matches), [matches]);
    const rootEntries = useMemo(
        () => (root ? [root] : entries.filter(entry => !entry.parent)),
        [root, entries]
    );
    const scopedThread = threadTools && byNode.get(threadTools.node);
    const hotSet = useMemo(() => new Set(hot), [hot]);
    const idFor = useCallback(
        (entry: TreeEntry) => `${id}-${byIndex.get(entry)}`,
        [id, byIndex]
    );
    function scopeControls(
        key: string,
        label: string,
        scopedRoots: TreeEntry[],
        showLabel = true
    ) {
        const value = scopeThresholds.get(key)?.[mode] || 0;
        const expandValue = scopeExpandThresholds.get(key)?.[mode] ?? 0.05;
        const setValue = (setter: typeof setScopeThresholds, next: number) =>
            setter(current => {
                const updated = new Map(current);
                updated.set(key, {
                    percent: current.get(key)?.percent ?? 0,
                    rate: current.get(key)?.rate ?? 0,
                    [mode]: next,
                });
                return updated;
            });
        return (
            <ScopedTreeControls
                label={label}
                showLabel={showLabel}
                unit={displayUnit}
                percentage={!labelMode}
                threshold={value}
                expandThreshold={expandValue}
                hasHotPath={hot.some(entry =>
                    scopedRoots.includes(rootOf.get(entry)!)
                )}
                onHotPath={() => runHotPaths(scopedRoots)}
                onClearHotPath={clearHot}
                onExpand={() => expandRoots(scopedRoots)}
                onCollapse={() => collapseRoots(scopedRoots)}
                onExpandThreshold={() =>
                    expandRoots(scopedRoots, entry =>
                        labelMode
                            ? expandValue * Math.max(intervals, 1)
                            : (entry.total * expandValue) / 100
                    )
                }
                onThreshold={value => setValue(setScopeThresholds, value)}
                onExpansionThreshold={value =>
                    setValue(setScopeExpandThresholds, value)
                }
            />
        );
    }
    function formatUsage(entry: TreeEntry, value = entry.total) {
        if (!labelMode)
            return humanFriendlyPercentage(
                (displayedUsage(entry) / 100) * (value / (entry.total || 1))
            );
        const rate = value / Math.max(intervals, 1);
        return allocation
            ? `${formatBytesShort(rate)}/s`
            : `${formatTime(rate)} ms/tick`;
    }

    function toggle(entry: TreeEntry) {
        if (!entry.parent) setThreadTools(entry);
        if (expanded.has(entry) && !collapsed.has(entry)) {
            setExpanded(current => {
                const next = new Set(current);
                next.delete(entry);
                return next;
            });
            setCollapsed(current => new Set(current).add(entry));
        } else {
            setCollapsed(current => {
                const next = new Set(current);
                next.delete(entry);
                return next;
            });
            setExpanded(current => new Set(current).add(entry));
        }
    }

    function expandRoots(
        roots: TreeEntry[],
        minimum: (root: TreeEntry) => number = () => 0
    ) {
        const nodes = expansionForRoots(roots, minimum);
        setExpanded(current => new Set([...current, ...nodes]));
        setCollapsed(current => {
            const next = new Set(current);
            nodes.forEach(node => next.delete(node));
            return next;
        });
        if (nodes.length >= 1500)
            setFeedback(
                'Expanded at most 1500 branches to keep the viewer responsive'
            );
    }

    function expandBranch(entry: TreeEntry, minimum = 0) {
        expandRoots([entry], () => minimum);
    }

    function collapseBranch(entry: TreeEntry) {
        collapseRoots([entry]);
    }

    function collapseRoots(roots: TreeEntry[]) {
        if (
            threadTools &&
            roots.some(entry => rootOf.get(threadTools) === rootOf.get(entry))
        )
            setThreadTools(undefined);
        const nodes = roots.flatMap(entry => [
            entry,
            ...descendants(entry, Infinity),
        ]);
        setExpanded(current => {
            const next = new Set(current);
            nodes.forEach(node => next.delete(node));
            return next;
        });
        setCollapsed(current => new Set([...current, ...nodes]));
    }

    function runHot(entry: TreeEntry) {
        runHotPaths([entry]);
    }

    function runHotPaths(roots: TreeEntry[]) {
        if (!hot.length) setPrevious({ expanded, collapsed });
        const path = roots.flatMap(hotPath);
        setHot(path);
        setExpanded(current => new Set([...current, ...path]));
        setCollapsed(current => {
            const next = new Set(current);
            path.forEach(node => next.delete(node));
            return next;
        });
    }

    function clearHot() {
        setHot([]);
        if (previous) {
            setExpanded(previous.expanded);
            setCollapsed(previous.collapsed);
        }
        setPrevious(undefined);
    }

    async function copy(text: string) {
        try {
            await navigator.clipboard.writeText(text);
            setFeedback('Copied to clipboard');
        } catch {
            setFeedback('Clipboard access unavailable');
        }
    }

    function target(args: ItemParams<{ entry: TreeEntry }>) {
        return args.props?.entry;
    }
    function moveMatch(direction: number) {
        if (!matches.length) return;
        const next = (matchIndex + direction + matches.length) % matches.length;
        setMatchIndex(next);
        const entry = matches[next];
        setExpanded(current => new Set([...current, ...pathTo(entry)]));
        setSelected(entry);
        onSelect?.(entry);
        setTimeout(
            () =>
                document
                    .getElementById(idFor(entry))
                    ?.scrollIntoView({ block: 'center' }),
            0
        );
    }

    function renderRoot(entry: TreeEntry) {
        return (
            <BaseNode
                key={byIndex.get(entry)}
                entry={entry}
                root={root}
                visible={visible}
                expanded={expanded}
                collapsed={collapsed}
                hot={hotSet}
                matches={matchSet}
                selected={active}
                idFor={idFor}
                onToggle={toggle}
                onSelect={entry => {
                    setSelected(entry);
                    onSelect?.(entry);
                }}
                onMenu={(event, entry) => show({ event, props: { entry } })}
                onCopy={entry => copy(copyBranch(entry, unit))}
                onOwner={setOwner}
                tools={
                    scopedThread === entry &&
                    scopeControls(
                        `thread:${byIndex.get(rootOf.get(entry)!)}`,
                        frameName(entry),
                        [entry]
                    )
                }
            />
        );
    }

    return (
        <>
            <div className="tree-tools">
                {groups && <strong>All plugins</strong>}
                <button
                    onClick={() =>
                        groups
                            ? runHotPaths(rootEntries)
                            : runHot(
                                  root ||
                                      rootEntries.reduce((best, entry) =>
                                          entry.total > best.total
                                              ? entry
                                              : best
                                      )
                              )
                    }
                    disabled={!rootEntries.length}
                    title="Follow the highest-usage child at each level"
                >
                    <FontAwesomeIcon icon={faFire} /> Hot path
                </button>
                {hot.length > 0 && (
                    <button onClick={clearHot}>Clear hot path</button>
                )}
                <span
                    className="tree-help"
                    data-tooltip-id={helpId}
                    data-tooltip-content={
                        groups
                            ? 'Hot path follows the highest-usage child of each plugin thread. It is a navigation aid, not a diagnosis. Clearing restores the previous expansion state.'
                            : 'Hot path follows the highest-usage child from the current root. It is a navigation aid, not a diagnosis. Clearing restores the previous expansion state.'
                    }
                    aria-label="About hot path"
                    tabIndex={0}
                >
                    <FontAwesomeIcon icon={faInfoCircle} />
                </span>
                <details className="tree-options">
                    <summary>
                        Tree options{' '}
                        <span
                            className="tree-help"
                            data-tooltip-id={helpId}
                            data-tooltip-content={`Expand all opens branches (limited on large profiles); Collapse all closes them. Show nodes hides branches below the selected ${displayUnit} minimum, retaining paths to qualifying descendants. Expand to threshold opens paths above its own ${displayUnit} minimum. ${labelMode ? (allocation ? 'Bytes/s is average allocated bytes per second over the selected range.' : 'ms/tick is average time per tick over the selected range.') : 'Percent is relative to the original thread total, not recalculated after filtering.'} Neither option changes the profile.`}
                            aria-label="About tree options"
                            tabIndex={0}
                        >
                            <FontAwesomeIcon icon={faInfoCircle} />
                        </span>
                    </summary>
                    <div className="tree-options-content">
                        <button onClick={() => expandRoots(rootEntries)}>
                            Expand all
                        </button>
                        <button onClick={() => collapseRoots(rootEntries)}>
                            Collapse all
                        </button>
                        <label>
                            Show nodes &gt;={' '}
                            <input
                                aria-label={`Minimum usage (${displayUnit})`}
                                type="number"
                                min="0"
                                max={labelMode ? undefined : 100}
                                step="0.01"
                                value={threshold}
                                onChange={e =>
                                    setThresholds(current => ({
                                        ...current,
                                        [mode]: Math.max(
                                            0,
                                            Number(e.target.value) || 0
                                        ),
                                    }))
                                }
                            />
                            {displayUnit}
                        </label>
                        {threshold > 0 && (
                            <button
                                onClick={() =>
                                    setThresholds(current => ({
                                        ...current,
                                        [mode]: 0,
                                    }))
                                }
                            >
                                Reset threshold
                            </button>
                        )}
                        <label>
                            Expand &gt;={' '}
                            <input
                                aria-label={`Expansion usage (${displayUnit})`}
                                type="number"
                                min="0"
                                max={labelMode ? undefined : 100}
                                step="0.01"
                                value={expandThreshold}
                                onChange={e =>
                                    setExpandThresholds(current => ({
                                        ...current,
                                        [mode]: Math.max(
                                            0,
                                            Number(e.target.value) || 0
                                        ),
                                    }))
                                }
                            />
                            {displayUnit}
                        </label>
                        <button
                            onClick={() =>
                                expandRoots(rootEntries, entry =>
                                    labelMode
                                        ? expandThreshold *
                                          Math.max(intervals, 1)
                                        : (entry.total * expandThreshold) / 100
                                )
                            }
                        >
                            Expand to threshold
                        </button>
                    </div>
                </details>
                {search.value && (
                    <>
                        <button onClick={() => setPathsOnly(!pathsOnly)}>
                            {pathsOnly
                                ? 'Show all paths'
                                : 'Matching paths only'}
                        </button>
                        <button onClick={() => moveMatch(-1)}>Previous</button>
                        <button onClick={() => moveMatch(1)}>Next</button>
                        <span>{matches.length} matches</span>
                        <span
                            className="tree-help"
                            data-tooltip-id={helpId}
                            data-tooltip-content="Search matches class, package, method and known owner. Previous and Next reveal matches; Matching paths only hides unrelated branches. The match count respects active view filters."
                            aria-label="About call tree search"
                            tabIndex={0}
                        >
                            <FontAwesomeIcon icon={faInfoCircle} />
                        </span>
                    </>
                )}
                {hidden.size > 0 && (
                    <button onClick={() => setHidden(new Set())}>
                        Reset hidden ({hidden.size})
                    </button>
                )}
                {owner && (
                    <button onClick={() => setOwner('')}>
                        Clear owner: {owner}
                    </button>
                )}
                {feedback && <span role="status">{feedback}</span>}
                <Tooltip
                    id={helpId}
                    place="bottom"
                    className="tree-help-tooltip"
                />
            </div>
            {root && (
                <nav className="tree-crumbs" aria-label="Focused call path">
                    {pathTo(root).map(entry => (
                        <button
                            key={byIndex.get(entry)}
                            onClick={() =>
                                setFocus(entry.parent ? entry : undefined)
                            }
                        >
                            {frameName(entry)}
                        </button>
                    ))}
                    <button onClick={() => setFocus(undefined)}>
                        Original root
                    </button>
                </nav>
            )}
            {active && (
                <div className="tree-inspector">
                    <span
                        className="tree-help"
                        data-tooltip-id={helpId}
                        data-tooltip-content="Total includes descendants; self excludes them when it can be calculated. Copy copies the frame name. Focus treats this branch as the visible root; Hide removes it from this view until you reset hidden branches."
                        aria-label="About selected frame"
                        tabIndex={0}
                    >
                        <FontAwesomeIcon icon={faInfoCircle} />
                    </span>
                    <strong>{frameName(active)}</strong> | Total (incl.
                    descendants): {formatUsage(active)} | Self:{' '}
                    {active.self === null
                        ? 'unavailable'
                        : formatUsage(active, active.self)}{' '}
                    {active.owner && (
                        <>
                            | Owner:{' '}
                            <button onClick={() => setOwner(active.owner!)}>
                                {active.owner}
                            </button>
                        </>
                    )}{' '}
                    {active.category && !active.owner && (
                        <>| {active.category}</>
                    )}{' '}
                    |{' '}
                    <button onClick={() => copy(frameName(active))}>
                        <FontAwesomeIcon icon={faCopy} /> Copy
                    </button>{' '}
                    <button
                        onClick={() => {
                            setFocus(active);
                            setExpanded(current =>
                                new Set(current).add(active)
                            );
                            setCollapsed(current => {
                                const next = new Set(current);
                                next.delete(active);
                                return next;
                            });
                        }}
                    >
                        Focus branch
                    </button>{' '}
                    <button
                        onClick={() => {
                            setHidden(current => new Set(current).add(active));
                            if (root === active) setFocus(active.parent);
                            setSelected(undefined);
                        }}
                    >
                        Hide branch
                    </button>{' '}
                    <button onClick={() => setSelected(undefined)}>
                        Close
                    </button>
                </div>
            )}
            {groups ? (
                groups.map(group => {
                    const groupRoots = group.roots
                        .map(node => byNode.get(node))
                        .filter((entry): entry is TreeEntry => !!entry);
                    const scopedRoots = root
                        ? groupRoots.includes(rootOf.get(root)!)
                            ? [root]
                            : []
                        : groupRoots;
                    if (!scopedRoots.length) return null;
                    return (
                        <div className="stack" key={group.name}>
                            <h2>{group.heading}</h2>
                            {scopeControls(
                                `group:${group.name}`,
                                group.name,
                                scopedRoots,
                                false
                            )}
                            {scopedRoots
                                .filter(entry => visible.has(entry))
                                .map(renderRoot)}
                        </div>
                    );
                })
            ) : (
                <div className="stack">
                    {rootEntries
                        .filter(entry => visible.has(entry))
                        .map(renderRoot)}
                </div>
            )}
            <Menu id={id} theme="dark">
                <Item
                    onClick={args => {
                        const entry = target(args);
                        if (entry) copy(copyBranch(entry, unit));
                    }}
                >
                    Copy branch
                </Item>
                <Item
                    onClick={args => {
                        const entry = target(args);
                        if (entry) copy(frameName(entry));
                    }}
                >
                    Copy method
                </Item>
                <Item
                    onClick={args => {
                        const entry = target(args);
                        if (entry)
                            copy(pathTo(entry).map(frameName).join(' -> '));
                    }}
                >
                    Copy full path
                </Item>
                <Item
                    onClick={args => {
                        const entry = target(args);
                        if (entry) {
                            setFocus(entry);
                            setExpanded(current => new Set(current).add(entry));
                            setCollapsed(current => {
                                const next = new Set(current);
                                next.delete(entry);
                                return next;
                            });
                            setSelected(entry);
                            onSelect?.(entry);
                        }
                    }}
                >
                    Focus branch
                </Item>
                <Item
                    onClick={args => {
                        const entry = target(args);
                        if (entry)
                            setHidden(current => new Set(current).add(entry));
                    }}
                >
                    Hide branch
                </Item>
                <Item
                    onClick={args => {
                        const entry = target(args);
                        if (entry) runHot(entry);
                    }}
                >
                    Hot path from branch
                </Item>
                <Item
                    onClick={args => {
                        const entry = target(args);
                        if (entry) expandBranch(entry);
                    }}
                >
                    Expand branch
                </Item>
                <Item
                    onClick={args => {
                        const entry = target(args);
                        if (entry) collapseBranch(entry);
                    }}
                >
                    Collapse branch
                </Item>
                <Item
                    onClick={args => {
                        const entry = target(args);
                        if (entry)
                            expandBranch(
                                entry,
                                labelMode
                                    ? expandThreshold * Math.max(intervals, 1)
                                    : (entry.total * expandThreshold) / 100
                            );
                    }}
                >
                    Expand to threshold
                </Item>
                <Item
                    onClick={args => {
                        const entry = target(args);
                        if (entry?.owner) setOwner(entry.owner);
                    }}
                >
                    Filter to owner
                </Item>
                <Item
                    onClick={args => {
                        const entry = target(args);
                        if (entry) onFlame(entry.node);
                    }}
                >
                    View as Flame Graph
                </Item>
                <Item
                    onClick={args => {
                        const entry = target(args);
                        if (entry) bookmarks.toggle(entry.node);
                    }}
                >
                    Toggle bookmark
                </Item>
                <Item onClick={() => bookmarks.clear()}>
                    Clear all bookmarks
                </Item>
            </Menu>
        </>
    );
}
