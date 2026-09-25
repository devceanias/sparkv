import { Dispatch, SetStateAction, useContext, useMemo } from 'react';
import BasicVirtualNode from '../../node/BasicVirtualNode';
import SamplerData from '../../SamplerData';
import { LabelModeContext } from '../SamplerContext';
import Tree from '../tree/Tree';
import LabelModeButton from './button/LabelModeButton';
import AllViewHeader from './header/AllViewHeader';

export interface AllViewProps {
    data: SamplerData;
    setLabelMode: Dispatch<SetStateAction<boolean>>;
}

// The sampler view in which all data is shown in one, single stack.
export default function AllView({ data, setLabelMode }: AllViewProps) {
    const labelMode = useContext(LabelModeContext);
    const roots = useMemo(
        () => data.threads.map(thread => new BasicVirtualNode(data, thread)),
        [data]
    );

    return (
        <div className="allview">
            <AllViewHeader>
                <LabelModeButton
                    labelMode={labelMode}
                    setLabelMode={setLabelMode}
                />
            </AllViewHeader>
            <hr />
            <Tree roots={roots} />
        </div>
    );
}
