export interface ShipmentInput {
  product: string;
  origin_province: string;
  origin_city: string;
  destination_province: string;
  destination_city: string;
  weightKg: number;
  quantity?: number;
  shipDate: string;
  shippingMode?: string; // "Ocean (container)" | "Air" | "Rail" | "Truck"
  specialRequirements?: string[]; // Refrigerated | Frozen | Standard (ambient) | Fragile | Hazardous | Organic
}