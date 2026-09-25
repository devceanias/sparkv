import { Dispatch, SetStateAction, useState } from 'react';

export interface SearchQuery {
    value: string;
    setValue: Dispatch<SetStateAction<string>>;
}

export default function useSearchQuery(): SearchQuery {
    const [value, setValue] = useState('');

    return {
        value,
        setValue,
    };
}
