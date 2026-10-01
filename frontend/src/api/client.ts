import { client } from '../client/client.gen';
import { NetworkError, ServerError } from './errors';
import { clearToken, getToken } from './token';

// The one place the generated client is configured. Nothing else may set its
// base URL, headers or interceptors.

const LOGIN_PATH = '/api/auth/token';

type UnauthenticatedHandler = () => void;

let onUnauthenticated: UnauthenticatedHandler = () => {};

/** Register what happens after a rejected token is cleared (1.6 routes to Login). */
export function setOnUnauthenticated(handler: UnauthenticatedHandler): void {
  onUnauthenticated = handler;
}

function isLoginRequest(request: Request): boolean {
  return request.method === 'POST' && new URL(request.url).pathname === LOGIN_PATH;
}

let configured = false;

/** Configure the generated client once. Safe to call more than once. */
export function configureClient(baseUrl: string = window.location.origin): typeof client {
  // OpenAPI paths already start with /api, so the base URL is the origin only.
  client.setConfig({ baseUrl });
  if (configured) return client;
  configured = true;

  client.interceptors.request.use((request) => {
    const token = getToken();
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    return request;
  });

  client.interceptors.response.use((response, request) => {
    // Act only on a 401 that answers the token we hold now: not a request sent
    // without a token, a second concurrent 401, or a stale token after re-login.
    const token = getToken();
    if (
      response.status === 401 &&
      !isLoginRequest(request) &&
      token !== null &&
      request.headers.get('Authorization') === `Bearer ${token}`
    ) {
      clearToken();
      onUnauthenticated();
    }
    return response;
  });

  client.interceptors.error.use((error, response, request) => {
    if (request !== undefined && response === undefined && error instanceof TypeError) {
      return new NetworkError(error);
    }
    if (response !== undefined && response.status >= 500) {
      return new ServerError(response.status, error);
    }
    return error;
  });

  return client;
}

export { client };
