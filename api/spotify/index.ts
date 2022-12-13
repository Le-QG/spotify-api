import { spotifyApi } from "../../utils/spotify";
import { prefix, redis } from "../../utils/redis";
import { Track } from "../../utils/types";
import { Request, Response } from "express";

const hour = 60 * 60 * 1000;
const ignoreCache = process.env.VERCEL ? false : true;

type SpotifyCache = {
  expire_at: number;
  tracks_expire_at: number;
  access_token: string;
};

const PLAYLIST_ID = process.env.PLAYLIST_ID ?? "";
export default async (req: Request, res: Response) => {
  console.log();
  if (!spotifyApi) {
    console.error("spotifyApi wasn't defined and request errored");
    return res.status(500).send({ message: "Weird error happened" });
  }

  console.debug("Fetching cache...");
  const cache = ignoreCache
    ? null
    : await redis
        .hgetall<SpotifyCache>(`${prefix}:cache`)
        .then((e) => {
          if (!e) return;
          if (e.expire_at > Date.now() - hour / 12) return e;
        })
        .catch((e) => console.error("Enable to fetch cache :", e));

  cache
    ? console.debug("Found cache")
    : console.debug("Cache was invalid. Fetching access token...");

  let accessToken = "";
  if (!cache) {
    await spotifyApi.refreshAccessToken().then(
      function (data: { body: { access_token: string } }) {
        const fetchedAccessToken = data.body["access_token"];
        console.debug(
          `Found access token ${"*".repeat(fetchedAccessToken.length)}`
        );
        redis.hset("spotify-api:cache", {
          access_token: fetchedAccessToken,
          expire_at: Date.now() + hour,
        } as SpotifyCache);
        accessToken = fetchedAccessToken;
      },
      function (err: any) {
        console.error("Could not refresh access token");
        console.error(err);
      }
    );
  } else {
    if (cache.tracks_expire_at > Date.now()) {
      const keys = await getCachedTracksKey();
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
    accessToken = cache.access_token;
  }

  if (!accessToken)
    return res
      .status(500)
      .send({ message: "Unable to refresh Spotify access token" });
  spotifyApi.setAccessToken(accessToken);

  console.debug("Fetching playlist...");
  const playlist = await spotifyApi
    .getPlaylist(PLAYLIST_ID)
    .then((d: { body: {} }) => d.body)
    .catch((e: any) => {
      console.error(e);
      return res
        .status(500)
        .send({ message: "Server error while loading the playlist" });
    });
  console.debug(`Found playlist ${PLAYLIST_ID}`);

  const tracksID = () => {
    var items = playlist["tracks"]["items"];
    return items
      .splice(0, 25)
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
    .catch((e: any) => {
      console.error(e);
      return res
        .status(500)
        .send({ message: "Server error while getting the tracks" });
    });
  console.debug(`Found ${tracks.length} tracks`);

  console.debug("Caching tracks...");

  const keys = await getCachedTracksKey();

  const pipeline = redis.pipeline();
  if (keys)
    for (const k of keys) {
      pipeline.del(k);
    }
  for (const t of tracks) {
    pipeline.hset(`${prefix}:tracks:${t.id}`, t);
  }
  pipeline.hset(`${prefix}:cache`, {
    tracks_expire_at: Date.now() + hour / 4,
  } as SpotifyCache);
  await pipeline
    .exec()
    .then(() => console.debug(`Cached ${tracks.length} tracks`))
    .catch(console.error);

  return res
    .setHeader("Cache-Control", "s-maxage=86400")
    .status(200)
    .send(tracks);
};

const getCachedTracksKey = async () => {
  console.debug("Fetching caches tracks keys...");
  const keys = await redis.keys(`${prefix}:tracks:*`).catch(console.error);
  keys
    ? console.debug(`Fetched ${keys.length} keys`)
    : console.debug("Unable to get keys... Switching to normal no-cache mode");
  return keys;
};
