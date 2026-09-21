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
    const response = isRecord(error) && isRecord(error.response) ? error.response : undefined;
    const statusCode = typeof response?.status === "number" ? response.status : 0;

    extractHttpErrorMessages(error).forEach((message) => {
      httpStatusErrorHandler?.(message, statusCode);
    });

    return Promise.reject(error);
  },
);

type HttpStatusErrorHandler = (message: string, statusCode: number) => void;
let httpStatusErrorHandler: HttpStatusErrorHandler;
export function injectHttpStatusErrorHandler(handler: HttpStatusErrorHandler) {
  httpStatusErrorHandler = handler;
}

export function extractHttpErrorMessages(error: unknown) {
  const response = isRecord(error) && isRecord(error.response) ? error.response : undefined;
  const data = response && "data" in response ? response.data : undefined;
  const message = isRecord(data) ? data.message : undefined;
  const messages = Array.isArray(message) ? message : [message];
  const validMessages = messages.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );

  return validMessages.length > 0 ? validMessages : ["请求失败，请稍后再试"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
