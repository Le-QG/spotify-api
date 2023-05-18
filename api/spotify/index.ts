import { spotify } from "../../utils/spotify";
import { prefix, redis } from "../../utils/redis";
import { Track } from "../../utils/types";

type AppCache = {
  expire_at: number;
  access_token: string;
};

type PlaylistCache = {
  tracks_expire_at: number;
};

export const config = {
  runtime: 'edge',
};

const hour = 60 * 60 * 1000;
const ignoreCache = false;
const DEFAULT_PLAYLIST_ID = process.env.PLAYLIST_ID;

export default async (req: Request) => {
  const playlistId = new URL(req.url).searchParams.get("playlistId") ?? DEFAULT_PLAYLIST_ID;
  if (!playlistId) return new Response("No playlistId provided", { status: 400 });
  const redisAppKey = `${prefix}:cache`;
  const redisPlaylistKey = `${prefix}:playlist-cache:${playlistId}`;

  console.log();
  if (!spotify) {
    console.error("spotifyApi wasn't defined and request errored");
    return new Response("Server error", { status: 500 });
  }

  const cachePipeline = redis.pipeline();
  cachePipeline.hgetall(redisAppKey);
  cachePipeline.hgetall(redisPlaylistKey);
  console.log("Fetching cache...");
  const _cache = await cachePipeline
    .exec()
    .catch((e) => console.error("Enable to fetch cache :", e));
  const cache: AppCache | null = _cache[0];
  const playlistCache: PlaylistCache | null = _cache[1];

  cache
    ? console.log("Found app cache")
    : console.log("App cache was invalid. Fetching access token...");

  let accessToken = "";
  if (!cache || cache.expire_at < Date.now() || ignoreCache) {
    await spotify.getAccessToken().then((fetchedAccessToken) => {
      console.log(
        `Found access token ${"*".repeat(fetchedAccessToken.length)}`
      );
      redis.hset("spotify-api:cache", {
        access_token: fetchedAccessToken,
        expire_at: Date.now() + hour,
      } as AppCache);
      accessToken = fetchedAccessToken;
    },
      function (err: any) {
        console.error("Could not refresh access token");
        console.error(err);
      }
    );
  } else accessToken = cache.access_token;
  if (
    !ignoreCache &&
    playlistCache &&
    playlistCache.tracks_expire_at > Date.now()
  ) {
    console.log(
      `Playlist cache is still valid for ${Math.round(
        (playlistCache.tracks_expire_at - Date.now()) / 1000 / 60
      )} minutes`
    );
    const keys = await getCachedTracksKey(playlistId);
    if (keys) {
      const pipeline = redis.pipeline();
      for (const k of keys) {
        pipeline.hgetall(k);
      }
      console.log("Fetching cached tracks...");
      const tracks = await pipeline.exec().catch(console.error);

      if (tracks) {
        console.log(`Fetched ${tracks.length} cached tracks...`);
        return new Response(JSON.stringify(tracks.map((t) => t[1])), {
          headers: {
            "Cache-Control": "s-maxage=86400",
            "Content-Type": "application/json",
          }
        });
      }
      console.log(
        "Unable to get cached tracks... Switching to normal no-cache mode"
      );
    }
  }

  if (!accessToken)
    return new Response("Unable to fetch access token", { status: 500 });

  console.log("Fetching playlist...");
  const playlist = await spotify
    .getPlaylist(playlistId).catch((e: any) => {
      console.error("Unable to fetch playlist :", e);
      return new Response("Unable to fetch playlist", { status: 500 });
    })

  console.log(`Found playlist ${playlistId}`);
  const tracksID = (() => {
    var items = playlist["tracks"]["items"];
    return items
      .splice(0, 50)
      .sort(() => (Math.random() < 0.5 ? 1 : -1))
      .map((t: any) => t["track"]["id"]);
  })();

  console.log(`Fetching tracks ${tracksID.length}...`);
  const tracks = await spotify
    .getTracks(tracksID)
    .then((data: { tracks: Track[] }) =>

      data.tracks.map((t) => ({
        id: t.id,
        name: t.name,
        preview_url: t.preview_url,
        artists: t.artists.map((a) => a.name).join(", "),
      }))
    )
    .catch((e: any) => console.error(e));
  if (!tracks)
    return new Response("Unable to fetch tracks", { status: 500 });
  console.log(`Found ${tracks.length} tracks`);

  console.log("Caching tracks...");

  const keys = await getCachedTracksKey(playlistId);

  const pipeline = redis.pipeline();
  if (keys)
    for (const k of keys) {
      pipeline.del(k);
    }
  for (const t of tracks) {
    pipeline.hset(`${prefix}:playlist:${playlistId}:tracks:${t.id}`, t);
  }
  pipeline.hset(redisPlaylistKey, {
    tracks_expire_at: Date.now() + hour / 10,
  } as PlaylistCache);
  await pipeline
    .exec()
    .then(() => console.log(`Cached ${tracks.length} tracks`))
    .catch(console.error);

  return new Response(JSON.stringify(tracks), {
    headers: {
      "Cache-Control": "s-maxage=86400",
      "Content-Type": "application/json",
    }
  });
};

const getCachedTracksKey = async (playlistId: string) => {
  console.log("Fetching cached tracks keys...");
  const keys = await redis
    .keys(`${prefix}:playlist:${playlistId}:tracks:*`)
    .then((keys) => keys.result)
    .catch(console.error);
  keys
    ? console.log(`Fetched ${keys.length} keys`)
    : console.log("Unable to get keys... Switching to normal no-cache mode");
  return keys;
};
