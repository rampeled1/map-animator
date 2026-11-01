import type { TransportType } from '../types/index.ts';

export interface TransportMeta {
  id: TransportType;
  label: string;
  category: 'road' | 'foot_cycle' | 'water' | 'air' | 'mountain_rail' | 'military';
  iconName: string;
  is3dDefault?: boolean;
}

export const TRANSPORT_CATEGORIES: Array<{
  id: TransportMeta['category'];
  label: string;
}> = [
  { id: 'road', label: 'Road & Vehicles' },
  { id: 'foot_cycle', label: 'Foot & Bike' },
  { id: 'water', label: 'Water & Surf' },
  { id: 'air', label: 'Aviation' },
  { id: 'mountain_rail', label: 'Mountains & Rail' },
  { id: 'military', label: 'Military Transports' },
];

export const ALL_TRANSPORTS: TransportMeta[] = [
  // Road & Vehicles
  { id: 'car', label: 'Car', category: 'road', iconName: 'Car' },
  { id: 'car_caravan', label: 'Car with Caravan', category: 'road', iconName: 'Car' },
  { id: 'motorhome', label: 'Motor Home', category: 'road', iconName: 'Bus' },
  { id: 'tuktuk', label: 'Tuk-Tuk', category: 'road', iconName: 'Compass' },
  { id: 'pickup', label: 'Pickup Truck', category: 'road', iconName: 'Truck' },
  { id: 'minibus', label: 'Minibus', category: 'road', iconName: 'Bus' },
  { id: 'vwbus', label: 'VW Camper Bus', category: 'road', iconName: 'Bus' },
  { id: 'car_trailer', label: 'Car with Trailer', category: 'road', iconName: 'Car' },
  { id: 'semitruck', label: 'Semi Truck', category: 'road', iconName: 'Truck' },
  { id: 'motorcycle', label: 'Motorcycle', category: 'road', iconName: 'Compass' },
  { id: 'dualsport', label: 'Dual Sport Bike', category: 'road', iconName: 'Compass' },
  { id: '4wd', label: '4WD Off-Road', category: 'road', iconName: 'Compass' },
  { id: 'atv', label: 'ATV Quad', category: 'road', iconName: 'Compass' },
  { id: 'bus', label: 'Coach Bus', category: 'road', iconName: 'Bus' },

  // Foot & Bike
  { id: 'walking', label: 'Walk', category: 'foot_cycle', iconName: 'Footprints' },
  { id: 'hiker', label: 'Hiker with Backpack', category: 'foot_cycle', iconName: 'Footprints' },
  { id: 'winterhike', label: 'Winter Hiker (Snowshoes)', category: 'foot_cycle', iconName: 'Footprints' },
  { id: 'running', label: 'Running', category: 'foot_cycle', iconName: 'Footprints' },
  { id: 'swimming', label: 'Swimming', category: 'foot_cycle', iconName: 'Waves' },
  { id: 'bicycle', label: 'Bicycle', category: 'foot_cycle', iconName: 'Bike' },
  { id: 'mountainbike', label: 'Mountain Bike', category: 'foot_cycle', iconName: 'Bike' },
  { id: 'horse', label: 'Horseback', category: 'foot_cycle', iconName: 'Footprints' },

  // Water & Surf
  { id: 'boat', label: 'Motor Boat', category: 'water', iconName: 'Ship' },
  { id: 'sailboat', label: 'Sailboat', category: 'water', iconName: 'Ship' },
  { id: 'catamaran', label: 'Catamaran', category: 'water', iconName: 'Ship' },
  { id: 'trimaran', label: 'Trimaran', category: 'water', iconName: 'Ship' },
  { id: 'ferry', label: 'Car Ferry', category: 'water', iconName: 'Ship' },
  { id: 'kayak', label: 'Kayak', category: 'water', iconName: 'Ship' },
  { id: 'cruiseship', label: 'Cruise Ship', category: 'water', iconName: 'Ship' },
  { id: 'tallship', label: 'Old Sail Ship', category: 'water', iconName: 'Ship' },
  { id: 'raft', label: 'White-Water Raft', category: 'water', iconName: 'Ship' },
  { id: 'surf', label: 'Surfer', category: 'water', iconName: 'Waves' },

  // Aviation
  { id: 'plane', label: 'Airliner', category: 'air', iconName: 'Plane' },
  { id: 'sportsplane', label: 'Sports Plane', category: 'air', iconName: 'Plane' },
  { id: 'floatplane', label: 'Float Plane', category: 'air', iconName: 'Plane' },
  { id: 'sailplane', label: 'Sailplane (Glider)', category: 'air', iconName: 'Plane' },
  { id: 'helicopter', label: 'Helicopter', category: 'air', iconName: 'Plane' },
  { id: 'drone', label: 'Drone', category: 'air', iconName: 'Plane' },
  { id: 'balloon', label: 'Hot Air Balloon', category: 'air', iconName: 'Compass' },
  { id: 'paraglider', label: 'Paraglider', category: 'air', iconName: 'Plane' },
  { id: 'hangglider', label: 'Hang Glider', category: 'air', iconName: 'Plane' },
  { id: 'paramotor', label: 'Paramotor', category: 'air', iconName: 'Plane' },

  // Mountains & Rail
  { id: 'ski', label: 'Alpine Ski', category: 'mountain_rail', iconName: 'Footprints' },
  { id: 'xcski', label: 'Cross-Country Ski', category: 'mountain_rail', iconName: 'Footprints' },
  { id: 'snowmobile', label: 'Snowmobile', category: 'mountain_rail', iconName: 'Compass' },
  { id: 'cablecar', label: 'Cable Car', category: 'mountain_rail', iconName: 'Train' },
  { id: 'chairlift', label: 'Chairlift', category: 'mountain_rail', iconName: 'Train' },
  { id: 'funicular', label: 'Funicular Railway', category: 'mountain_rail', iconName: 'Train' },
  { id: 'steam_train', label: 'Steam Train', category: 'mountain_rail', iconName: 'Train' },
  { id: 'train', label: 'Train', category: 'mountain_rail', iconName: 'Train' },
  { id: 'speed_train', label: 'High-Speed Bullet Train', category: 'mountain_rail', iconName: 'Train' },

  // Military Transports (Oct 21 changelog)
  { id: 'trooper', label: 'Soldier Patrol (3)', category: 'military', iconName: 'Shield' },
  { id: 'tank', label: 'Battle Tank', category: 'military', iconName: 'Shield' },
  { id: 'armytruck', label: 'Army Truck', category: 'military', iconName: 'Shield' },
  { id: 'battleship', label: 'Battleship', category: 'military', iconName: 'Shield' },
  { id: 'carrier', label: 'Aircraft Carrier', category: 'military', iconName: 'Shield' },
  { id: 'submarine', label: 'Submarine', category: 'military', iconName: 'Shield' },
  { id: 'fighter', label: 'Fighter Jet', category: 'military', iconName: 'Shield' },
  { id: 'bomber', label: 'WWII Bomber', category: 'military', iconName: 'Shield' },
];
