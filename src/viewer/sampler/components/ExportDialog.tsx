import { useState } from 'react';
import { SamplerMetadata } from '../../proto/spark_pb';
import {
    exportNodes,
    FrameCategory,
    indexTree,
    TreeEntry,
} from '../data/TreeNavigation';
import { TimeSelector } from '../hooks/useTimeSelector';
import BasicVirtualNode from '../node/BasicVirtualNode';
import SamplerData from '../SamplerData';

interface ExportDialogProps {
    data: SamplerData;
    metadata: SamplerMetadata;
    timeSelector: TimeSelector;
    selected?: TreeEntry;
    onClose: () => void;
}

const categories: FrameCategory[] = ['plugin', 'minecraft', 'server', 'jvm'];

export default function ExportDialog({
    data,
    metadata,
    timeSelector,
    selected,
    onClose,
}: ExportDialogProps) {
    const [scope, setScope] = useState('profile');
    const [plugin, setPlugin] = useState('');
    const [included, setIncluded] = useState<Set<FrameCategory>>(
        new Set(categories)
    );
    const plugins = data.sources
        .getSources()
        .filter(
            source =>
                !metadata.sources[source.toLowerCase()]?.builtIn &&
                source !== 'minecraft' &&
                source !== 'java'
        );

    function download() {
        const roots =
            scope === 'branch' && selected
                ? [selected]
                : indexTree(
                      data.threads.map(
                          thread => new BasicVirtualNode(data, thread)
                      ),
                      timeSelector.getTime,
                      false,
                      new Set(plugins.map(source => source.toLowerCase()))
                  ).filter(entry => !entry.parent);
        const filter =
            scope === 'plugins' ? new Set<FrameCategory>(['plugin']) : included;
        const trees = exportNodes(
            roots,
            scope === 'profile' && included.size === categories.length
                ? undefined
                : filter,
            scope === 'plugin' ? plugin : undefined
        );
        const json = JSON.stringify(
            {
                schemaVersion: 1,
                scope,
                ...(scope === 'plugin' ? { plugin } : {}),
                usageUnit:
                    metadata.samplerMode === 1 ? 'bytes' : 'milliseconds',
                metadata:
                    scope === 'profile'
                        ? SamplerMetadata.toJson(metadata)
                        : {
                              startTime: metadata.startTime,
                              endTime: metadata.endTime,
                              samplerMode: metadata.samplerMode,
                              interval: metadata.interval,
                          },
                trees,
            },
            null,
            2
        );
        const url = URL.createObjectURL(
            new Blob([json], { type: 'application/json' })
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = 'spark-profile.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        onClose();
    }

    return (
        <div className="export-backdrop" onClick={onClose}>
            <section
                className="export-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="Export JSON"
                onClick={event => event.stopPropagation()}
            >
                <h2>Export JSON</h2>
                <label>
                    Scope{' '}
                    <select
                        value={scope}
                        onChange={event => setScope(event.target.value)}
                    >
                        <option value="profile">Entire profile</option>
                        <option value="overall">
                            Overall/server call tree
                        </option>
                        <option value="plugins">Plugins only</option>
                        <option value="plugin">Specific plugin</option>
                        <option value="branch" disabled={!selected}>
                            Selected/focused branch
                        </option>
                    </select>
                </label>
                {scope === 'plugin' && (
                    <label>
                        Plugin{' '}
                        <select
                            value={plugin}
                            onChange={event => setPlugin(event.target.value)}
                        >
                            <option value="">Choose a plugin</option>
                            {plugins.map(source => (
                                <option key={source} value={source}>
                                    {source}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                {scope !== 'plugins' && (
                    <fieldset>
                        <legend>Include frame categories</legend>
                        {categories.map(category => (
                            <label key={category}>
                                <input
                                    type="checkbox"
                                    checked={included.has(category)}
                                    onChange={() =>
                                        setIncluded(current => {
                                            const next = new Set(current);
                                            if (next.has(category))
                                                next.delete(category);
                                            else next.add(category);
                                            return next;
                                        })
                                    }
                                />{' '}
                                {category === 'jvm'
                                    ? 'JVM/JDK'
                                    : category === 'minecraft'
                                      ? 'Minecraft/NMS'
                                      : category === 'server'
                                        ? 'Paper/server'
                                        : 'Plugin'}
                            </label>
                        ))}
                        <p>
                            Unclassified frames are included only when all
                            categories are selected. Filtering preserves
                            original usage values.
                        </p>
                    </fieldset>
                )}
                <p>
                    Includes canonical total usage and available self usage.
                    Spark does not provide separate sample counts in this
                    profile format.
                </p>
                <div className="export-actions">
                    <button onClick={onClose}>Cancel</button>
                    <button
                        onClick={download}
                        disabled={scope === 'plugin' && !plugin}
                    >
                        Download JSON
                    </button>
                </div>
            </section>
        </div>
    );
}
