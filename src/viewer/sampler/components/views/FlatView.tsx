import {
    createContext,
    Dispatch,
    SetStateAction,
    useContext,
    useMemo,
    useState,
} from 'react';
import TextBox from '../../../../components/TextBox';
import FlatThreadVirtualNode from '../../node/FlatThreadVirtualNode';
import SamplerData from '../../SamplerData';
import { FlatViewData } from '../../worker/FlatViewGenerator';
import { LabelModeContext } from '../SamplerContext';
import Tree from '../tree/Tree';
import BottomUpButton from './button/BottomUpButton';
import LabelModeButton from './button/LabelModeButton';
import SelfTimeModeButton from './button/SelfTimeModeButton';
import FlatViewHeader from './header/FlatViewHeader';

export const BottomUpContext = createContext(false);

export interface FlatViewProps {
    data: SamplerData;
    viewData?: FlatViewData;
    setLabelMode: Dispatch<SetStateAction<boolean>>;
}

// The sampler view in which the stack is flattened to the top x nodes
// according to total time or self time.
export default function FlatView({
    data,
    viewData,
    setLabelMode,
}: FlatViewProps) {
    const labelMode = useContext(LabelModeContext);
    const [bottomUp, setBottomUp] = useState(false);
    const [selfTimeMode, setSelfTimeMode] = useState(false);

    const view = selfTimeMode
        ? viewData?.flatSelfTime
        : viewData?.flatTotalTime;
    const roots = useMemo(
        () =>
            view?.map(thread => new FlatThreadVirtualNode(data, thread)) || [],
        [data, view]
    );

    return (
        <div className="flatview">
            <FlatViewHeader>
                <LabelModeButton
                    labelMode={labelMode}
                    setLabelMode={setLabelMode}
                />
                <BottomUpButton bottomUp={bottomUp} setBottomUp={setBottomUp} />
                <SelfTimeModeButton
                    selfTimeMode={selfTimeMode}
                    setSelfTimeMode={setSelfTimeMode}
                />
            </FlatViewHeader>
            <hr />
            {!view ? (
                <TextBox>Loading...</TextBox>
            ) : (
                <BottomUpContext.Provider value={bottomUp}>
                    <Tree roots={roots} reverse={bottomUp} />
                </BottomUpContext.Provider>
            )}
        </div>
    );
}
