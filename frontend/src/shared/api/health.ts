import { apiClient } from './client';

export type HealthResponse = {
  status: string;
};

export function getHealth(): Promise<HealthResponse> {
  return apiClient<HealthResponse>('/health');
}
