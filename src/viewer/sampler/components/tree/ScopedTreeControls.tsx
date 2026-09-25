import { faFire, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useId } from 'react';
import { Tooltip } from 'react-tooltip';

interface ScopedTreeControlsProps {
    label: string;
    showLabel: boolean;
    unit: string;
    threshold: number;
    expandThreshold: number;
    percentage: boolean;
    hasHotPath: boolean;
    onHotPath: () => void;
    onClearHotPath: () => void;
    onExpand: () => void;
    onCollapse: () => void;
    onExpandThreshold: () => void;
    onThreshold: (value: number) => void;
    onExpansionThreshold: (value: number) => void;
}

export default function ScopedTreeControls({
    label,
    showLabel,
    unit,
    threshold,
    expandThreshold,
    percentage,
    hasHotPath,
    onHotPath,
    onClearHotPath,
    onExpand,
    onCollapse,
    onExpandThreshold,
    onThreshold,
    onExpansionThreshold,
}: ScopedTreeControlsProps) {
    const helpId = useId();
    return (
        <div className="tree-tools tree-scoped-tools">
            {showLabel && <strong>{label}</strong>}
            <button
                onClick={onHotPath}
                title={`Follow the dominant path in ${label}`}
            >
                <FontAwesomeIcon icon={faFire} /> Hot path
            </button>
            {hasHotPath && (
                <button onClick={onClearHotPath}>Clear hot path</button>
            )}
            <span
                className="tree-help"
                data-tooltip-id={helpId}
                data-tooltip-content={`Hot path follows the highest-usage child beneath each thread in ${label}. Clear restores the previous expansion state. It is a navigation aid, not a diagnosis.`}
                aria-label={`About ${label} hot path`}
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
                        data-tooltip-content={`These controls affect only ${label}; top-level and local minimum filters both apply. Expand all opens its branches (limited on large profiles); Collapse all closes them. Show nodes hides branches below the ${unit} minimum, preserving paths to qualifying descendants. Expand to threshold opens paths above its own ${unit} minimum. Neither changes profile data.`}
                        aria-label={`About ${label} tree options`}
                        tabIndex={0}
                    >
                        <FontAwesomeIcon icon={faInfoCircle} />
                    </span>
                </summary>
                <div className="tree-options-content">
                    <button onClick={onExpand}>Expand all</button>
                    <button onClick={onCollapse}>Collapse all</button>
                    <label>
                        Show nodes &gt;={' '}
                        <input
                            aria-label={`${label} minimum usage (${unit})`}
                            type="number"
                            min="0"
                            max={percentage ? 100 : undefined}
                            step="0.01"
                            value={threshold}
                            onChange={event =>
                                onThreshold(
                                    Math.max(0, Number(event.target.value) || 0)
                                )
                            }
                        />
                        {unit}
                    </label>
                    {threshold > 0 && (
                        <button onClick={() => onThreshold(0)}>
                            Reset threshold
                        </button>
                    )}
                    <label>
                        Expand &gt;={' '}
                        <input
                            aria-label={`${label} expansion usage (${unit})`}
                            type="number"
                            min="0"
                            max={percentage ? 100 : undefined}
                            step="0.01"
                            value={expandThreshold}
                            onChange={event =>
                                onExpansionThreshold(
                                    Math.max(0, Number(event.target.value) || 0)
                                )
                            }
                        />
                        {unit}
                    </label>
                    <button onClick={onExpandThreshold}>
                        Expand to threshold
                    </button>
                </div>
            </details>
            <Tooltip id={helpId} place="bottom" className="tree-help-tooltip" />
        </div>
    );
}
