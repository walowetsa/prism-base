import { useState } from 'react';

type Props<T> = {
  key: string;
  item: T;
  decoder?: (data: unknown) => T;
  encoder?: (data: T) => string;
};

export const useSessionStorage = <T>({ key, item, decoder, encoder }: Props<T>) => {
  const encodeFn = encoder || JSON.stringify;

  const [state, setState] = useState<T>(() => {
    const store = sessionStorage.getItem(key);
    if (store === null || store === '') {
      sessionStorage.setItem(key, encodeFn(item));
      return item;
    }

    let parsed = JSON.parse(store);
    if (decoder) {
      parsed = decoder(parsed);
    }

    return parsed;
  });

  const setItem = (newValue: T | ((obj: T) => T)) => {
    const valueToStore = newValue instanceof Function ? newValue(state) : newValue;
    sessionStorage.setItem(key, encodeFn(valueToStore));
    setState(valueToStore);
  };

  return [state, setItem] as const;
};

export default useSessionStorage;