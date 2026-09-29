import { type FetchFunction, PantinApiError } from "./api-transport.ts";

// Fake transport shared by the API client tests: no network involved.

interface RecordedRequest {
  url: string;
  init: RequestInit | undefined;
}

export function fakeFetch(response: Response): {
  fetchFunction: FetchFunction;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const fetchFunction: FetchFunction = async (url, init) => {
    requests.push({ url, init });
    return response;
  };
  return { fetchFunction, requests };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function captureError(promise: Promise<unknown>): Promise<PantinApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PantinApiError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected the call to fail.");
}
