export interface LatLng {
  lat: number;
  lng: number;
}

/** A business as returned by Google Maps, normalised to the fields we care about. */
export interface Business {
  placeId: string;
  name: string;
  category: string;
  phone: string;
  website: string;
  address: string;
  rating: number | null;
  reviewCount: number;
  mapsUrl: string;
  location: LatLng;
}

/** A business inside the search radius, scored as an AI-automation prospect. */
export interface Lead extends Business {
  distanceKm: number;
  score: number;
  signals: string[];
}
