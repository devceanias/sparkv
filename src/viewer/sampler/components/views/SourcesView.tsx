import { Dispatch, SetStateAction, useContext, useMemo, useState } from 'react';
import TextBox from '../../../../components/TextBox';
import SourceThreadVirtualNode from '../../node/SourceThreadVirtualNode';
import SamplerData from '../../SamplerData';
import { SourcesViewData } from '../../worker/SourceViewGenerator';
import { LabelModeContext, MetadataContext } from '../SamplerContext';
import Tree from '../tree/Tree';
import LabelModeButton from './button/LabelModeButton';
import MergeModeButton from './button/MergeModeButton';
import SourcesViewHeader from './header/SourcesViewHeader';

export interface SourcesViewProps {
    data: SamplerData;
    viewData?: SourcesViewData;
    setLabelMode: Dispatch<SetStateAction<boolean>>;
}

// The sampler view in which there is a stack displayed for each known source.
export default function SourcesView({
    data,
    viewData,
    setLabelMode,
}: SourcesViewProps) {
    const labelMode = useContext(LabelModeContext);
    const [merged, setMerged] = useState(true);
    const view = merged ? viewData?.sourcesMerged : viewData?.sourcesSeparate;
    const metadata = useContext(MetadataContext)!;
    const groups = useMemo(
        () =>
            view?.map(({ source, threads }) => {
                const sourceInfo = metadata.sources[source.toLowerCase()];
                return {
                    name: source,
                    heading: (
                        <>
                            {source}{' '}
                            {sourceInfo && (
                                <span className="version">
                                    ({formatVersion(sourceInfo.version)})
                                </span>
                            )}
                        </>
                    ),
                    roots: threads.map(
                        thread => new SourceThreadVirtualNode(data, thread)
                    ),
                };
            }) || [],
        [view, data, metadata.sources]
    );
    const roots = useMemo(() => groups.flatMap(group => group.roots), [groups]);

    return (
        <div className="sourceview">
            <SourcesViewHeader>
                <LabelModeButton
                    labelMode={labelMode}
                    setLabelMode={setLabelMode}
                />
                <MergeModeButton merged={merged} setMerged={setMerged} />
            </SourcesViewHeader>
            <hr />
            {!view ? (
                <TextBox>Loading...</TextBox>
            ) : (
                <>
                    <Tree roots={roots} groups={groups} />
                    <OtherSourcesSection
                        alreadyShown={view.map(s => s.source)}
                    />
                </>
            )}
        </div>
    );
}

const formatVersion = (version: string) => {
    return version.startsWith('v') ? version : 'v' + version;
};

const OtherSourcesSection = ({ alreadyShown }: { alreadyShown: string[] }) => {
    const metadata = useContext(MetadataContext)!;
    if (!metadata.sources) {
        return null;
    }

    const otherSources = Object.values(metadata.sources)
        .filter(source => !alreadyShown.includes(source.name))
        .filter(p => !p.builtIn);

    if (!otherSources.length) {
        return null;
    }

    const sourceNoun = ['Fabric', 'Forge', 'NeoForge'].includes(
        metadata?.platform?.name!
    )
        ? 'mods'
        : 'plugins';

    return (
        <div className="other-sources">
            <h2>Other</h2>
            <p>
                The following other {sourceNoun} are installed, but didn&apos;t
                show up in this profile. Yay!
            </p>
            <ul>
                {otherSources.map(({ name, version }) => (
                    <li key={name}>
                        {name} <span>({formatVersion(version)})</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};
