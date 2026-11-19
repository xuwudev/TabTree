import { Archive, BookmarkPlus } from 'lucide-react';
import { useState } from 'react';
import { isWebPage } from '../tabs/parking';
import type { ParkingRequest } from '../tabs/parking';
import type { useParking } from '../tabs/useParking';

interface Props {
  parking: ReturnType<typeof useParking>;
  windowId: number;
}

export function ParkingControls({ parking, windowId }: Props) {
  const [confirmation, setConfirmation] = useState<Extract<ParkingRequest, { action: 'park' }>>();
  if (!parking.available) return null;
  const active = parking.active;
  const count = parking.candidates.length;
  const canSave = active && isWebPage(active.url);

  function confirmParking() {
    if (!active || !canSave || !count) return;
    setConfirmation({
      windowId, action: 'park', anchorId: active.id,
      candidates: parking.candidates.map(({ id, url }) => ({ id, url })),
    });
  }

  return (
    <div className="parking-controls">
      <div>
        <button className="action-row" type="button" disabled={!canSave || !count || parking.busy} onClick={confirmParking}>
          <Archive size={15} aria-hidden /> Park other tabs
        </button>
        <button className="action-row" type="button" disabled={!canSave || parking.busy}
          onClick={() => { if (active) void parking.perform({ action: 'save', windowId, anchorId: active.id }); }}>
          <BookmarkPlus size={15} aria-hidden /> Save page
        </button>
      </div>
      {confirmation && (
        <div className="parking-confirm">
          <p>Save the addresses and close {confirmation.candidates.length} background {confirmation.candidates.length === 1 ? 'tab' : 'tabs'}? Unsaved work in those tabs may be lost.</p>
          <div className="parking-actions">
            <button className="parking-action" type="button" disabled={parking.busy} onClick={() => {
              const request = confirmation;
              setConfirmation(undefined);
              void parking.perform(request);
            }}>Save and close tabs</button>
            <button className="parking-action" type="button" onClick={() => setConfirmation(undefined)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
