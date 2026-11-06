import { apiClient } from './client';

export type HealthResponse = {
  status: string;
};

export function getHealth(): Promise<HealthResponse> {
  // Keep connectivity probes short; the general API timeout is longer for mutations.
  return apiClient<HealthResponse>('/health', { timeoutMs: 2000 });
}
