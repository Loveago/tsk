import { randomBytes } from "crypto";
import type { NetworkProvider } from "./types";

export interface ProviderOrder {
  phoneNumber: string;
  network: NetworkProvider;
  gbAmount: number;
  packageId?: string;
}

export interface ProviderResponse {
  reference: string;
  status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";
  message?: string;
}

export interface ProviderStatus {
  reference: string;
  status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";
  message?: string;
}

export interface DataProvider {
  submitOrder(order: ProviderOrder): Promise<ProviderResponse>;
  checkOrder(reference: string): Promise<ProviderStatus>;
  retryOrder(reference: string): Promise<ProviderResponse>;
}

const FAILURE_REASONS = [
  "Insufficient wallet balance on provider",
  "Invalid subscriber number",
  "Network congestion — please retry",
  "Product not available for this network",
  "Duplicate transaction detected",
];

function makeReference(): string {
  return `REF-${randomBytes(6).toString("hex").toUpperCase()}`;
}

/**
 * Mock provider for development. Simulates the lifecycle:
 * PENDING -> PROCESSING -> SUCCESS (95%) / FAILED (5%).
 */
export class MockDataProvider implements DataProvider {
  async submitOrder(order: ProviderOrder): Promise<ProviderResponse> {
    return {
      reference: makeReference(),
      status: "PENDING",
      message: "Order accepted",
    };
  }

  async checkOrder(reference: string): Promise<ProviderStatus> {
    // Deterministic-ish: mostly success
    const success = Math.random() > 0.05;
    return {
      reference,
      status: success ? "SUCCESS" : "FAILED",
      message: success ? "Delivered" : FAILURE_REASONS[0],
    };
  }

  async retryOrder(reference: string): Promise<ProviderResponse> {
    return this.submitOrder({
      phoneNumber: "0000000000",
      network: "MTN",
      gbAmount: 1,
    });
  }
}

let provider: DataProvider = new MockDataProvider();

export function getProvider(): DataProvider {
  return provider;
}

export function setProvider(p: DataProvider): void {
  provider = p;
}
