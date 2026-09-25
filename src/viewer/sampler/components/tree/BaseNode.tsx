import { faCopy } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import classnames from 'classnames';
import React, { ReactNode, useContext } from 'react';
import { TreeEntry } from '../../data/TreeNavigation';
import SourceThreadVirtualNode from '../../node/SourceThreadVirtualNode';
import {
    HighlightedContext,
    InfoPointsContext,
    MappingsContext,
} from '../SamplerContext';
import InfoPoint from './InfoPoint';
import LineNumber from './LineNumber';
import Name from './Name';
import NodeInfo from './NodeInfo';

interface BaseNodeProps {
    entry: TreeEntry;
    root?: TreeEntry;
    visible: Set<TreeEntry>;
    expanded: Set<TreeEntry>;
    collapsed: Set<TreeEntry>;
    hot: Set<TreeEntry>;
    matches: Set<TreeEntry>;
    selected?: TreeEntry;
    idFor: (entry: TreeEntry) => string;
    onToggle: (entry: TreeEntry) => void;
    onSelect: (entry: TreeEntry) => void;
    onMenu: (event: React.MouseEvent, entry: TreeEntry) => void;
    onCopy: (entry: TreeEntry) => void;
    onOwner: (owner: string) => void;
    tools?: ReactNode;
}

const BaseNode = React.memo(function BaseNode({
    entry,
    root,
    visible,
    expanded,
    collapsed,
    hot,
    matches,
    selected,
    idFor,
    onToggle,
    onSelect,
    onMenu,
    onCopy,
    onOwner,
    tools,
}: BaseNodeProps) {
    const mappings = useContext(MappingsContext)!;
    const infoPoints = useContext(InfoPointsContext)!;
    const highlighted = useContext(HighlightedContext)!;
    const { node, parent } = entry;
    const isExpanded = expanded.has(entry) && !collapsed.has(entry);
    const thread = entry.parent
        ? (() => {
              let current = entry;
              while (current.parent) current = current.parent;
              return current.total;
          })()
        : entry.total;
    const parentTime = parent?.total || entry.total;
    const significance = parent
        ? Math.min(entry.total, parentTime) /
          (Math.max(entry.total, parentTime) || 1)
        : 1;
    const importance = parent && parentTime !== entry.total ? significance : 0;
    const children = entry.children
        .filter(child => visible.has(child))
        .sort((a, b) => b.total - a.total);

    return (
        <li
            className={classnames('node', {
                collapsed: !isExpanded,
                parent: !parent || entry === root,
            })}
        >
            <div
                id={idFor(entry)}
                className={classnames('node-info', {
                    'bookmarked': highlighted.has(node),
                    'search-match': matches.has(entry),
                    'selected-node': selected === entry,
                    'hot-path': hot.has(entry),
                })}
                onClick={event => {
                    if (event.altKey) highlighted.toggle(node);
                    else {
                        onSelect(entry);
                        onToggle(entry);
                    }
                }}
                onContextMenu={event => {
                    event.preventDefault();
                    onSelect(entry);
                    onMenu(event, entry);
                }}
            >
                <NodeInfo
                    time={entry.total}
                    selfTime={
                        node instanceof SourceThreadVirtualNode
                            ? Math.max(
                                  0,
                                  entry.total -
                                      entry.children.reduce(
                                          (sum, child) => sum + child.total,
                                          0
                                      )
                              )
                            : (entry.self ?? 0)
                    }
                    threadTime={thread}
                    importance={importance}
                    significance={significance}
                    source={node.getSource()}
                    isSourceRoot={node instanceof SourceThreadVirtualNode}
                    infoPoint={
                        <InfoPoint
                            node={node}
                            mappings={mappings}
                            lookup={infoPoints}
                        />
                    }
                >
                    <Name details={node.getDetails()} mappings={mappings} />
                    <LineNumber node={node} parent={parent?.node || null} />
                    {entry.category && (
                        <button
                            className="owner-label"
                            title={entry.owner || entry.category}
                            onClick={event => {
                                event.stopPropagation();
                                if (entry.owner) onOwner(entry.owner);
                            }}
                        >
                            {entry.owner || entry.category}
                        </button>
                    )}
                    <button
                        className="node-copy"
                        title="Copy branch"
                        aria-label="Copy branch"
                        onClick={event => {
                            event.stopPropagation();
                            onCopy(entry);
                        }}
                    >
                        <FontAwesomeIcon icon={faCopy} />
                    </button>
                </NodeInfo>
            </div>
            {tools}
            {isExpanded && children.length > 0 && (
                <ul className="children">
                    {children.map(child => (
                        <BaseNode
                            key={idFor(child)}
                            entry={child}
                            root={root}
                            visible={visible}
                            expanded={expanded}
                            collapsed={collapsed}
                            hot={hot}
                            matches={matches}
                            selected={selected}
                            idFor={idFor}
                            onToggle={onToggle}
                            onSelect={onSelect}
                            onMenu={onMenu}
                            onCopy={onCopy}
                            onOwner={onOwner}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
});
export default BaseNode;
