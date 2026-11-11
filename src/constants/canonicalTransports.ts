import type { CanonicalTransportType } from '../types/index.ts';
import type { SnapProfile } from '../utils/roadRouter.ts';

export interface CanonicalTransportMeta {
  id: CanonicalTransportType;
  label: string;
  snap: SnapProfile;
  engine: 'osrm' | 'free';
  routingDescription: string;
}

export const CANONICAL_TRANSPORTS: CanonicalTransportMeta[] = [
  { id: 'car', label: 'Car', snap: 'driving', engine: 'osrm', routingDescription: 'Follow Roads' },
  { id: 'walking', label: 'Walk', snap: 'walking', engine: 'osrm', routingDescription: 'Follow Paths' },
  { id: 'bike', label: 'Bike', snap: 'cycling', engine: 'osrm', routingDescription: 'Follow Bike Routes' },
  { id: 'train', label: 'Train', snap: 'off', engine: 'free', routingDescription: 'Free Mode (Rail)' },
  { id: 'boat', label: 'Boat', snap: 'off', engine: 'free', routingDescription: 'Free Mode (Sea)' },
  { id: 'plane', label: 'Plane', snap: 'off', engine: 'free', routingDescription: 'Free Mode (Flight Arc)' },
];

export function getRoutingProfileForTransport(t: CanonicalTransportType): 'driving' | 'cycling' | 'foot' | 'direct' {
  if (t === 'car') return 'driving';
  if (t === 'walking') return 'foot';
  if (t === 'bike') return 'cycling';
  return 'direct';
}
