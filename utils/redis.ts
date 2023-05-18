class Redis {
    redisURL: string;
    redisToken: string;
    constructor({ redisURL, redisToken }: { redisURL: string, redisToken: string }) {
        let url: URL;
        try {
            url = new URL(redisURL)
        }
        catch (e) {
            throw new Error("Invalid redis url provided");
        }
        this.redisURL = url.origin + url.pathname;
        this.redisToken = redisToken;
    }

    public static fromEnv = () => {
        if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) throw new Error("No redis token or url provided");
        return new Redis({
            redisURL: process.env.UPSTASH_REDIS_REST_URL!,
            redisToken: process.env.UPSTASH_REDIS_REST_TOKEN!
        });
    }

    public exec = async (command: string, ...args: string[]) => {
        const res = await fetch(`${this.redisURL}${command}/${args.join("/")}`, {
            headers: {
                Authorization: `Bearer ${this.redisToken}`
            }
        });
        return await res.json();
    }

    public pipeline = () => new Pipeline(this);

    public _pipeline = async (commands: string[][]) => {
        const res = await fetch(`${this.redisURL}pipeline`, {
            method: "POST",
            body: JSON.stringify({ commands }),
            headers: {
                Authorization: `Bearer ${this.redisToken}`
            }
        });
        return await res.json();
    }

    // args is a object with key string and value string
    public hset = (key: string, args: { [key: string]: any }) => {
        return this.exec("hset", key, ...Object.entries(args).flat()) as Promise<number>;
    }

    public hget = (key: string, field: string) => {
        return this.exec("hget", key, field) as Promise<string>;
    }

    public hgetall = (key: string) => {
        return this.exec("hgetall", key) as Promise<{ [key: string]: string }>;
    }

    public del = (key: string) => {
        return this.exec("del", key) as Promise<number>;
    }

    public keys = (pattern: string) => {
        return this.exec("keys", pattern) as Promise<{result: string[]}>;
    }
}

class Pipeline {
    redis: Redis;
    commands: string[][] = [];
    constructor(redis: Redis) {
        this.redis = redis;
    }

    public hset = (key: string, args: { [key: string]: any }) => {
        this.commands.push(["hset", key, ...Object.entries(args).flat()]);
        return this;
    }

    public hget = (key: string, field: string) => {
        this.commands.push(["hget", key, field]);
        return this;
    }

    public hgetall = (key: string) => {
        this.commands.push(["hgetall", key]);
        return this;
    }

    public del = (key: string) => {
        this.commands.push(["del", key]);
        return this;
    }

    // exec all commands in the pipeline
    public exec = async () => {
        const res = await this.redis._pipeline(this.commands);
        this.commands = [];
        return res;
    }
}

export const prefix = "spotify-api";
export const redis = Redis.fromEnv();