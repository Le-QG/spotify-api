import { Redis } from "@upstash/redis";

export const prefix = "spotify-api"
export const redis = Redis.fromEnv();
