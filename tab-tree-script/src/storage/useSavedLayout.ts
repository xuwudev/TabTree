import { useEffect, useState } from 'react';

export function useSavedLayout<T>(
  windowId: number,
  initialLayout: T,
  save: (windowId: number, layout: T) => Promise<void>,
) {
  const [layout, setLayout] = useState(initialLayout);
  const [storageError, setStorageError] = useState<string>();

  useEffect(() => {
    if (layout === initialLayout) return;
    let currentWrite = true;
    void save(windowId, layout).then(
      () => { if (currentWrite) setStorageError(undefined); },
      error => {
        console.error('Could not save TabTree layout', error);
        if (currentWrite) setStorageError('The tab tree could not be saved.');
      },
    );
    return () => { currentWrite = false; };
  }, [windowId, layout, initialLayout, save]);

  return { layout, setLayout, storageError };
}
