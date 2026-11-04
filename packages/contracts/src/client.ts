import {
  BackendRequestSchema,
  BackendResponseSchema,
  type BackendRequest,
  type BackendResponse,
} from './backend.ts';

export type BackendTransport = (request: BackendRequest) => Promise<unknown>;

export class BackendProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackendProtocolError';
  }
}

export function createBackendClient(transport: BackendTransport) {
  return {
    async request(input: BackendRequest): Promise<BackendResponse> {
      const request = BackendRequestSchema.parse(input);
      const rawResponse = await transport(request);
      const response = BackendResponseSchema.parse(rawResponse);

      if (response.requestId !== request.requestId || response.method !== request.method) {
        throw new BackendProtocolError('Backend response correlation did not match the request');
      }

      return response;
    },
  };
}

export type BackendClient = ReturnType<typeof createBackendClient>;
