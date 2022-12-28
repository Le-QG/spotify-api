import { spotifyApi } from "../../utils/spotify";
import { prefix, redis } from "../../utils/redis";
import { Track } from "../../utils/types";
import type { Request, Response } from "express";

type AppCache = {
  expire_at: number;
  access_token: string;
};

type PlaylistCache = {
  tracks_expire_at: number;
};

const hour = 60 * 60 * 1000;
const ignoreCache = process.env.VERCEL ? false : true;
const DEFAULT_PLAYLIST_ID = process.env.PLAYLIST_ID;

export default async (req: Request, res: Response) => {
  const playlistId =
    req.query.playlistId?.toString() ?? DEFAULT_PLAYLIST_ID;
  if (!playlistId) return res.status(400).send({ message: "No playlist ID provided (Param is 'playlistId')" });
  const redisAppKey = `${prefix}:cache`;
  const redisPlaylistKey = `${prefix}:playlist-cache:${playlistId}`;

  console.log();
  if (!spotifyApi) {
    console.error("spotifyApi wasn't defined and request errored");
    return res.status(500).send({ message: "Weird error happened" });
  }

  const cachePipeline = redis.pipeline();
  cachePipeline.hgetall<AppCache>(redisAppKey);
  cachePipeline.hgetall<PlaylistCache>(redisPlaylistKey);
  console.debug("Fetching cache...");
  const _cache = await cachePipeline
    .exec()
    .catch((e) => console.error("Enable to fetch cache :", e));
  const cache: AppCache | null = _cache[0];
  const playlistCache: PlaylistCache | null = _cache[1];

  cache
    ? console.debug("Found app cache")
    : console.debug("App cache was invalid. Fetching access token...");

  let accessToken = "";
  if (!cache || cache.expire_at < Date.now() || ignoreCache) {
    await spotifyApi.refreshAccessToken().then(
      function (data: { body: { access_token: string } }) {
        const fetchedAccessToken = data.body["access_token"];
        console.debug(
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
    const keys = await getCachedTracksKey(playlistId);
    if (keys) {
      const pipeline = redis.pipeline();
      for (const k of keys) {
        pipeline.hgetall(k);
      }
      console.debug("Fetching cached tracks...");
      const tracks = await pipeline.exec().catch(console.error);

      if (tracks) {
        console.debug(`Fetched ${tracks.length} cached tracks...`);
        return res.status(200).send(tracks);
      }
      console.debug(
        "Unable to get cached tracks... Switching to normal no-cache mode"
      );
    }
  }

  if (!accessToken)
    return res
      .status(500)
      .send({ message: "Unable to refresh Spotify access token" });
  spotifyApi.setAccessToken(accessToken);

  console.debug("Fetching playlist...");
  const playlist = await spotifyApi
    .getPlaylist(playlistId)
    .then((d: { body: {} }) => d.body)
    .catch((e: any) => ({
      __error_message: e?.body?.error?.message,
      __errored: true,
    }));
  if (playlist.__errored)
    return res.status(500).send({
      message:
        "Server error while loading the playlist" +
        (playlist.__error_message ? ` (${playlist.__error_message})` : ""),
    });
  console.debug(`Found playlist ${playlistId}`);
  const tracksID = () => {
    var items = playlist["tracks"]["items"];
    return items
      .splice(0, 50)
      .sort(() => (Math.random() < 0.5 ? 1 : -1))
      .map((t: any) => t["track"]["id"]);
  };

  console.debug("Fetching tracks...");
  const tracks = await spotifyApi
    .getTracks(tracksID())
    .then((d: { body: { tracks: Track[] } }) =>
      d.body.tracks.map((t) => ({
        id: t.id,
        name: t.name,
        preview_url: t.preview_url,
        artists: t.artists.map((a) => a.name).join(", "),
      }))
    )
    .catch((e: any) => console.error(e));
  if (!tracks)
    return res
      .status(500)
      .send({ message: "Server error while loading the tracks" });
  console.debug(`Found ${tracks.length} tracks`);

  console.debug("Caching tracks...");

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
    .then(() => console.debug(`Cached ${tracks.length} tracks`))
    .catch(console.error);

  return res
    .setHeader("Cache-Control", "s-maxage=86400")
    .status(200)
    .send(tracks);
};

const getCachedTracksKey = async (playlistId: string) => {
  console.debug("Fetching cached tracks keys...");
  const keys = await redis
    .keys(`${prefix}:playlist:${playlistId}:tracks:*`)
    .catch(console.error);
  keys
    ? console.debug(`Fetched ${keys.length} keys`)
    : console.debug("Unable to get keys... Switching to normal no-cache mode");
  return keys;
};
