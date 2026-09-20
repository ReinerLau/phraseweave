import type { AxiosInstance, AxiosResponse } from "axios";

import axios from "axios";

import { getToken } from "~/services/auth";

const backendEndpoint = process.env.BACKEND_ENDPOINT;

export const http: AxiosInstance = axios.create({
  baseURL: backendEndpoint || undefined,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

http.interceptors.request.use(async (config) => {
  const token = await getToken();

  if (token) config.headers.Authorization = `Bearer ${token}`;

  return config;
});

http.interceptors.response.use(
  (response: AxiosResponse) => {
    return response.data;
  },
  (error) => {
    const { message } = error.response.data;
    if (Array.isArray(message)) {
      message.forEach((item) => {
        httpStatusErrorHandler?.(item, error.response.status);
      });
    } else {
      httpStatusErrorHandler?.(message, error.response.status);
    }
    return Promise.reject(error);
  },
);

type HttpStatusErrorHandler = (message: string, statusCode: number) => void;
let httpStatusErrorHandler: HttpStatusErrorHandler;
export function injectHttpStatusErrorHandler(handler: HttpStatusErrorHandler) {
  httpStatusErrorHandler = handler;
}
