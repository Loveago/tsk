export type ProviderType = "MANUAL" | "BIGWINDATA" | "CLICKYFIED";

export interface BigwindataConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  webhookSecret: string;
}

export interface ClickyfiedConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  clientId: string;
  callbackSigningSecret: string;
  mtnVerificationEnabled: boolean;
  notReceivedEnabled: boolean;
}

export interface ProviderRoutingConfig {
  enabled: boolean; // Master switch: if false, everything is manual export
  defaultProvider: ProviderType;
  autoDispatch: boolean; // Dispatch immediately on order creation
  networkRoutes: Record<string, ProviderType>; // e.g. { "MTN": "BIGWINDATA", "TELECEL": "CLICKYFIED", "AIRTELTIGO": "CLICKYFIED", "AIRTELTIGO_ISHARE": "CLICKYFIED", "AIRTELTIGO_BIGTIME": "CLICKYFIED" }
  bigwindata: BigwindataConfig;
  clickyfied: ClickyfiedConfig;
}

export interface BigwindataBundle {
  id: number;
  label: string;
  capacity_gb: number;
  network_code: string;
  network_name: string;
  network_key?: string;
  price: string;
  rawPrice: number;
}

export interface ProviderDispatchResult {
  success: boolean;
  provider: ProviderType;
  providerReference?: string;
  status?: string;
  price?: number | string;
  error?: string;
  raw?: unknown;
}

export interface NumberVerificationResult {
  validNumbers: string[];
  invalidNumbers: string[];
  raw?: unknown;
}
